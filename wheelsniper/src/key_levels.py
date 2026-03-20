"""
key_levels.py — Key support/resistance levels.

Calculates previous day high/low, previous week high/low,
current month high/low, and identifies support/resistance confluence.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)


def get_key_levels(ticker: str, bb_lower: float = None, bb_upper: float = None,
                   ma_20: float = None, ma_50: float = None) -> Optional[dict]:
    """Get key support/resistance levels for a ticker.

    Args:
        ticker: Stock ticker symbol
        bb_lower: Bollinger Band lower (pass from market_data for confluence calc)
        bb_upper: Bollinger Band upper (pass from market_data for confluence calc)
        ma_20: 20-day MA (pass from market_data for confluence calc)
        ma_50: 50-day MA (pass from market_data for confluence calc)

    Returns dict with PDH/PDL, PWH/PWL, monthly high/low, confluence flags.
    """
    try:
        stock = yf.Ticker(ticker)
        # Fetch ~35 days of daily data (covers previous week + current month)
        hist = stock.history(period="2mo")
        if hist.empty or len(hist) < 3:
            logger.warning(f"Insufficient data for key levels: {ticker}")
            return None

        price = float(hist["Close"].iloc[-1])
        today = hist.index[-1].date() if hasattr(hist.index[-1], "date") else hist.index[-1]

        # Previous day high/low
        pdh = float(hist["High"].iloc[-2])
        pdl = float(hist["Low"].iloc[-2])
        pdh_proximity = abs(price - pdh) / price * 100 if price > 0 else 0
        pdl_proximity = abs(price - pdl) / price * 100 if price > 0 else 0

        # Previous week high/low
        pwh, pwl = _calc_previous_week(hist)

        # Weekly support/resistance proximity (3%)
        at_weekly_support = pwl is not None and abs(price - pwl) / price * 100 <= 3.0
        at_weekly_resistance = pwh is not None and abs(price - pwh) / price * 100 <= 3.0

        # Current month high/low
        monthly_high, monthly_low = _calc_current_month(hist)
        monthly_range_pct = 0
        at_monthly_low = False
        at_monthly_high = False
        if monthly_high and monthly_low and monthly_low > 0:
            monthly_range_pct = round((monthly_high - monthly_low) / monthly_low * 100, 1)
            at_monthly_low = abs(price - monthly_low) / price * 100 <= 5.0
            at_monthly_high = abs(price - monthly_high) / price * 100 <= 5.0

        # Key level summary — nearest support and resistance
        support_levels = [v for v in [pdl, pwl, bb_lower, ma_20] if v is not None and v < price]
        resistance_levels = [v for v in [pdh, pwh, bb_upper, ma_50] if v is not None and v > price]

        nearest_support = max(support_levels) if support_levels else None
        nearest_resistance = min(resistance_levels) if resistance_levels else None

        # Confluence: 2+ levels within 2% of each other
        support_confluence = _check_confluence(support_levels, price)
        resistance_confluence = _check_confluence(resistance_levels, price)

        return {
            "ticker": ticker,
            "price": round(price, 2),
            # Previous day
            "pdh": round(pdh, 2),
            "pdl": round(pdl, 2),
            "pdh_proximity": round(pdh_proximity, 1),
            "pdl_proximity": round(pdl_proximity, 1),
            # Previous week
            "pwh": round(pwh, 2) if pwh else None,
            "pwl": round(pwl, 2) if pwl else None,
            "at_weekly_support": at_weekly_support,
            "at_weekly_resistance": at_weekly_resistance,
            # Current month
            "monthly_high": round(monthly_high, 2) if monthly_high else None,
            "monthly_low": round(monthly_low, 2) if monthly_low else None,
            "monthly_range_pct": monthly_range_pct,
            "at_monthly_low": at_monthly_low,
            "at_monthly_high": at_monthly_high,
            # Summary
            "nearest_support": round(nearest_support, 2) if nearest_support else None,
            "nearest_resistance": round(nearest_resistance, 2) if nearest_resistance else None,
            "support_confluence": support_confluence,
            "resistance_confluence": resistance_confluence,
        }
    except Exception as e:
        logger.error(f"Error calculating key levels for {ticker}: {e}")
        return None


def _calc_previous_week(hist) -> tuple[Optional[float], Optional[float]]:
    """Calculate the high/low of the previous completed trading week."""
    if len(hist) < 6:
        return None, None

    # Get the dates and find the previous Monday-Friday window
    dates = hist.index
    today = dates[-1]

    # Find the weekday of the most recent bar
    if hasattr(today, "weekday"):
        current_weekday = today.weekday()
    else:
        current_weekday = today.weekday()

    # Go back to the start of last week
    # If today is Monday (0), last week ended Friday (-3 days)
    # We need to find last week's Mon-Fri range
    days_since_last_friday = current_weekday + 3 if current_weekday >= 0 else 3
    end_of_prev_week = today - timedelta(days=days_since_last_friday)
    start_of_prev_week = end_of_prev_week - timedelta(days=4)

    # Filter for previous week's data
    mask = (dates >= start_of_prev_week) & (dates <= end_of_prev_week + timedelta(days=1))
    prev_week = hist[mask]

    if prev_week.empty:
        # Fallback: use 5 bars before the last 5
        if len(hist) >= 10:
            prev_week = hist.iloc[-10:-5]
        else:
            return None, None

    return float(prev_week["High"].max()), float(prev_week["Low"].min())


def _calc_current_month(hist) -> tuple[Optional[float], Optional[float]]:
    """Calculate the high/low for the current calendar month."""
    if hist.empty:
        return None, None

    now = datetime.now()
    current_year = now.year
    current_month = now.month

    # Filter for current month's data
    month_data = hist[
        (hist.index.year == current_year) & (hist.index.month == current_month)
    ]

    if month_data.empty:
        return None, None

    return float(month_data["High"].max()), float(month_data["Low"].min())


def _check_confluence(levels: list[float], price: float) -> bool:
    """Check if 2+ levels are within 2% of each other."""
    if len(levels) < 2:
        return False

    sorted_levels = sorted(levels)
    for i in range(len(sorted_levels) - 1):
        pct_diff = abs(sorted_levels[i + 1] - sorted_levels[i]) / price * 100
        if pct_diff <= 2.0:
            return True
    return False
