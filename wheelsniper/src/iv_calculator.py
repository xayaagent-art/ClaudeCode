"""
iv_calculator.py — IV Rank (IVR), IV Percentile (IVP), and HV spread.

Computes IVR using the 52-week high/low of implied volatility,
IVP as the percentile rank of current IV over the last 252 sessions,
and 20-day annualized historical volatility for IV vs HV comparison.
"""

import logging
from typing import Optional

import numpy as np

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


def calculate_ivp_and_hv(
    ticker: str, current_iv: Optional[float] = None,
) -> Optional[dict]:
    """Calculate IV Percentile and 20-day HV for a ticker.

    IVP = % of the last 252 sessions where IV was LOWER than current.
    HV20 = 20-day annualized realized volatility (%).
    Returns dict with: ivp, hv_20, iv_hv_spread, flag, score_adjustment
    or None if data unavailable.
    """
    try:
        import yfinance as yf

        if current_iv is None:
            current_iv = get_current_iv(ticker)
        if current_iv is None:
            return None

        # 252-session IV proxy series (rolling 30-day realized vol, annualized)
        iv_series = get_iv_history(ticker, period="1y")
        if iv_series is None or iv_series.empty:
            return None

        # Use the most recent 252 days
        iv_hist = iv_series.tail(252)
        if len(iv_hist) < 30:
            return None

        below = int((iv_hist < current_iv).sum())
        ivp = round(below / len(iv_hist) * 100, 1)

        # 20-day HV (annualized) from raw prices
        stock = yf.Ticker(ticker)
        hist = stock.history(period="2mo")
        if hist.empty or len(hist) < 21:
            return None

        log_returns = np.log(hist["Close"] / hist["Close"].shift(1)).dropna()
        hv_20 = float(log_returns.tail(20).std() * np.sqrt(252) * 100)

        iv_hv_spread = round(current_iv - hv_20, 1)

        # Flag + score adjustment
        flag = None
        score_adjustment = 0.0
        if iv_hv_spread > 5:
            flag = "\U0001f4ca IV > HV \u2014 options overpriced"
            score_adjustment += 0.3
        elif iv_hv_spread < 0:
            flag = "\u26a0\ufe0f IV < HV \u2014 cheap premium"
            score_adjustment -= 0.5

        # IVP-based score adjustment
        if ivp < 40:
            score_adjustment -= 0.5
        elif ivp > 70:
            score_adjustment += 0.5

        return {
            "ivp": ivp,
            "hv_20": round(hv_20, 1),
            "iv_hv_spread": iv_hv_spread,
            "flag": flag,
            "score_adjustment": round(score_adjustment, 2),
        }

    except Exception as e:
        logger.debug(f"IVP/HV calc failed for {ticker}: {e}")
        return None
