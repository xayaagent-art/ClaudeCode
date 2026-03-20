"""
strike_selector.py — Best strike picker for CSP and CC setups.

Selects the optimal strike given a delta target range and DTE window,
then calculates premium yield. Includes DTE target logic and liquidity filters.
"""

import logging
from datetime import datetime
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Small-cap tickers with relaxed liquidity thresholds
SMALL_CAP_TICKERS = {"BMNU", "ONDS", "TE"}


def select_best_expiry(
    expirations: list[str],
    dte_target: int,
    dte_min: int,
    dte_max: int,
) -> tuple[Optional[str], Optional[int]]:
    """Select expiry closest to dte_target within dte_min/dte_max range.

    Never picks minimum DTE — always picks closest to target.
    Returns (expiry_string, dte) or (None, None).
    """
    today = datetime.now().date()
    scored = []
    for exp in expirations:
        exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        dte = (exp_date - today).days
        if dte_min <= dte <= dte_max:
            score = abs(dte - dte_target)
            scored.append((score, dte, exp))
    if not scored:
        return None, None
    scored.sort(key=lambda x: x[0])
    best = scored[0]
    logger.info(f"DTE selection: target={dte_target}, chose {best[2]} (DTE {best[1]}, "
                f"off by {best[0]} days, from {len(scored)} candidates)")
    return best[2], best[1]


def select_put_strike(
    puts: pd.DataFrame,
    price: float,
    delta_min: float = 0.20,
    delta_max: float = 0.30,
    ticker: str = None,
) -> Optional[dict]:
    """Select the best put strike for a CSP within the delta range.

    yfinance put deltas are typically negative; we compare absolute values.
    Picks the strike closest to the midpoint of the delta range.
    Applies liquidity filters (OI, bid-ask spread).

    Returns dict with: strike, delta, premium, bid, ask, open_interest, volume
    """
    if puts.empty:
        return None

    df = puts.copy()

    if "delta" not in df.columns and "impliedVolatility" not in df.columns:
        logger.warning("No delta or IV data in puts chain")
        return None

    # Filter for OTM puts (strike < current price)
    df = df[df["strike"] < price].copy()
    if df.empty:
        return None

    # Apply liquidity filters
    df, low_liquidity = _apply_liquidity_filter(df, ticker)
    if df.empty:
        logger.info(f"{ticker}: no liquid put strikes found, skipping")
        return None

    # Estimate delta from strike distance if not provided by yfinance
    if "delta" not in df.columns:
        df["est_delta"] = _estimate_put_delta(df, price)
        delta_col = "est_delta"
    else:
        df["abs_delta"] = df["delta"].abs()
        delta_col = "abs_delta"

    # Filter by delta range
    filtered = df[(df[delta_col] >= delta_min) & (df[delta_col] <= delta_max)]

    if filtered.empty:
        target = (delta_min + delta_max) / 2
        df["delta_dist"] = abs(df[delta_col] - target)
        best = df.loc[df["delta_dist"].idxmin()]
    else:
        target = (delta_min + delta_max) / 2
        filtered = filtered.copy()
        filtered["delta_dist"] = abs(filtered[delta_col] - target)
        best = filtered.loc[filtered["delta_dist"].idxmin()]

    premium = _get_premium(best)

    return {
        "strike": float(best["strike"]),
        "delta": round(float(best[delta_col]), 3),
        "premium": premium,
        "bid": float(best.get("bid", 0)),
        "ask": float(best.get("ask", 0)),
        "open_interest": int(best.get("openInterest", 0)),
        "volume": int(best.get("volume", 0)) if pd.notna(best.get("volume")) else 0,
        "iv": round(float(best.get("impliedVolatility", 0)) * 100, 1),
        "low_liquidity": low_liquidity,
    }


def select_call_strike(
    calls: pd.DataFrame,
    price: float,
    delta_max: float = 0.35,
    delta_min: float = 0.25,
    ticker: str = None,
    skip_otm_filter: bool = False,
) -> Optional[dict]:
    """Select the best call strike for a CC within a delta range.

    Picks the OTM call with delta between delta_min and delta_max,
    choosing the strike closest to the midpoint of the range.
    Applies liquidity filters (OI, bid-ask spread).
    If skip_otm_filter=True, allows ATM/ITM calls (for aggressive exit).
    """
    if calls.empty:
        return None

    df = calls.copy()

    # Filter for OTM calls (strike > current price) unless aggressive exit
    if not skip_otm_filter:
        df = df[df["strike"] > price].copy()
    else:
        # For aggressive exit, allow strikes at or slightly below price
        df = df[df["strike"] >= price * 0.95].copy()
    if df.empty:
        return None

    # Apply liquidity filters
    df, low_liquidity = _apply_liquidity_filter(df, ticker)
    if df.empty:
        logger.info(f"{ticker}: no liquid call strikes found, skipping")
        return None

    if "delta" not in df.columns:
        df["est_delta"] = _estimate_call_delta(df, price)
        delta_col = "est_delta"
    else:
        df["abs_delta"] = df["delta"].abs()
        delta_col = "abs_delta"

    # Filter for delta within range
    filtered = df[(df[delta_col] >= delta_min) & (df[delta_col] <= delta_max)]

    if filtered.empty:
        target = (delta_min + delta_max) / 2
        df["delta_dist"] = abs(df[delta_col] - target)
        best = df.loc[df["delta_dist"].idxmin()]
    else:
        target = (delta_min + delta_max) / 2
        filtered = filtered.copy()
        filtered["delta_dist"] = abs(filtered[delta_col] - target)
        best = filtered.loc[filtered["delta_dist"].idxmin()]

    premium = _get_premium(best)

    return {
        "strike": float(best["strike"]),
        "delta": round(float(best[delta_col]), 3),
        "premium": premium,
        "bid": float(best.get("bid", 0)),
        "ask": float(best.get("ask", 0)),
        "open_interest": int(best.get("openInterest", 0)),
        "volume": int(best.get("volume", 0)) if pd.notna(best.get("volume")) else 0,
        "iv": round(float(best.get("impliedVolatility", 0)) * 100, 1),
        "low_liquidity": low_liquidity,
    }


def calculate_yield(premium: float, strike: float, dte: int) -> dict:
    """Calculate premium yield metrics.

    Returns: yield_pct (return on risk), annualized_yield
    """
    if strike <= 0 or dte <= 0:
        return {"yield_pct": 0, "annualized_yield": 0}

    # For CSPs, risk = strike price (cash secured). For CCs, risk = cost basis.
    yield_pct = (premium / strike) * 100
    annualized = yield_pct * (365 / dte)

    return {
        "yield_pct": round(yield_pct, 2),
        "annualized_yield": round(annualized, 1),
    }


def _apply_liquidity_filter(
    df: pd.DataFrame, ticker: str = None,
) -> tuple[pd.DataFrame, bool]:
    """Filter strikes by open interest and bid-ask spread.

    Small caps (BMNU, ONDS, TE) get relaxed thresholds.
    Returns (filtered_df, low_liquidity_flag).
    """
    is_small_cap = ticker in SMALL_CAP_TICKERS if ticker else False
    min_oi = 50 if is_small_cap else 100
    max_spread = 0.35 if is_small_cap else 0.25

    filtered = df.copy()

    # Open interest filter
    if "openInterest" in filtered.columns:
        filtered = filtered[filtered["openInterest"].fillna(0) >= min_oi]

    # Bid-ask spread filter
    if "bid" in filtered.columns and "ask" in filtered.columns:
        bid = filtered["bid"].fillna(0).astype(float)
        ask = filtered["ask"].fillna(0).astype(float)
        mid = (bid + ask) / 2
        spread_pct = (ask - bid) / mid.replace(0, float("nan"))
        filtered = filtered[spread_pct.fillna(1.0) <= max_spread]

    if filtered.empty:
        return filtered, is_small_cap

    return filtered, is_small_cap


def _estimate_put_delta(df: pd.DataFrame, price: float) -> pd.Series:
    """Rough delta estimate for puts based on moneyness.

    OTM puts: delta decreases as strike moves further below price.
    This is a simple linear approximation — real delta requires a pricing model.
    """
    moneyness = (price - df["strike"]) / price
    # Map moneyness 0-20% to delta 0.50-0.05
    delta = 0.50 - (moneyness * 2.25)
    return delta.clip(0.05, 0.50)


def _estimate_call_delta(df: pd.DataFrame, price: float) -> pd.Series:
    """Rough delta estimate for calls based on moneyness."""
    moneyness = (df["strike"] - price) / price
    delta = 0.50 - (moneyness * 2.25)
    return delta.clip(0.05, 0.50)


def _get_premium(option_row) -> float:
    """Get the mid-price premium from bid/ask, falling back to lastPrice."""
    bid = float(option_row.get("bid", 0) or 0)
    ask = float(option_row.get("ask", 0) or 0)
    if bid > 0 and ask > 0:
        return round((bid + ask) / 2, 2)
    return round(float(option_row.get("lastPrice", 0) or 0), 2)
