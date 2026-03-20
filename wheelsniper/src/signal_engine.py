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

import yaml

from src.earnings_filter import has_upcoming_earnings
from src.iv_calculator import calculate_ivr
from src.key_levels import get_key_levels
from src.market_data import get_market_data, get_options_chain, get_vix
from src.strike_selector import calculate_yield, select_call_strike, select_put_strike

logger = logging.getLogger(__name__)


def load_config() -> dict:
    """Load config.yaml."""
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)


def _get_vix_note(vix_level: Optional[float], vix_env: str) -> Optional[str]:
    """Return VIX context note for a signal, or None for normal conditions."""
    if vix_env == "low_vol":
        return "\u26a0\ufe0f Low vol \u2014 premium thin, be selective"
    elif vix_env == "elevated":
        return "\u2705 Elevated vol \u2014 favorable premium environment"
    elif vix_env == "high_fear":
        return "\u26a0\ufe0f High fear \u2014 reduce contract size 20\u201330%"
    return None


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


def scan_csp_signals(config: dict = None) -> list[dict]:
    """Scan watchlist for Cash-Secured Put entry signals."""
    config = config or load_config()
    params = config["signal_params"]
    signals = []

    for ticker in config["watchlist"]:
        signal = evaluate_csp(ticker, params)
        if signal:
            signals.append(signal)

    return signals


def scan_cc_signals(config: dict = None) -> list[dict]:
    """Scan assigned positions for Covered Call entry signals."""
    config = config or load_config()
    params = config["signal_params"]
    positions = config.get("positions", {}) or {}
    signals = []

    for ticker, pos in positions.items():
        if not pos or pos.get("shares", 0) < 100:
            continue
        signal = evaluate_cc(ticker, pos, params)
        if signal:
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

    # 1. Red day check — IVR > 70 overrides
    is_red = data["change_pct"] < 0
    if not is_red:
        if ivr > 70:
            tags.append("\u26a1 Post-catalyst override")
        else:
            return None

    # 2. RSI < 40 — IVR > 65 overrides
    if data["rsi_14"] is not None:
        if data["rsi_14"] >= 40 and ivr <= 65:
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

    # 6. Get options chain (DTE 21-45)
    dte_min = params.get("dte_min", 21)
    dte_max = params.get("dte_max", 45)
    chain = get_options_chain(ticker, dte_min, dte_max)
    if not chain:
        return None

    # 7. Select strike (delta 0.20-0.30)
    delta_min = params.get("csp_delta_min", 0.20)
    delta_max = params.get("csp_delta_max", 0.30)
    strike = select_put_strike(chain["puts"], data["price"], delta_min, delta_max)
    if not strike:
        return None

    # 5. Premium yield >= 1.5%
    yield_info = calculate_yield(strike["premium"], strike["strike"], chain["days_to_expiry"])
    if yield_info["yield_pct"] < 1.5:
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

    return {
        "type": "CSP",
        "ticker": ticker,
        "price": data["price"],
        "change_pct": data["change_pct"],
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
        "breakeven": breakeven,
        "earnings": earnings,
        "tags": tags,
    }


def evaluate_cc(ticker: str, position: dict, params: dict) -> Optional[dict]:
    """Evaluate a single assigned position for CC signal.

    Phase 2A filters + Phase 2B Bollinger/key level/VWAP enhancements.
    EOSE special rule: delta 0.35-0.45, skip RSI check, recovery tag.
    """
    data = get_market_data(ticker)
    if not data:
        return None

    ivr_data = calculate_ivr(ticker)
    if not ivr_data:
        return None

    tags = []
    conviction = position.get("conviction", "medium")
    is_eose = ticker == "EOSE"

    # 1. Green day
    if data["change_pct"] <= 0:
        return None

    # 2. RSI > 60 (EOSE: skip RSI check)
    if not is_eose:
        if data["rsi_14"] is not None and data["rsi_14"] <= 60:
            return None

    if is_eose:
        tags.append("\u26aa Recovery mode \u2014 aggressive CC to lower basis")

    # 7. Earnings blackout (10 days hard block)
    earnings_days = params.get("earnings_blackout_days", 10)
    earnings = has_upcoming_earnings(ticker, earnings_days)
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CC \u2014 earnings in {earnings['days_until']} days")
        return None

    # 5. Get options chain (DTE 21-35)
    cc_dte_min = params.get("cc_dte_min", params.get("dte_min", 21))
    cc_dte_max = params.get("cc_dte_max", 35)
    chain = get_options_chain(ticker, cc_dte_min, cc_dte_max)
    if not chain:
        return None

    # 6. Select strike — EOSE aggressive, others standard
    if is_eose:
        cc_delta_min = 0.35
        cc_delta_max = 0.45
    else:
        cc_delta_min = params.get("cc_delta_min", 0.25)
        cc_delta_max = params.get("cc_delta_max", 0.35)

    strike = select_call_strike(chain["calls"], data["price"], cc_delta_max, cc_delta_min)
    if not strike:
        return None

    # 4. Strike must be above cost basis
    cost_basis = position.get("cost_basis", data["price"])
    if strike["strike"] <= cost_basis:
        return None

    yield_info = calculate_yield(strike["premium"], cost_basis, chain["days_to_expiry"])
    pnl_if_called = round((strike["strike"] - cost_basis) * position.get("shares", 100) + strike["premium"] * 100, 2)

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

    return {
        "type": "CC",
        "ticker": ticker,
        "price": data["price"],
        "change_pct": data["change_pct"],
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
        "shares": position.get("shares", 100),
        "cost_basis": cost_basis,
        "pnl_if_called": pnl_if_called,
        "conviction": conviction,
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
    today = datetime.now().date()
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
