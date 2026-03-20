"""
signal_engine.py — Core signal logic for the Wheel Strategy.

Evaluates each ticker against CSP, CC, close, and roll rules,
then returns actionable signals with full trade details.
"""

import logging
from typing import Optional

import yaml

from src.earnings_filter import has_upcoming_earnings
from src.iv_calculator import calculate_ivr
from src.market_data import get_options_chain, get_stock_snapshot
from src.strike_selector import calculate_yield, select_call_strike, select_put_strike

logger = logging.getLogger(__name__)


def load_config() -> dict:
    """Load config.yaml."""
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)


def scan_csp_signals(config: dict = None) -> list[dict]:
    """Scan watchlist for Cash-Secured Put entry signals.

    CSP fires when:
    - Stock is DOWN on the day
    - IVR > 30
    - Price near 20-day MA support
    - Best strike delta 0.20–0.30
    - DTE 21–35 days
    - No earnings within 7 days
    """
    config = config or load_config()
    params = config["signal_params"]
    signals = []

    for ticker in config["watchlist"]:
        signal = evaluate_csp(ticker, params)
        if signal:
            signals.append(signal)

    return signals


def scan_cc_signals(config: dict = None) -> list[dict]:
    """Scan assigned positions for Covered Call entry signals.

    CC fires when:
    - Stock is UP on the day
    - You hold 100+ shares
    - Price approaching resistance / 50-day MA
    - Best strike delta ≤ 0.20
    - DTE 21–35 days
    - No earnings within 7 days
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
            signals.append(signal)

    return signals


def scan_close_signals(config: dict = None) -> list[dict]:
    """Scan open trades for close/roll signals.

    Close fires when:
    - Position hits 50% of max profit
    - OR within 7 DTE with < 25% profit remaining
    """
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
    """Evaluate a single ticker for CSP signal."""
    # 1. Get stock snapshot
    snap = get_stock_snapshot(ticker)
    if not snap:
        return None

    # Must be a red day
    if snap["change_pct"] >= 0:
        return None

    # 2. Check IVR
    ivr_data = calculate_ivr(ticker)
    if not ivr_data or ivr_data["ivr"] < params["ivr_min"]:
        return None

    # 3. Check proximity to 20-day MA support
    if snap["ma_20"]:
        distance_pct = abs(snap["price"] - snap["ma_20"]) / snap["ma_20"] * 100
        if distance_pct > params["ma_support_pct"]:
            return None
    # If no MA data, skip this check (small-cap / new stock)

    # 4. Check earnings blackout
    earnings = has_upcoming_earnings(ticker, params["earnings_blackout_days"])
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CSP — earnings in {earnings['days_until']} days")
        return None

    # 5. Get options chain and select strike
    chain = get_options_chain(ticker, params["dte_min"], params["dte_max"])
    if not chain:
        return None

    strike = select_put_strike(
        chain["puts"], snap["price"], params["csp_delta_min"], params["csp_delta_max"]
    )
    if not strike:
        return None

    # 6. Calculate yield
    yield_info = calculate_yield(strike["premium"], strike["strike"], chain["days_to_expiry"])

    return {
        "type": "CSP",
        "ticker": ticker,
        "price": snap["price"],
        "change_pct": snap["change_pct"],
        "ivr": ivr_data["ivr"],
        "iv": ivr_data["current_iv"],
        "expiry": chain["expiry"],
        "dte": chain["days_to_expiry"],
        "strike": strike["strike"],
        "delta": strike["delta"],
        "premium": strike["premium"],
        "bid": strike["bid"],
        "ask": strike["ask"],
        "yield_pct": yield_info["yield_pct"],
        "annualized_yield": yield_info["annualized_yield"],
        "earnings": earnings,
    }


def evaluate_cc(ticker: str, position: dict, params: dict) -> Optional[dict]:
    """Evaluate a single assigned position for CC signal."""
    snap = get_stock_snapshot(ticker)
    if not snap:
        return None

    # Must be a green day
    if snap["change_pct"] <= 0:
        return None

    # Check IVR (optional for CC but helpful)
    ivr_data = calculate_ivr(ticker)
    if not ivr_data:
        return None

    # Check proximity to 50-day MA resistance
    if snap["ma_50"]:
        distance_pct = abs(snap["price"] - snap["ma_50"]) / snap["ma_50"] * 100
        if distance_pct > params["ma_resistance_pct"]:
            return None

    # Check earnings blackout
    earnings = has_upcoming_earnings(ticker, params["earnings_blackout_days"])
    if earnings["has_earnings"]:
        logger.info(f"Skipping {ticker} CC — earnings in {earnings['days_until']} days")
        return None

    # Get options chain and select strike
    chain = get_options_chain(ticker, params["dte_min"], params["dte_max"])
    if not chain:
        return None

    strike = select_call_strike(chain["calls"], snap["price"], params["cc_delta_max"])
    if not strike:
        return None

    cost_basis = position.get("cost_basis", snap["price"])
    yield_info = calculate_yield(strike["premium"], cost_basis, chain["days_to_expiry"])

    return {
        "type": "CC",
        "ticker": ticker,
        "price": snap["price"],
        "change_pct": snap["change_pct"],
        "ivr": ivr_data["ivr"],
        "iv": ivr_data["current_iv"],
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
        "earnings": earnings,
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
        # Expired — should have been handled
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
