"""
market_data.py — Live market data via yfinance.

Fetches current price, daily % change, options chains, implied volatility,
and technical indicators (RSI, MACD, MAs, 52W range, VIX).
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# Cache VIX for the duration of a scan cycle to avoid redundant fetches
_vix_cache: dict = {"value": None, "timestamp": None}
_VIX_CACHE_SECONDS = 120


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


def get_market_data(ticker: str) -> Optional[dict]:
    """Fetch comprehensive market data including all technical indicators.

    Returns dict with: price, change_pct, ma_20, ma_50, ma_position,
    rsi_14, macd_line, signal_line, macd_histogram, macd_trend,
    week52_high, week52_low, pct_from_52w_low, vix_level, vix_env
    """
    try:
        stock = yf.Ticker(ticker)

        # Fetch 1 year of data for 52W range + enough for all indicators
        hist = stock.history(period="1y")
        if hist.empty or len(hist) < 60:
            logger.warning(f"Insufficient history for {ticker} ({len(hist) if not hist.empty else 0} days)")
            return None

        closes = hist["Close"]
        price = float(closes.iloc[-1])
        prev_close = float(closes.iloc[-2])
        change_pct = ((price - prev_close) / prev_close) * 100

        # Moving averages (20-day and 50-day SMA)
        ma_20 = float(closes.tail(20).mean()) if len(closes) >= 20 else None
        ma_50 = float(closes.tail(50).mean()) if len(closes) >= 50 else None

        # MA position
        ma_position = _calc_ma_position(price, ma_20, ma_50)

        # RSI (14-period, Wilder smoothing)
        rsi_14 = _calc_rsi(closes, period=14)

        # MACD (12/26/9)
        macd_line, signal_line, macd_histogram = _calc_macd(closes)
        macd_trend = "bullish" if macd_line is not None and signal_line is not None and macd_line > signal_line else "bearish"

        # 52-week range
        week52_high = float(closes.max())
        week52_low = float(closes.min())
        pct_from_52w_low = ((price - week52_low) / week52_low * 100) if week52_low > 0 else 0

        # VIX
        vix_level, vix_env = get_vix()

        return {
            "ticker": ticker,
            "price": round(price, 2),
            "prev_close": round(prev_close, 2),
            "change_pct": round(change_pct, 2),
            "volume": int(hist["Volume"].iloc[-1]),
            # Moving averages
            "ma_20": round(ma_20, 2) if ma_20 else None,
            "ma_50": round(ma_50, 2) if ma_50 else None,
            "ma_position": ma_position,
            # RSI
            "rsi_14": round(rsi_14, 1) if rsi_14 is not None else None,
            # MACD
            "macd_line": round(macd_line, 4) if macd_line is not None else None,
            "signal_line": round(signal_line, 4) if signal_line is not None else None,
            "macd_histogram": round(macd_histogram, 4) if macd_histogram is not None else None,
            "macd_trend": macd_trend,
            # 52-week range
            "week52_high": round(week52_high, 2),
            "week52_low": round(week52_low, 2),
            "pct_from_52w_low": round(pct_from_52w_low, 1),
            # VIX
            "vix_level": vix_level,
            "vix_env": vix_env,
        }
    except Exception as e:
        logger.error(f"Error fetching market data for {ticker}: {e}")
        return None


def _calc_rsi(closes: pd.Series, period: int = 14) -> Optional[float]:
    """Calculate RSI using Wilder's smoothing method."""
    if len(closes) < period + 1:
        return None

    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    # Wilder's smoothing: first value is SMA, then exponential
    avg_gain = gain.iloc[1:period + 1].mean()
    avg_loss = loss.iloc[1:period + 1].mean()

    for i in range(period + 1, len(closes)):
        avg_gain = (avg_gain * (period - 1) + float(gain.iloc[i])) / period
        avg_loss = (avg_loss * (period - 1) + float(loss.iloc[i])) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _calc_macd(
    closes: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal_period: int = 9,
) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Calculate MACD line, signal line, and histogram."""
    if len(closes) < slow + signal_period:
        return None, None, None

    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    histogram = macd_line - signal_line

    return float(macd_line.iloc[-1]), float(signal_line.iloc[-1]), float(histogram.iloc[-1])


def _calc_ma_position(price: float, ma_20: Optional[float], ma_50: Optional[float]) -> str:
    """Determine price position relative to moving averages."""
    if ma_20 is None or ma_50 is None:
        return "unknown"
    if price > ma_20 and price > ma_50:
        return "above_both"
    if price < ma_20 and price < ma_50:
        return "below_both"
    return "between"


def get_vix() -> tuple[Optional[float], str]:
    """Fetch VIX level and classify the vol environment.

    Uses a short cache to avoid redundant fetches during a scan cycle.
    Returns: (vix_level, vix_env)
    """
    global _vix_cache

    # Check cache
    now = datetime.now()
    if (_vix_cache["value"] is not None
            and _vix_cache["timestamp"]
            and (now - _vix_cache["timestamp"]).total_seconds() < _VIX_CACHE_SECONDS):
        return _vix_cache["value"]

    try:
        vix = yf.Ticker("^VIX")
        hist = vix.history(period="5d")
        if hist.empty:
            return None, "unknown"

        vix_level = round(float(hist["Close"].iloc[-1]), 2)

        if vix_level < 15:
            vix_env = "low_vol"
        elif vix_level <= 20:
            vix_env = "normal"
        elif vix_level <= 30:
            vix_env = "elevated"
        else:
            vix_env = "high_fear"

        _vix_cache["value"] = (vix_level, vix_env)
        _vix_cache["timestamp"] = now
        return vix_level, vix_env
    except Exception as e:
        logger.error(f"Error fetching VIX: {e}")
        return None, "unknown"


def get_options_chain(ticker: str, dte_min: int = 21, dte_max: int = 45) -> Optional[dict]:
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
