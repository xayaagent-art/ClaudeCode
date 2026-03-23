"""
earnings_filter.py — Earnings date checker.

Flags tickers with earnings within a configurable blackout window
so the signal engine can skip or warn about them.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import pytz
import yfinance as yf

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")


def get_next_earnings_date(ticker: str) -> Optional[datetime]:
    """Get the next earnings date for a ticker.

    Returns datetime of next earnings, or None if unavailable.
    """
    try:
        stock = yf.Ticker(ticker)
        # yfinance provides earnings dates via the calendar property
        cal = stock.calendar
        if cal is None:
            return None

        # The calendar can be a dict or DataFrame depending on yfinance version
        if isinstance(cal, dict):
            earnings_date = cal.get("Earnings Date")
            if earnings_date:
                if isinstance(earnings_date, list) and len(earnings_date) > 0:
                    return earnings_date[0]
                elif isinstance(earnings_date, datetime):
                    return earnings_date
        else:
            # DataFrame format
            if "Earnings Date" in cal.index:
                val = cal.loc["Earnings Date"]
                if hasattr(val, "iloc"):
                    return val.iloc[0]
                return val

        return None
    except Exception as e:
        logger.debug(f"Could not fetch earnings date for {ticker}: {e}")
        return None


def has_upcoming_earnings(ticker: str, blackout_days: int = 7) -> dict:
    """Check if a ticker has earnings within the blackout window.

    Returns dict with:
        has_earnings: bool — True if earnings are within blackout_days
        earnings_date: str or None — The date string
        days_until: int or None — Days until earnings
    """
    earnings_dt = get_next_earnings_date(ticker)
    if earnings_dt is None:
        return {
            "has_earnings": False,
            "earnings_date": None,
            "days_until": None,
        }

    # Normalize to date for comparison
    if hasattr(earnings_dt, "date"):
        earnings_date = earnings_dt.date()
    else:
        earnings_date = earnings_dt

    today = datetime.now(ET).date()
    days_until = (earnings_date - today).days

    return {
        "has_earnings": 0 <= days_until <= blackout_days,
        "earnings_date": str(earnings_date),
        "days_until": days_until if days_until >= 0 else None,
    }
