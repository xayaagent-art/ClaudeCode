"""
signal_engine.py — Core signal logic for the Wheel Strategy.

Evaluates each ticker against CSP, CC, close, and roll rules,
then returns actionable signals with full trade details.

Phase 2A filter rules:
- CSP: red day (IVR>70 override), RSI<40 (IVR>65 override), IVR>=30,
  bullish MACD (IVR>60 override), yield>=1.5%, DTE 21-45, delta 0.20-0.30,
  no earnings 10d
- CC: green day, RSI>60, 100+ shares, strike>basis, DTE 21-35,
  delta 0.25-0.35, no earnings 10d, EOSE special rule
- VIX overlay on all signals
"""

import logging
from typing import Optional

import yaml

from src.earnings_filter import has_upcoming_earnings
from src.iv_calculator import calculate_ivr
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
    return None  # normal — no note


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

    Filters (all must pass):
    1. Red day — EXCEPT IVR > 70 (post-catalyst override)
    2. RSI < 40 — EXCEPT IVR > 65 (premium override)
    3. IVR >= 30 (hard minimum)
    4. Bullish MACD OR IVR > 60
    5. Premium yield >= 1.5%
    6. DTE 21–45
    7. Delta 0.20–0.30
    8. No earnings within 10 days
    """
    # Get full market data (includes technicals)
    data = get_market_data(ticker)
    if not data:
        return None

    # Check IVR (hard minimum — check early to skip fast)
    ivr_data = calculate_ivr(ticker)
    if not ivr_data or ivr_data["ivr"] < params.get("ivr_min", 30):
        return None

    ivr = ivr_data["ivr"]
    tags = []

    # 1. Red day check — IVR > 70 overrides
    is_red = data["change_pct"] < 0
    is_green = data["change_pct"] >= 0
    if not is_red:
        if ivr > 70:
            tags.append("\u26a1 Post-catalyst override")
        else:
            return None

    # 2. RSI < 40 — IVR > 65 overrides
    if data["rsi_14"] is not None:
        if data["rsi_14"] >= 40 and ivr <= 65:
            return None

    # 3. IVR >= 30 already checked above

    # 4. Bullish MACD OR IVR > 60
    if data["macd_trend"] == "bearish" and ivr <= 60:
        return None

    # 8. Earnings blackout (10 days hard block)
    earnings_days = params.get("earnings_blackout_days", 10)
    earnings = has_upcoming_earnings(ticker, earnings_days)
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CSP \u2014 earnings in {earnings['days_until']} days")
        return None

    # 6. Get options chain (DTE 21–45)
    dte_min = params.get("dte_min", 21)
    dte_max = params.get("dte_max", 45)
    chain = get_options_chain(ticker, dte_min, dte_max)
    if not chain:
        return None

    # 7. Select strike (delta 0.20–0.30)
    delta_min = params.get("csp_delta_min", 0.20)
    delta_max = params.get("csp_delta_max", 0.30)
    strike = select_put_strike(chain["puts"], data["price"], delta_min, delta_max)
    if not strike:
        return None

    # 5. Premium yield >= 1.5%
    yield_info = calculate_yield(strike["premium"], strike["strike"], chain["days_to_expiry"])
    if yield_info["yield_pct"] < 1.5:
        return None

    # Breakeven
    breakeven = round(strike["strike"] - strike["premium"], 2)

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
        "macd_trend": data["macd_trend"],
        "macd_line": data["macd_line"],
        "signal_line": data["signal_line"],
        "ma_20": data["ma_20"],
        "ma_50": data["ma_50"],
        "ma_position": data["ma_position"],
        "week52_high": data["week52_high"],
        "week52_low": data["week52_low"],
        "pct_from_52w_low": data["pct_from_52w_low"],
        "vix_level": data["vix_level"],
        "vix_env": data["vix_env"],
        "vix_note": vix_note,
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

    Filters (all must pass):
    1. Green day
    2. RSI > 60
    3. 100+ shares (already filtered by caller)
    4. Strike > cost basis
    5. DTE 21–35
    6. Delta 0.25–0.35
    7. No earnings within 10 days

    EOSE special rule: delta 0.35–0.45, skip RSI check, add recovery tag.
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

    # 1. Green day (EOSE: any green day regardless)
    if data["change_pct"] <= 0:
        return None

    # 2. RSI > 60 (EOSE: skip RSI check)
    if not is_eose:
        if data["rsi_14"] is not None and data["rsi_14"] <= 60:
            return None

    # EOSE special handling
    if is_eose:
        tags.append("\u26aa Recovery mode \u2014 aggressive CC to lower basis")

    # 7. Earnings blackout (10 days hard block)
    earnings_days = params.get("earnings_blackout_days", 10)
    earnings = has_upcoming_earnings(ticker, earnings_days)
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CC \u2014 earnings in {earnings['days_until']} days")
        return None

    # 5. Get options chain (DTE 21–35)
    cc_dte_min = params.get("cc_dte_min", params.get("dte_min", 21))
    cc_dte_max = params.get("cc_dte_max", 35)
    chain = get_options_chain(ticker, cc_dte_min, cc_dte_max)
    if not chain:
        return None

    # 6. Select strike — EOSE uses aggressive delta 0.35–0.45, others 0.25–0.35
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

    # P&L if called away
    pnl_if_called = round((strike["strike"] - cost_basis) * position.get("shares", 100) + strike["premium"] * 100, 2)

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
        "macd_trend": data["macd_trend"],
        "macd_line": data["macd_line"],
        "signal_line": data["signal_line"],
        "ma_20": data["ma_20"],
        "ma_50": data["ma_50"],
        "ma_position": data["ma_position"],
        "week52_high": data["week52_high"],
        "week52_low": data["week52_low"],
        "vix_level": data["vix_level"],
        "vix_env": data["vix_env"],
        "vix_note": vix_note,
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
    """Evaluate an open trade for close signal.

    Checks current option price against entry premium to determine
    if the 50% profit target or DTE-based close rule is met.
    """
    from datetime import datetime

    from src.market_data import get_options_chain

    ticker = trade["ticker"]
    expiry_date = datetime.strptime(trade["expiry"], "%Y-%m-%d").date()
    today = datetime.now().date()
    dte = (expiry_date - today).days

    if dte < 0:
        return None

    # Fetch current option price
    chain = get_options_chain(ticker, dte_min=0, dte_max=dte + 1)
    if not chain:
        return None

    option_type = "puts" if trade["trade_type"] == "CSP" else "calls"
    options = chain[option_type]
    if options.empty:
        return None

    # Find the matching strike
    match = options[options["strike"] == trade["strike"]]
    if match.empty:
        return None

    row = match.iloc[0]
    current_price = float(row.get("lastPrice", 0))
    if row.get("bid") and row.get("ask"):
        current_price = (float(row["bid"]) + float(row["ask"])) / 2

    open_premium = trade["premium"]
    profit_pct = ((open_premium - current_price) / open_premium) * 100 if open_premium > 0 else 0

    # Rule 1: 50% profit target
    if profit_pct >= params["close_profit_pct"]:
        return _build_close_signal(trade, current_price, profit_pct, dte, reason="50% profit target")

    # Rule 2: Within 7 DTE with < 25% remaining profit
    if dte <= params["close_dte_threshold"] and profit_pct < params["close_dte_profit_pct"]:
        return _build_close_signal(trade, current_price, profit_pct, dte, reason="DTE close rule")

    return None


def _build_close_signal(trade: dict, current_price: float, profit_pct: float, dte: int, reason: str) -> dict:
    """Build a close signal dict."""
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
        "profit_dollars": round((trade["premium"] - current_price) * 100 * trade["quantity"], 2),
        "reason": reason,
    }
