"""
iv_calculator.py — IV Rank (IVR) calculator.

Computes IVR using the 52-week high/low of implied volatility.
IVR tells you where current IV sits relative to its yearly range.
"""

import logging
from typing import Optional

from src.market_data import get_current_iv, get_iv_history

logger = logging.getLogger(__name__)


def calculate_ivr(ticker: str) -> Optional[dict]:
    """Calculate IV Rank for a ticker.

    IVR = (Current IV - 52wk Low IV) / (52wk High IV - 52wk Low IV) * 100

    Returns dict with: current_iv, iv_high, iv_low, ivr
    or None if data is unavailable.
    """
    current_iv = get_current_iv(ticker)
    if current_iv is None:
        logger.warning(f"Cannot get current IV for {ticker}")
        return None

    iv_series = get_iv_history(ticker, period="1y")
    if iv_series is None or iv_series.empty:
        logger.warning(f"Cannot get IV history for {ticker}")
        return None

    iv_high = float(iv_series.max())
    iv_low = float(iv_series.min())

    if iv_high == iv_low:
        ivr = 50.0  # Flat IV, default to middle
    else:
        ivr = ((current_iv - iv_low) / (iv_high - iv_low)) * 100
        ivr = max(0.0, min(100.0, ivr))  # Clamp to 0-100

    return {
        "ticker": ticker,
        "current_iv": round(current_iv, 1),
        "iv_high": round(iv_high, 1),
        "iv_low": round(iv_low, 1),
        "ivr": round(ivr, 1),
    }
