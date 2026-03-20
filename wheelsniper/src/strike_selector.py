"""
strike_selector.py — Best strike picker for CSP and CC setups.

Selects the optimal strike given a delta target range and DTE window,
then calculates premium yield.
"""

import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


def select_put_strike(
    puts: pd.DataFrame,
    price: float,
    delta_min: float = 0.20,
    delta_max: float = 0.30,
) -> Optional[dict]:
    """Select the best put strike for a CSP within the delta range.

    yfinance put deltas are typically negative; we compare absolute values.
    Picks the strike closest to the midpoint of the delta range.

    Returns dict with: strike, delta, premium, bid, ask, open_interest, volume
    """
    if puts.empty:
        return None

    df = puts.copy()

    # Ensure we have an impliedVolatility and delta-like column
    # yfinance doesn't always provide Greeks directly — use impliedVolatility as proxy
    # If delta column missing, estimate from strike distance
    if "delta" not in df.columns and "impliedVolatility" not in df.columns:
        logger.warning("No delta or IV data in puts chain")
        return None

    # Filter for OTM puts (strike < current price)
    df = df[df["strike"] < price].copy()
    if df.empty:
        return None

    # Estimate delta from strike distance if not provided by yfinance
    # Simple approximation: delta ≈ N(-d1), where closer strikes have higher delta
    if "delta" not in df.columns:
        df["est_delta"] = _estimate_put_delta(df, price)
        delta_col = "est_delta"
    else:
        df["abs_delta"] = df["delta"].abs()
        delta_col = "abs_delta"

    # Filter by delta range
    filtered = df[(df[delta_col] >= delta_min) & (df[delta_col] <= delta_max)]

    if filtered.empty:
        # Fall back to closest strike to target delta midpoint
        target = (delta_min + delta_max) / 2
        df["delta_dist"] = abs(df[delta_col] - target)
        best = df.loc[df["delta_dist"].idxmin()]
    else:
        # Pick strike closest to the delta midpoint
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
    }


def select_call_strike(
    calls: pd.DataFrame,
    price: float,
    delta_max: float = 0.20,
) -> Optional[dict]:
    """Select the best call strike for a CC at or below the delta target.

    Picks the OTM call with delta closest to but not exceeding delta_max.
    """
    if calls.empty:
        return None

    df = calls.copy()

    # Filter for OTM calls (strike > current price)
    df = df[df["strike"] > price].copy()
    if df.empty:
        return None

    if "delta" not in df.columns:
        df["est_delta"] = _estimate_call_delta(df, price)
        delta_col = "est_delta"
    else:
        df["abs_delta"] = df["delta"].abs()
        delta_col = "abs_delta"

    # Filter for delta <= max
    filtered = df[df[delta_col] <= delta_max]

    if filtered.empty:
        # Pick the lowest delta available (most OTM)
        best = df.loc[df[delta_col].idxmin()]
    else:
        # Pick the highest delta within the limit (most premium)
        best = filtered.loc[filtered[delta_col].idxmax()]

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
