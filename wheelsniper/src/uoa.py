"""
uoa.py \u2014 Lightweight Unusual Options Activity detection.

Flags tickers where current-chain options volume is meaningfully
above the typical baseline and classifies the activity as
put-dominant or call-dominant. Without order flow data we cannot
distinguish buying from selling, so we report direction only.
"""

import logging
from datetime import datetime
from typing import Optional

import pytz
import yfinance as yf

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

# Cache per-ticker UOA result for 10 minutes to avoid hammering yfinance
_uoa_cache: dict = {}
_UOA_CACHE_SECONDS = 600

# Options volume is typically a small fraction of stock volume.
# 5% is a common rough baseline across liquid US equities.
_OPTIONS_VOLUME_BASELINE_RATIO = 0.05

# Minimum multiple over baseline to flag as unusual
_UOA_THRESHOLD = 3.0

# Put/call volume imbalance threshold (65%+ of one side = directional)
_DIRECTIONAL_THRESHOLD = 0.65


def detect_uoa(ticker: str) -> Optional[dict]:
    """Detect unusual options activity for a ticker.

    Sums today's volume across the 3 nearest expirations in the options chain
    and compares to a baseline derived from the stock's average daily volume.

    Returns dict with:
      unusual: bool
      volume_ratio: float         (current / baseline, e.g. 3.8)
      total_volume: int
      put_volume: int
      call_volume: int
      direction: "put" | "call" | None
      flag: str | None            (short display label for signals)
      score_adjustment_csp: float (applied to CSP signal score)
      score_adjustment_cc: float  (applied to CC signal score)
    or None if data is unavailable.
    """
    global _uoa_cache

    now = datetime.now(ET)
    cached = _uoa_cache.get(ticker)
    if cached and (now - cached["_cached_at"]).total_seconds() < _UOA_CACHE_SECONDS:
        return {k: v for k, v in cached.items() if k != "_cached_at"}

    try:
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        avg_stock_volume = float(
            info.get("averageDailyVolume10Day")
            or info.get("averageVolume")
            or 0
        )
        if avg_stock_volume <= 0:
            return None

        expirations = list(stock.options or [])
        if not expirations:
            return None

        # Sum volume across up to 3 nearest expirations for signal
        total_put_vol = 0
        total_call_vol = 0
        for exp in expirations[:3]:
            try:
                chain = stock.option_chain(exp)
                if chain.puts is not None and not chain.puts.empty:
                    total_put_vol += int(chain.puts["volume"].fillna(0).sum())
                if chain.calls is not None and not chain.calls.empty:
                    total_call_vol += int(chain.calls["volume"].fillna(0).sum())
            except Exception as e:
                logger.debug(f"UOA chain fetch failed for {ticker} {exp}: {e}")
                continue

        total_vol = total_put_vol + total_call_vol
        baseline = avg_stock_volume * _OPTIONS_VOLUME_BASELINE_RATIO
        if baseline <= 0:
            return None

        volume_ratio = round(total_vol / baseline, 2)
        unusual = volume_ratio >= _UOA_THRESHOLD

        # Direction based on put/call volume share
        direction = None
        if total_vol > 0:
            put_share = total_put_vol / total_vol
            if put_share >= _DIRECTIONAL_THRESHOLD:
                direction = "put"
            elif put_share <= (1 - _DIRECTIONAL_THRESHOLD):
                direction = "call"

        flag = None
        score_adjustment_csp = 0.0
        score_adjustment_cc = 0.0
        if unusual and direction:
            flag = f"\U0001f40b WHALE ACTIVITY \u2014 {direction} volume {volume_ratio:.1f}x normal"
            # Without order flow we can only infer direction, not side.
            # Treat put volume surge as bearish pressure (caution on CSP),
            # and call volume surge as bullish pressure (bonus on CC).
            if direction == "put":
                score_adjustment_csp -= 0.5
            elif direction == "call":
                score_adjustment_cc += 0.3

        result = {
            "unusual": unusual,
            "volume_ratio": volume_ratio,
            "total_volume": total_vol,
            "put_volume": total_put_vol,
            "call_volume": total_call_vol,
            "direction": direction,
            "flag": flag,
            "score_adjustment_csp": round(score_adjustment_csp, 2),
            "score_adjustment_cc": round(score_adjustment_cc, 2),
        }
        _uoa_cache[ticker] = {**result, "_cached_at": now}
        return result

    except Exception as e:
        logger.debug(f"UOA detection failed for {ticker}: {e}")
        return None


def format_uoa_alert(ticker: str, uoa: dict, price: Optional[float] = None) -> str:
    """Format a standalone UOA alert for Telegram."""
    now = datetime.now(ET).strftime("%H:%M ET")
    direction = uoa.get("direction") or "mixed"
    ratio = uoa.get("volume_ratio", 0)
    side_label = "Call" if direction == "call" else ("Put" if direction == "put" else "Options")
    watch_for = "CC" if direction == "call" else ("CSP" if direction == "put" else "CSP/CC")
    price_str = f"${price:.2f}" if price else "\u2014"
    sep = "\u2500" * 23
    return (
        f"\U0001f40b UOA ALERT \u2014 {ticker}\n"
        f"{side_label} volume {ratio:.1f}x above avg at {now}\n"
        f"Price: {price_str} \u00b7 This often precedes a move.\n"
        f"{sep}\n"
        f"Watch for {watch_for} opportunity."
    )
