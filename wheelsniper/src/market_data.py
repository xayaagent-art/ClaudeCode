"""
market_data.py — Live market data via yfinance.

Fetches current price, daily % change, options chains, implied volatility,
and technical indicators (RSI, MACD, MAs, Bollinger Bands, VWAP, 52W range, VIX).
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

    Returns dict with all technical indicators including Bollinger Bands,
    RSI divergence, VWAP, and VIX overlay.
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

        # RSI divergence (5-day lookback)
        rsi_divergence = _calc_rsi_divergence(closes, period=14, lookback=5)

        # MACD (12/26/9)
        macd_line, signal_line, macd_histogram = _calc_macd(closes)
        macd_trend = "bullish" if macd_line is not None and signal_line is not None and macd_line > signal_line else "bearish"

        # Bollinger Bands (20-period, 2 std dev)
        bb_upper, bb_lower, bb_width, bb_pct_b, bb_position = _calc_bollinger_bands(closes, price)

        # 52-week range
        week52_high = float(closes.max())
        week52_low = float(closes.min())
        pct_from_52w_low = ((price - week52_low) / week52_low * 100) if week52_low > 0 else 0

        # VWAP (daily, from intraday data)
        vwap, vwap_position = _calc_vwap(ticker, price)

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
            "rsi_divergence": rsi_divergence,
            # MACD
            "macd_line": round(macd_line, 4) if macd_line is not None else None,
            "signal_line": round(signal_line, 4) if signal_line is not None else None,
            "macd_histogram": round(macd_histogram, 4) if macd_histogram is not None else None,
            "macd_trend": macd_trend,
            # Bollinger Bands
            "bb_upper": bb_upper,
            "bb_lower": bb_lower,
            "bb_width": bb_width,
            "bb_pct_b": bb_pct_b,
            "bb_position": bb_position,
            # 52-week range
            "week52_high": round(week52_high, 2),
            "week52_low": round(week52_low, 2),
            "pct_from_52w_low": round(pct_from_52w_low, 1),
            # VWAP
            "vwap": vwap,
            "vwap_position": vwap_position,
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


def _calc_bollinger_bands(
    closes: pd.Series,
    price: float,
    period: int = 20,
    num_std: float = 2.0,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float], str]:
    """Calculate Bollinger Bands (20-period, 2 std dev).

    Returns: (bb_upper, bb_lower, bb_width, bb_pct_b, bb_position)
    """
    if len(closes) < period:
        return None, None, None, None, "unknown"

    sma = float(closes.tail(period).mean())
    std = float(closes.tail(period).std())

    upper = round(sma + num_std * std, 2)
    lower = round(sma - num_std * std, 2)
    width = round((upper - lower) / sma, 4) if sma > 0 else 0
    pct_b = round((price - lower) / (upper - lower), 3) if (upper - lower) > 0 else 0.5

    if pct_b < 0.15:
        position = "at_lower"
    elif pct_b > 0.85:
        position = "at_upper"
    else:
        position = "middle"

    return upper, lower, width, pct_b, position


def _calc_rsi_divergence(closes: pd.Series, period: int = 14, lookback: int = 5) -> str:
    """Detect basic RSI divergence over the last `lookback` days.

    - Bullish divergence: price making lower lows, RSI making higher lows
    - Bearish divergence: price making higher highs, RSI making lower highs
    """
    if len(closes) < period + lookback + 1:
        return "none"

    # Calculate RSI series for the lookback window
    rsi_series = _calc_rsi_series(closes, period)
    if rsi_series is None or len(rsi_series) < lookback:
        return "none"

    recent_prices = closes.iloc[-lookback:]
    recent_rsi = rsi_series.iloc[-lookback:]

    price_start = float(recent_prices.iloc[0])
    price_end = float(recent_prices.iloc[-1])
    rsi_start = float(recent_rsi.iloc[0])
    rsi_end = float(recent_rsi.iloc[-1])

    price_lower_low = price_end < price_start
    rsi_higher_low = rsi_end > rsi_start

    price_higher_high = price_end > price_start
    rsi_lower_high = rsi_end < rsi_start

    if price_lower_low and rsi_higher_low:
        return "bullish_divergence"
    if price_higher_high and rsi_lower_high:
        return "bearish_divergence"
    return "none"


def _calc_rsi_series(closes: pd.Series, period: int = 14) -> Optional[pd.Series]:
    """Calculate a full RSI series (for divergence detection)."""
    if len(closes) < period + 1:
        return None

    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()

    # Wilder smoothing after initial SMA
    for i in range(period + 1, len(closes)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi.dropna()


def _calc_vwap(ticker: str, current_price: float) -> tuple[Optional[float], str]:
    """Calculate daily VWAP from intraday 1-hour bars.

    Returns: (vwap, vwap_position)
    """
    try:
        stock = yf.Ticker(ticker)
        intraday = stock.history(period="1d", interval="1h")
        if intraday.empty or len(intraday) < 2:
            return None, "unknown"

        typical_price = (intraday["High"] + intraday["Low"] + intraday["Close"]) / 3
        vwap = float((typical_price * intraday["Volume"]).sum() / intraday["Volume"].sum())
        vwap = round(vwap, 2)

        position = "above" if current_price > vwap else "below"
        return vwap, position
    except Exception as e:
        logger.debug(f"Could not calculate VWAP for {ticker}: {e}")
        return None, "unknown"


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


def get_options_chain(
    ticker: str, dte_min: int = 21, dte_max: int = 45, dte_target: int = None,
) -> Optional[dict]:
    """Fetch the options chain for the expiration closest to the target DTE.

    Uses select_best_expiry() to pick expiry closest to dte_target
    (not just the minimum DTE in range).

    Returns dict with keys: expiry, puts (DataFrame), calls (DataFrame), days_to_expiry
    or None if no suitable expiration found.
    """
    from src.strike_selector import select_best_expiry

    try:
        stock = yf.Ticker(ticker)
        expirations = stock.options
        if not expirations:
            logger.warning(f"No options expirations for {ticker}")
            return None

        # Use target-based selection if dte_target provided
        if dte_target is not None:
            chosen_expiry, dte = select_best_expiry(
                list(expirations), dte_target, dte_min, dte_max
            )
        else:
            # Legacy fallback: pick closest to midpoint
            mid_target = (dte_min + dte_max) // 2
            chosen_expiry, dte = select_best_expiry(
                list(expirations), mid_target, dte_min, dte_max
            )

        if not chosen_expiry:
            logger.warning(f"No suitable expirations for {ticker} (DTE {dte_min}-{dte_max})")
            return None

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
