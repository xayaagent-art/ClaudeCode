"""
market_data.py — Live market data via yfinance.

Fetches current price, daily % change, options chains, and implied volatility
for watchlist tickers.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


def get_stock_snapshot(ticker: str) -> Optional[dict]:
    """Fetch current price, daily change, and moving averages for a ticker.

    Returns dict with keys: price, change_pct, ma_20, ma_50, volume
    or None if data is unavailable.
    """
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="3mo")
        if hist.empty or len(hist) < 2:
            logger.warning(f"No history data for {ticker}")
            return None

        current = hist.iloc[-1]
        previous = hist.iloc[-2]
        price = float(current["Close"])
        prev_close = float(previous["Close"])
        change_pct = ((price - prev_close) / prev_close) * 100

        ma_20 = float(hist["Close"].tail(20).mean()) if len(hist) >= 20 else None
        ma_50 = float(hist["Close"].tail(50).mean()) if len(hist) >= 50 else None

        return {
            "ticker": ticker,
            "price": round(price, 2),
            "prev_close": round(prev_close, 2),
            "change_pct": round(change_pct, 2),
            "ma_20": round(ma_20, 2) if ma_20 else None,
            "ma_50": round(ma_50, 2) if ma_50 else None,
            "volume": int(current["Volume"]),
        }
    except Exception as e:
        logger.error(f"Error fetching snapshot for {ticker}: {e}")
        return None


def get_options_chain(ticker: str, dte_min: int = 21, dte_max: int = 35) -> Optional[dict]:
    """Fetch the options chain for the expiration closest to the target DTE window.

    Returns dict with keys: expiry, puts (DataFrame), calls (DataFrame), days_to_expiry
    or None if no suitable expiration found.
    """
    try:
        stock = yf.Ticker(ticker)
        expirations = stock.options
        if not expirations:
            logger.warning(f"No options expirations for {ticker}")
            return None

        today = datetime.now().date()
        target_min = today + timedelta(days=dte_min)
        target_max = today + timedelta(days=dte_max)

        # Find expiration dates within the DTE window
        valid_expiries = []
        for exp_str in expirations:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
            if target_min <= exp_date <= target_max:
                valid_expiries.append(exp_str)

        if not valid_expiries:
            # Fall back to the nearest expiration after dte_min
            for exp_str in expirations:
                exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
                if exp_date >= target_min:
                    valid_expiries = [exp_str]
                    break

        if not valid_expiries:
            logger.warning(f"No suitable expirations for {ticker} (DTE {dte_min}-{dte_max})")
            return None

        # Pick the first valid expiration (closest to dte_min)
        chosen_expiry = valid_expiries[0]
        exp_date = datetime.strptime(chosen_expiry, "%Y-%m-%d").date()
        dte = (exp_date - today).days

        chain = stock.option_chain(chosen_expiry)

        return {
            "ticker": ticker,
            "expiry": chosen_expiry,
            "days_to_expiry": dte,
            "puts": chain.puts,
            "calls": chain.calls,
        }
    except Exception as e:
        logger.error(f"Error fetching options chain for {ticker}: {e}")
        return None


def get_iv_history(ticker: str, period: str = "1y") -> Optional[pd.Series]:
    """Fetch historical implied volatility proxy using ATM option IV over time.

    Since yfinance doesn't provide historical IV directly, we use the current
    options chain IV and historical price volatility as a proxy.
    Returns a Series of annualized realized volatility (rolling 30-day).
    """
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)
        if hist.empty or len(hist) < 30:
            return None

        # Calculate rolling 30-day realized volatility as IV proxy
        log_returns = np.log(hist["Close"] / hist["Close"].shift(1))
        rv_30d = log_returns.rolling(window=30).std() * np.sqrt(252) * 100
        return rv_30d.dropna()
    except Exception as e:
        logger.error(f"Error fetching IV history for {ticker}: {e}")
        return None


def get_current_iv(ticker: str) -> Optional[float]:
    """Get the current implied volatility from the nearest ATM option.

    Returns IV as a percentage (e.g., 45.2 for 45.2%).
    """
    try:
        stock = yf.Ticker(ticker)
        price = stock.info.get("regularMarketPrice") or stock.info.get("currentPrice")
        if not price:
            hist = stock.history(period="1d")
            if hist.empty:
                return None
            price = float(hist["Close"].iloc[-1])

        expirations = stock.options
        if not expirations:
            return None

        # Use the nearest monthly expiration (>= 14 days out)
        today = datetime.now().date()
        chosen = None
        for exp_str in expirations:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
            if (exp_date - today).days >= 14:
                chosen = exp_str
                break
        if not chosen:
            chosen = expirations[0]

        chain = stock.option_chain(chosen)
        # Find the ATM put (closest strike to current price)
        puts = chain.puts
        if puts.empty:
            return None

        puts = puts.copy()
        puts["dist"] = abs(puts["strike"] - price)
        atm = puts.loc[puts["dist"].idxmin()]
        iv = float(atm["impliedVolatility"]) * 100
        return round(iv, 1)
    except Exception as e:
        logger.error(f"Error fetching current IV for {ticker}: {e}")
        return None
