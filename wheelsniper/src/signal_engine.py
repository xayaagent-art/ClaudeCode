"""
signal_engine.py — Core signal logic for the Wheel Strategy.

Evaluates each ticker against CSP, CC, close, and roll rules,
then returns actionable signals with full trade details.

Phase 2A filters + Phase 2B enhancements:
- Bollinger Band boost/block on CSP and CC
- Key level support/resistance tags
- VWAP intraday bias overlay
- Time-weighted close thresholds
- Theta acceleration alerts
"""

import logging
from datetime import datetime
from typing import Optional

import pytz
import yaml

ET = pytz.timezone("America/New_York")

from src.earnings_filter import has_upcoming_earnings
from src.iv_calculator import calculate_ivp_and_hv, calculate_ivr
from src.key_levels import get_key_levels
from src.market_data import (
    get_market_data,
    get_options_chain,
    get_premarket_data,
    get_vix,
    get_volume_context,
)
from src.notion_sync import get_premium_timing
from src.sector_guard import check_sector_concentration, record_scan_sector
from src.signal_scorer import score_signal
from src.strike_selector import calculate_yield, select_call_strike, select_put_strike
from src.uoa import detect_uoa

logger = logging.getLogger(__name__)


def load_config() -> dict:
    """Load config.yaml."""
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)


def _get_time_context() -> dict:
    """Return timestamp and time-of-day context for a signal.

    Returns dict with:
      timestamp: "HH:MM ET"
      note: Opening/closing window label, or None
    """
    now = datetime.now(ET)
    timestamp = now.strftime("%H:%M ET")
    hm = now.hour * 60 + now.minute
    note = None
    if 570 <= hm <= 585:        # 9:30 - 9:45 AM
        note = "\U0001f514 Opening volatility window"
    elif 930 <= hm <= 955:      # 3:30 - 3:55 PM
        note = "\U0001f514 End of day premium spike"
    return {"timestamp": timestamp, "note": note}


def _apply_phase5_enrichment(signal: dict, sig_type: str) -> dict:
    """Attach IVP/HV spread + UOA data to a signal.

    Mutates signal in place with: ivp, hv_20, iv_hv_spread, uoa fields.
    Returns dict with:
      adjustment: float        (score delta from IVP/HV + UOA combined)
      flags: list[str]         (TA-style flags to surface in compact format)
    """
    ticker = signal.get("ticker", "")
    current_iv = signal.get("iv")
    adjustment = 0.0
    flags = []

    # IVP + HV spread
    iv_ctx = calculate_ivp_and_hv(ticker, current_iv=current_iv)
    if iv_ctx:
        signal["ivp"] = iv_ctx["ivp"]
        signal["hv_20"] = iv_ctx["hv_20"]
        signal["iv_hv_spread"] = iv_ctx["iv_hv_spread"]
        adjustment += iv_ctx.get("score_adjustment", 0.0)
        if iv_ctx.get("flag"):
            flags.append(iv_ctx["flag"])

    # UOA
    uoa = detect_uoa(ticker)
    if uoa:
        signal["uoa"] = uoa
        if uoa.get("unusual") and uoa.get("flag"):
            flags.append(uoa["flag"])
            if sig_type == "CSP":
                adjustment += uoa.get("score_adjustment_csp", 0.0)
                # Unusual PUT activity confirms SELL-side interest
                # only when combined with strong support — neutral by default
            else:
                adjustment += uoa.get("score_adjustment_cc", 0.0)

    return {"adjustment": round(adjustment, 2), "flags": flags}


def _get_vix_note(vix_level: Optional[float], vix_env: str) -> Optional[str]:
    """Return VIX context note for a signal, or None for normal conditions."""
    if vix_env == "low_vol":
        return "\u26a0\ufe0f Low vol \u2014 premium thin, be selective"
    elif vix_env == "elevated":
        return "\u2705 Elevated vol \u2014 favorable premium environment"
    elif vix_env == "high_fear":
        return "\u26a0\ufe0f High fear \u2014 reduce contract size 20\u201330%"
    return None


# --- Conviction-based CC parameters ---

CC_CONVICTION_RULES = {
    "aggressive_exit": {
        "delta_min": 0.40,
        "delta_max": 0.55,
        "rsi_min": None,       # No RSI requirement
        "cost_basis_check": False,
        "tag": "\U0001f534 AGGRESSIVE EXIT \u2014 selling near ATM",
        "goal": "Goal: exit position ASAP via assignment",
        "skip_otm_filter": True,
    },
    "exit_efficient": {
        "delta_min": 0.30,
        "delta_max": 0.40,
        "rsi_min": 50,
        "cost_basis_check": True,
        "tag": "\U0001f7e0 EFFICIENT EXIT \u2014 targeting assignment",
        "goal": "Goal: exit within 2-3 cycles",
        "skip_otm_filter": False,
    },
    "medium": {
        "delta_min": 0.25,
        "delta_max": 0.35,
        "rsi_min": 55,
        "cost_basis_check": True,
        "tag": "\U0001f7e1 Standard CC",
        "goal": None,
        "skip_otm_filter": False,
    },
    "high": {
        "delta_min": 0.15,
        "delta_max": 0.25,
        "rsi_min": 60,
        "cost_basis_check": True,
        "tag": "\U0001f7e2 Conservative CC \u2014 protecting upside",
        "goal": None,
        "skip_otm_filter": False,
    },
}


def _calc_roi(premium: float, strike: float, dte: int) -> dict:
    """Calculate cycle and annualized ROI with yield flag."""
    if strike <= 0 or dte <= 0:
        return {"cycle_roi": 0, "annualized_roi": 0, "yield_flag": ""}

    cycle_roi = round((premium / strike) * 100, 2)
    annualized_roi = round((cycle_roi / dte) * 365, 1)

    if cycle_roi >= 6:
        yield_flag = "\U0001f680 Exceptional yield"
    elif cycle_roi >= 4:
        yield_flag = "\U0001f4b0 High yield"
    elif cycle_roi >= 2:
        yield_flag = "\u2705 Good yield"
    else:
        yield_flag = ""

    return {
        "cycle_roi": cycle_roi,
        "annualized_roi": annualized_roi,
        "yield_flag": yield_flag,
    }


def _get_time_weighted_target(days_held: int, dte: int) -> int:
    """Return the profit % target based on how long the position has been held.

    - days 1-3:   35% (quick flip)
    - days 4-7:   40%
    - days 8-14:  50% (standard)
    - days 15-21: 25% (take what you can)
    - days >21 or DTE<7: 1% (any profit)
    """
    if days_held > 21 or dte < 7:
        return 1
    if days_held <= 3:
        return 35
    if days_held <= 7:
        return 40
    if days_held <= 14:
        return 50
    return 25


def apply_seller_ta(signal: dict) -> dict:
    """Apply options-seller-specific TA checks to a signal.

    Adds/subtracts score points and TA flags. Runs AFTER base signal fires.
    Returns dict with: ta_adjustment (float), ta_tags (list), suppress (bool).
    """
    sig_type = signal.get("type", "CSP")
    adjustment = 0.0
    ta_tags = []
    suppress = False

    levels = signal.get("levels") or {}
    rsi = signal.get("rsi_14")
    price = signal.get("price", 0)
    strike_val = signal.get("strike", 0)
    vwap = signal.get("vwap")
    vwap_position = signal.get("vwap_position", "unknown")
    macd_trend = signal.get("macd_trend", "")
    bb_width = signal.get("bb_width")
    bb_upper = signal.get("bb_upper")
    bb_lower = signal.get("bb_lower")
    ma_20 = signal.get("ma_20", 0)
    dte = signal.get("dte", 0)
    delta = signal.get("delta", 0)
    pdl = levels.get("pdl")
    pdh = levels.get("pdh")
    pwl = levels.get("pwl")

    if sig_type == "CSP":
        # 1. SUPPORT QUALITY — strike below PDL, PWL, and 20MA
        floors = 0
        if pdl and strike_val < pdl:
            floors += 1
        if pwl and strike_val < pwl:
            floors += 1
        if ma_20 and strike_val < ma_20:
            floors += 1
        if floors >= 3:
            adjustment += 0.5
            ta_tags.append("\U0001f3f0 Triple floor below strike")

        # 2. RSI OVERSOLD BOUNCE — RSI < 35 AND price above PDL
        if rsi is not None and rsi < 35 and pdl and price > pdl:
            adjustment += 0.5
            ta_tags.append("\u26a1 Oversold bounce setup")

        # 3. VWAP RECLAIM — price crossed above VWAP
        if vwap_position == "above" and vwap and price > vwap:
            adjustment += 0.5
            ta_tags.append("\U0001f4c8 VWAP reclaim \u2014 bullish intraday")

        # 4. BREAKDOWN — price < PDL AND price < PWL AND MACD bearish
        if (pdl and pwl and price < pdl and price < pwl
                and macd_trend == "bearish"):
            adjustment -= 2.0
            ta_tags.append("\u26d4 BREAKDOWN \u2014 avoid CSP")
            if (signal.get("score", 0) + adjustment) < 5:
                suppress = True

        # 5. BB SQUEEZE — volatility compressed, IV expansion likely
        if bb_width is not None and bb_lower and bb_upper:
            bb_mid = (bb_upper + bb_lower) / 2
            if bb_mid > 0 and (bb_upper - bb_lower) / bb_mid < 0.15:
                adjustment += 0.5
                ta_tags.append("\U0001f3af BB squeeze \u2014 IV expansion likely")

    else:  # CC
        # 1. RESISTANCE QUALITY — strike above PDH, 20MA, and VWAP
        ceilings = 0
        if pdh and strike_val > pdh:
            ceilings += 1
        if ma_20 and strike_val > ma_20:
            ceilings += 1
        if vwap and strike_val > vwap:
            ceilings += 1
        if ceilings >= 3:
            adjustment += 0.5
            ta_tags.append("\U0001f3f0 Triple ceiling above strike")

        # 2. RSI OVERBOUGHT FADE — RSI > 68 AND price near PDH
        if rsi is not None and rsi > 68 and pdh and abs(price - pdh) / price < 0.02:
            adjustment += 0.5
            ta_tags.append("\U0001f6d1 Overbought \u2014 CC well protected")

        # 3. DELTA SWEET SPOT
        if delta > 0.50:
            ta_tags.append("\u26a0\ufe0f High delta \u2014 aggressive, cap risk high")
        elif 0.30 <= delta <= 0.50:
            ta_tags.append("\u2705 Sweet spot delta")
        elif delta < 0.25:
            ta_tags.append("\U0001f4a4 Low delta \u2014 minimal premium, low risk")

        # 4. BREAKOUT — price > PDH AND RSI > 70 AND MACD bullish
        if (pdh and price > pdh and rsi is not None and rsi > 70
                and macd_trend == "bullish"):
            adjustment -= 2.0
            ta_tags.append("\u26d4 BREAKOUT \u2014 CC strike at risk")
            if (signal.get("score", 0) + adjustment) < 5:
                suppress = True

        # 5. THETA DECAY CURVE — DTE 21-35 is peak theta zone
        if 21 <= dte <= 35:
            adjustment += 0.5
            ta_tags.append("\u23f1\ufe0f Peak theta zone")

    return {
        "ta_adjustment": round(adjustment, 1),
        "ta_tags": ta_tags,
        "suppress": suppress,
    }


def scan_csp_signals(config: dict = None) -> list[dict]:
    """Scan watchlist for Cash-Secured Put entry signals.

    Each signal is scored 1-10. Score data is attached to the signal dict.
    Sector guard: max 1 CSP per sector per scan, suppress if 3+ open in sector.
    """
    config = config or load_config()
    params = config["signal_params"]
    signals = []
    scan_sectors = {}  # Track sectors signaled this scan cycle

    for ticker in config["watchlist"]:
        # Sector concentration check before full evaluation
        sector_check = check_sector_concentration(ticker, scan_sectors)
        if not sector_check["allowed"]:
            logger.info(f"Skipping {ticker} CSP — {sector_check['reason']}")
            continue

        signal = evaluate_csp(ticker, params)
        if signal:
            # Apply seller TA checks (score adjustment + flags)
            ta = apply_seller_ta(signal)
            signal["ta_tags"] = ta["ta_tags"]
            signal["tags"].extend(ta["ta_tags"])

            # Volume context (Upgrade 3A): +0.5 score on SURGE
            vol_ctx = get_volume_context(ticker)
            signal["vol_context"] = vol_ctx
            vol_boost = vol_ctx["score_boost"] if vol_ctx else 0.0

            # Time-of-day context (Upgrade 3B)
            time_ctx = _get_time_context()
            signal["signal_time"] = time_ctx["timestamp"]
            signal["time_note"] = time_ctx["note"]

            # Phase 5: IVP/HV + UOA enrichment
            phase5 = _apply_phase5_enrichment(signal, "CSP")
            signal["ta_tags"].extend(phase5["flags"])
            signal["tags"].extend(phase5["flags"])

            scoring = score_signal(
                signal,
                ta_adjustment=ta["ta_adjustment"] + vol_boost + phase5["adjustment"],
            )
            signal["score"] = scoring["score"]
            signal["score_label"] = scoring["label"]
            signal["score_breakdown"] = scoring["breakdown"]
            signal["should_alert"] = scoring["should_alert"]
            signal["sector"] = sector_check["sector"]

            # Suppress if TA breakdown detected
            if ta["suppress"]:
                signal["should_alert"] = False

            signals.append(signal)
            record_scan_sector(scan_sectors, ticker)

    return signals


def scan_cc_signals(config: dict = None) -> list[dict]:
    """Scan assigned positions for Covered Call entry signals.

    Each signal is scored 1-10. Score data is attached to the signal dict.
    """
    config = config or load_config()
    params = config["signal_params"]
    positions = config.get("positions", {}) or {}
    signals = []

    for ticker, pos in positions.items():
        if not pos or pos.get("shares", 0) < 100:
            continue
        signal = evaluate_cc(ticker, pos, params)
        if signal:
            # Apply seller TA checks (score adjustment + flags)
            ta = apply_seller_ta(signal)
            signal["ta_tags"] = ta["ta_tags"]
            signal["tags"].extend(ta["ta_tags"])

            # Volume context (Upgrade 3A): +0.5 score on SURGE
            vol_ctx = get_volume_context(ticker)
            signal["vol_context"] = vol_ctx
            vol_boost = vol_ctx["score_boost"] if vol_ctx else 0.0

            # Time-of-day context (Upgrade 3B)
            time_ctx = _get_time_context()
            signal["signal_time"] = time_ctx["timestamp"]
            signal["time_note"] = time_ctx["note"]

            # Phase 5: IVP/HV + UOA enrichment
            phase5 = _apply_phase5_enrichment(signal, "CC")
            signal["ta_tags"].extend(phase5["flags"])
            signal["tags"].extend(phase5["flags"])

            scoring = score_signal(
                signal,
                ta_adjustment=ta["ta_adjustment"] + vol_boost + phase5["adjustment"],
            )
            signal["score"] = scoring["score"]
            signal["score_label"] = scoring["label"]
            signal["score_breakdown"] = scoring["breakdown"]
            signal["should_alert"] = scoring["should_alert"]

            # Suppress if TA breakdown detected
            if ta["suppress"]:
                signal["should_alert"] = False

            # Premium timing intelligence for CC
            try:
                timing = get_premium_timing(
                    ticker, signal["strike"], signal["expiry"], "CC",
                )
                if timing.get("timing_tag") and signal["should_alert"]:
                    signal["tags"].append(timing["timing_tag"])
                    signal["premium_timing"] = timing
            except Exception:
                pass

            signals.append(signal)

    return signals


def scan_close_signals(config: dict = None) -> list[dict]:
    """Scan open trades for close/roll signals."""
    from src.position_tracker import get_open_trades

    config = config or load_config()
    params = config["signal_params"]
    signals = []

    for trade in get_open_trades():
        signal = evaluate_close(trade, params)
        if signal:
            signals.append(signal)

    return signals


def evaluate_csp(ticker: str, params: dict) -> Optional[dict]:
    """Evaluate a single ticker for CSP signal.

    Phase 2A filters + Phase 2B Bollinger/key level/VWAP enhancements.
    """
    data = get_market_data(ticker)
    if not data:
        return None

    # Check IVR (hard minimum)
    ivr_data = calculate_ivr(ticker)
    if not ivr_data or ivr_data["ivr"] < params.get("ivr_min", 30):
        return None

    ivr = ivr_data["ivr"]
    tags = []

    # Pre-market boost (active during first scan at 9:35 AM)
    pm_data = get_premarket_data(ticker)
    pm_signal = pm_data["premarket_signal"] if pm_data else "watch"

    # Block if large pre-market move (news risk)
    if pm_signal == "avoid":
        logger.info(f"{ticker} blocked — large pre-market move, verify news")
        return None

    pm_csp_boost = pm_signal == "strong_csp"
    if pm_csp_boost:
        tags.append("\u26a1 Pre-market dip \u2014 elevated IV expected")

    # 1. Red day check — IVR > 70 overrides, IVR >= 60 allows neutral/green day
    is_red = data["change_pct"] < 0
    if not is_red:
        if ivr > 70:
            tags.append("\u26a1 Post-catalyst override")
        elif ivr >= 60:
            tags.append("\u26a1 High IV override \u2014 premium elevated on neutral day")
        else:
            return None

    # 2. RSI < 40 — IVR > 65 overrides, pre-market boost relaxes to < 50
    rsi_threshold = 50 if pm_csp_boost else 40
    if data["rsi_14"] is not None:
        if data["rsi_14"] >= rsi_threshold and ivr <= 65:
            return None

    # 4. Bullish MACD OR IVR > 60
    if data["macd_trend"] == "bearish" and ivr <= 60:
        return None

    # BB block: price near upper band = wrong time for CSP
    if data.get("bb_pct_b") is not None and data["bb_pct_b"] > 0.7:
        return None

    # 8. Earnings blackout (10 days hard block)
    earnings_days = params.get("earnings_blackout_days", 10)
    earnings = has_upcoming_earnings(ticker, earnings_days)
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CSP \u2014 earnings in {earnings['days_until']} days")
        return None

    # 6. Get options chain (DTE target-based selection)
    dte_target = params.get("csp_dte_target", 35)
    dte_min = params.get("csp_dte_min", params.get("dte_min", 30))
    dte_max = params.get("csp_dte_max", params.get("dte_max", 45))
    chain = get_options_chain(ticker, dte_min, dte_max, dte_target=dte_target)
    if not chain:
        return None

    # 7. Select strike (delta 0.20-0.30) with liquidity filter
    delta_min = params.get("csp_delta_min", 0.20)
    delta_max = params.get("csp_delta_max", 0.30)
    strike = select_put_strike(chain["puts"], data["price"], delta_min, delta_max, ticker=ticker)
    if not strike:
        return None

    # 5. Premium yield >= 1.5%
    yield_info = calculate_yield(strike["premium"], strike["strike"], chain["days_to_expiry"])
    if yield_info["yield_pct"] < 1.5:
        return None

    # ROI hard block: CSP cycle_roi >= 2.0%
    roi = _calc_roi(strike["premium"], strike["strike"], chain["days_to_expiry"])
    if roi["cycle_roi"] < 2.0:
        return None

    breakeven = round(strike["strike"] - strike["premium"], 2)

    # --- Phase 2B: Key levels ---
    levels = get_key_levels(
        ticker,
        bb_lower=data.get("bb_lower"),
        bb_upper=data.get("bb_upper"),
        ma_20=data.get("ma_20"),
        ma_50=data.get("ma_50"),
    )

    # BB + RSI confluence tag (highest conviction)
    if data.get("bb_position") == "at_lower" and data.get("rsi_14") is not None and data["rsi_14"] < 40:
        tags.append("\U0001f3af BB lower band + oversold RSI \u2014 HIGH CONVICTION")

    # Key level CSP boost tags
    if levels:
        if levels.get("at_weekly_support"):
            tags.append("\U0001f6e1\ufe0f At weekly support")
        if levels.get("at_monthly_low"):
            tags.append("\U0001f4c5 Near monthly low \u2014 strong support")
        if levels.get("support_confluence"):
            tags.append("\U0001f4aa Support confluence")
        if levels.get("pdl_proximity") is not None and levels["pdl_proximity"] < 2:
            tags.append("\U0001f4cd Near previous day low")

    # VWAP context
    vwap = data.get("vwap")
    vwap_position = data.get("vwap_position", "unknown")

    # VIX overlay
    vix_note = _get_vix_note(data["vix_level"], data["vix_env"])

    # Liquidity warning
    if strike.get("low_liquidity"):
        tags.append("\u26a0\ufe0f Low liquidity \u2014 check spread before trading")

    # Yield flag
    if roi["yield_flag"]:
        tags.append(roi["yield_flag"])

    return {
        "type": "CSP",
        "ticker": ticker,
        "price": data["price"],
        "change_pct": data["change_pct"],
        "change_from_open_pct": data.get("change_from_open_pct", 0.0),
        "today_open": data.get("today_open"),
        "ivr": ivr,
        "iv": ivr_data["current_iv"],
        "rsi_14": data["rsi_14"],
        "rsi_divergence": data.get("rsi_divergence", "none"),
        "macd_trend": data["macd_trend"],
        "macd_line": data["macd_line"],
        "signal_line": data["signal_line"],
        "ma_20": data["ma_20"],
        "ma_50": data["ma_50"],
        "ma_position": data["ma_position"],
        "bb_upper": data.get("bb_upper"),
        "bb_lower": data.get("bb_lower"),
        "bb_width": data.get("bb_width"),
        "bb_pct_b": data.get("bb_pct_b"),
        "bb_position": data.get("bb_position"),
        "vwap": vwap,
        "vwap_position": vwap_position,
        "week52_high": data["week52_high"],
        "week52_low": data["week52_low"],
        "pct_from_52w_low": data["pct_from_52w_low"],
        "vix_level": data["vix_level"],
        "vix_env": data["vix_env"],
        "vix_note": vix_note,
        "levels": levels,
        "expiry": chain["expiry"],
        "dte": chain["days_to_expiry"],
        "strike": strike["strike"],
        "delta": strike["delta"],
        "premium": strike["premium"],
        "bid": strike["bid"],
        "ask": strike["ask"],
        "yield_pct": yield_info["yield_pct"],
        "annualized_yield": yield_info["annualized_yield"],
        "cycle_roi": roi["cycle_roi"],
        "annualized_roi": roi["annualized_roi"],
        "yield_flag": roi["yield_flag"],
        "breakeven": breakeven,
        "earnings": earnings,
        "tags": tags,
    }


def evaluate_cc(ticker: str, position: dict, params: dict) -> Optional[dict]:
    """Evaluate a single assigned position for CC signal.

    Conviction-based CC rules:
    - aggressive_exit: delta 0.40-0.55, no RSI, no cost basis check
    - exit_efficient: delta 0.30-0.40, RSI>50
    - medium: delta 0.25-0.35, RSI>55
    - high: delta 0.15-0.25, RSI>60
    """
    data = get_market_data(ticker)
    if not data:
        return None

    ivr_data = calculate_ivr(ticker)
    if not ivr_data or ivr_data["ivr"] < params.get("cc_ivr_min", 20):
        return None

    tags = []
    conviction = position.get("conviction", "medium")
    rules = CC_CONVICTION_RULES.get(conviction, CC_CONVICTION_RULES["medium"])

    # Pre-market boost (active during first scan at 9:35 AM)
    pm_data = get_premarket_data(ticker)
    pm_signal = pm_data["premarket_signal"] if pm_data else "watch"

    # Block if large pre-market move (news risk)
    if pm_signal == "avoid":
        logger.info(f"{ticker} blocked — large pre-market move, verify news")
        return None

    pm_cc_boost = pm_signal == "strong_cc"
    if pm_cc_boost:
        tags.append("\u26a1 Pre-market strength \u2014 momentum confirmed")

    # 1. Green day (required for all conviction levels)
    if data["change_pct"] <= 0:
        return None

    # 2. RSI check based on conviction (pre-market boost relaxes to > 50)
    rsi_min = rules["rsi_min"]
    if pm_cc_boost and rsi_min is not None:
        rsi_min = min(rsi_min, 50)
    if rsi_min is not None:
        if data["rsi_14"] is not None and data["rsi_14"] <= rsi_min:
            return None

    # Add conviction tag
    tags.append(rules["tag"])
    if rules["goal"]:
        tags.append(rules["goal"])

    # Exit note from config
    exit_note = position.get("exit_note")
    if exit_note and position.get("exit_mode"):
        tags.append(f"\U0001f4dd {exit_note}")

    # 7. Earnings blackout (10 days hard block)
    earnings_days = params.get("earnings_blackout_days", 10)
    earnings = has_upcoming_earnings(ticker, earnings_days)
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CC \u2014 earnings in {earnings['days_until']} days")
        return None

    # 5. Get options chain (DTE target-based selection)
    cc_dte_target = params.get("cc_dte_target", 28)
    cc_dte_min = params.get("cc_dte_min", 21)
    cc_dte_max = params.get("cc_dte_max", 35)
    chain = get_options_chain(ticker, cc_dte_min, cc_dte_max, dte_target=cc_dte_target)
    if not chain:
        return None

    # 6. Select strike based on conviction delta range
    cc_delta_min = rules["delta_min"]
    cc_delta_max = rules["delta_max"]

    strike = select_call_strike(
        chain["calls"], data["price"], cc_delta_max, cc_delta_min,
        ticker=ticker, skip_otm_filter=rules["skip_otm_filter"],
    )
    if not strike:
        return None

    # 4. Strike must be above cost basis (unless aggressive exit)
    cost_basis = position.get("cost_basis", data["price"])
    if rules["cost_basis_check"] and strike["strike"] <= cost_basis:
        return None

    yield_info = calculate_yield(strike["premium"], cost_basis, chain["days_to_expiry"])
    pnl_if_called = round((strike["strike"] - cost_basis) * position.get("shares", 100) + strike["premium"] * 100, 2)

    # ROI hard block: CC cycle_roi >= 1.5%
    roi = _calc_roi(strike["premium"], strike["strike"], chain["days_to_expiry"])
    if roi["cycle_roi"] < 1.5:
        return None

    # --- Phase 2B: Key levels ---
    levels = get_key_levels(
        ticker,
        bb_lower=data.get("bb_lower"),
        bb_upper=data.get("bb_upper"),
        ma_20=data.get("ma_20"),
        ma_50=data.get("ma_50"),
    )

    # BB + RSI confluence tag (highest conviction CC)
    if data.get("bb_position") == "at_upper" and data.get("rsi_14") is not None and data["rsi_14"] > 60:
        tags.append("\U0001f3af BB upper band + overbought RSI")

    # Strike vs BB upper band
    bb_upper = data.get("bb_upper")
    if bb_upper and strike["strike"] > bb_upper:
        tags.append("\u2705 Strike above BB upper \u2014 strong resistance")
    elif bb_upper and strike["strike"] <= bb_upper:
        tags.append("\u26a0\ufe0f Strike below BB upper \u2014 check resistance")

    # Key level CC boost tags
    if levels:
        if levels.get("at_weekly_resistance"):
            tags.append("\U0001f9f1 At weekly resistance")
        if levels.get("at_monthly_high"):
            tags.append("\U0001f4c5 Near monthly high")
        if levels.get("resistance_confluence"):
            tags.append("\U0001f4aa Resistance confluence")
        if levels.get("pdh_proximity") is not None and levels["pdh_proximity"] < 2:
            tags.append("\U0001f4cd Near previous day high")

    # VWAP context
    vwap = data.get("vwap")
    vwap_position = data.get("vwap_position", "unknown")

    # VIX overlay
    vix_note = _get_vix_note(data["vix_level"], data["vix_env"])

    # Liquidity warning
    if strike.get("low_liquidity"):
        tags.append("\u26a0\ufe0f Low liquidity \u2014 check spread before trading")

    # Yield flag
    if roi["yield_flag"]:
        tags.append(roi["yield_flag"])

    return {
        "type": "CC",
        "ticker": ticker,
        "price": data["price"],
        "change_pct": data["change_pct"],
        "change_from_open_pct": data.get("change_from_open_pct", 0.0),
        "today_open": data.get("today_open"),
        "ivr": ivr_data["ivr"],
        "iv": ivr_data["current_iv"],
        "rsi_14": data["rsi_14"],
        "rsi_divergence": data.get("rsi_divergence", "none"),
        "macd_trend": data["macd_trend"],
        "macd_line": data["macd_line"],
        "signal_line": data["signal_line"],
        "ma_20": data["ma_20"],
        "ma_50": data["ma_50"],
        "ma_position": data["ma_position"],
        "bb_upper": data.get("bb_upper"),
        "bb_lower": data.get("bb_lower"),
        "bb_width": data.get("bb_width"),
        "bb_pct_b": data.get("bb_pct_b"),
        "bb_position": data.get("bb_position"),
        "vwap": vwap,
        "vwap_position": vwap_position,
        "week52_high": data["week52_high"],
        "week52_low": data["week52_low"],
        "vix_level": data["vix_level"],
        "vix_env": data["vix_env"],
        "vix_note": vix_note,
        "levels": levels,
        "expiry": chain["expiry"],
        "dte": chain["days_to_expiry"],
        "strike": strike["strike"],
        "delta": strike["delta"],
        "premium": strike["premium"],
        "bid": strike["bid"],
        "ask": strike["ask"],
        "yield_pct": yield_info["yield_pct"],
        "annualized_yield": yield_info["annualized_yield"],
        "cycle_roi": roi["cycle_roi"],
        "annualized_roi": roi["annualized_roi"],
        "yield_flag": roi["yield_flag"],
        "shares": position.get("shares", 100),
        "cost_basis": cost_basis,
        "pnl_if_called": pnl_if_called,
        "conviction": conviction,
        "exit_mode": position.get("exit_mode", False),
        "earnings": earnings,
        "tags": tags,
    }


def evaluate_close(trade: dict, params: dict) -> Optional[dict]:
    """Evaluate an open trade for close signal using time-weighted targets.

    Close thresholds based on days_held:
    - 1-3 days:  35% (quick flip)
    - 4-7 days:  40%
    - 8-14 days: 50% (standard)
    - 15-21 days: 25% (take what you can)
    - >21 days or DTE<7: any profit
    """
    from src.market_data import get_options_chain

    ticker = trade["ticker"]
    expiry_date = datetime.strptime(trade["expiry"], "%Y-%m-%d").date()
    today = datetime.now(ET).date()
    dte = (expiry_date - today).days

    if dte < 0:
        return None

    # Calculate days held
    opened_date = datetime.strptime(trade["opened_date"], "%Y-%m-%d").date()
    days_held = (today - opened_date).days

    # Get time-weighted profit target
    profit_target = _get_time_weighted_target(days_held, dte)

    # Fetch current option price
    chain = get_options_chain(ticker, dte_min=0, dte_max=dte + 1)
    if not chain:
        return None

    option_type = "puts" if trade["trade_type"] == "CSP" else "calls"
    options = chain[option_type]
    if options.empty:
        return None

    match = options[options["strike"] == trade["strike"]]
    if match.empty:
        return None

    row = match.iloc[0]
    current_price = float(row.get("lastPrice", 0))
    if row.get("bid") and row.get("ask"):
        current_price = (float(row["bid"]) + float(row["ask"])) / 2

    open_premium = trade["premium"]
    profit_pct = ((open_premium - current_price) / open_premium) * 100 if open_premium > 0 else 0

    # Estimate daily theta (premium / DTE as rough proxy)
    theta_daily = round(current_price / max(dte, 1), 3) if current_price > 0 else 0
    theta_accelerating = dte <= 21

    signals = []

    # Time-weighted close target hit
    if profit_pct >= profit_target:
        signals.append(_build_close_signal(
            trade, current_price, profit_pct, dte, days_held,
            profit_target, theta_daily, theta_accelerating,
            reason=f"{profit_target}% target hit ({_target_label(days_held, dte)})",
        ))

    # Theta acceleration alert: one-time when DTE crosses below 21
    if dte <= 21 and dte >= 14 and days_held > 0:
        if profit_pct >= 35:
            signals.append(_build_close_signal(
                trade, current_price, profit_pct, dte, days_held,
                profit_target, theta_daily, theta_accelerating,
                reason="theta_acceleration",
            ))

    return signals[0] if signals else None


def _target_label(days_held: int, dte: int) -> str:
    """Human-readable label for the close target tier."""
    if days_held > 21 or dte < 7:
        return "any profit \u2014 expiring soon"
    if days_held <= 3:
        return "quick flip"
    if days_held <= 7:
        return "early close"
    if days_held <= 14:
        return "standard"
    return "time decay \u2014 take profits"


def _build_close_signal(
    trade: dict, current_price: float, profit_pct: float, dte: int,
    days_held: int, profit_target: int, theta_daily: float,
    theta_accelerating: bool, reason: str,
) -> dict:
    """Build a close signal dict with time-weighted fields."""
    return {
        "type": "CLOSE",
        "ticker": trade["ticker"],
        "trade_type": trade["trade_type"],
        "trade_id": trade["id"],
        "strike": trade["strike"],
        "expiry": trade["expiry"],
        "dte": dte,
        "open_premium": trade["premium"],
        "current_price": round(current_price, 2),
        "profit_pct": round(profit_pct, 1),
        "profit_target": profit_target,
        "profit_dollars": round((trade["premium"] - current_price) * 100 * trade["quantity"], 2),
        "days_held": days_held,
        "opened_date": trade["opened_date"],
        "theta_daily": theta_daily,
        "theta_accelerating": theta_accelerating,
        "reason": reason,
    }
