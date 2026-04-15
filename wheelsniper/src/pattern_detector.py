"""
pattern_detector.py — Candlestick + chart pattern detection for entry timing.

Works off a DataFrame of 1-minute bars (as returned by yfinance
ticker.history(period="1d", interval="1m")). All detectors are tolerant of
short histories — they just return False/None when there aren't enough bars.

The two public entry points are:

  detect_patterns(bars)         — scan for double bottom / top, V-bottom, flag
                                  breakout. Returns a dict with flags + score
                                  boost + TA tag.

  check_reversal_confirmation(bars, side) — single-bar reversal check for the
                                  signal gate. Returns {confirmed, pattern}.

Both are pure Python + pandas, no network I/O. Safe to call from any thread.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# --- Single-bar reversal confirmation --------------------------------------

def check_reversal_confirmation(bars, side: str = "long") -> dict:
    """Check if the last 1-minute bar shows a reversal signal.

    Args:
      bars: DataFrame with Open/High/Low/Close/Volume columns, ordered oldest
            to newest. At least 5 bars recommended; 2 is the hard minimum.
      side: "long"  — bullish reversal (for CSP entries after a drop)
            "short" — bearish reversal (for CC entries at a top)

    Returns dict:
      confirmed: bool          — at least one of the three patterns triggered
      pattern:   str           — "reversal_bar" | "hammer" | "shooting_star"
                                 | "volume_climax" | "none"
    """
    if bars is None or len(bars) < 2:
        return {"confirmed": False, "pattern": "none"}

    try:
        last = bars.iloc[-1]
        prev = bars.iloc[-2]
    except Exception:
        return {"confirmed": False, "pattern": "none"}

    last_open = float(last["Open"])
    last_high = float(last["High"])
    last_low = float(last["Low"])
    last_close = float(last["Close"])
    last_volume = float(last["Volume"])
    prev_close = float(prev["Close"])

    candle_range = last_high - last_low
    if candle_range <= 0:
        return {"confirmed": False, "pattern": "none"}

    body = abs(last_close - last_open)
    lower_wick = min(last_open, last_close) - last_low
    upper_wick = last_high - max(last_open, last_close)

    # Average volume across the window (excluding the current bar so a
    # spike on the latest bar actually registers as a spike).
    try:
        avg_volume = float(bars["Volume"].iloc[:-1].mean()) if len(bars) >= 2 else 0.0
    except Exception:
        avg_volume = 0.0

    if side == "long":
        # 1. Green reversal bar: closed higher than open AND higher than
        #    the prior bar's close AND traded on above-average volume.
        is_reversal_bar = (
            last_close > last_open
            and last_close > prev_close
            and avg_volume > 0
            and last_volume > avg_volume
        )

        # 2. Hammer: long lower wick, small body, close in upper half.
        is_hammer = (
            lower_wick > 0.6 * candle_range
            and body < 0.3 * candle_range
            and last_close >= (last_open + last_low) / 2
        )

        # 3. Volume climax: 2x+ average volume with a green close.
        is_volume_climax = (
            avg_volume > 0
            and last_volume > 2 * avg_volume
            and last_close >= last_open
        )

        if is_reversal_bar:
            return {"confirmed": True, "pattern": "reversal_bar"}
        if is_hammer:
            return {"confirmed": True, "pattern": "hammer"}
        if is_volume_climax:
            return {"confirmed": True, "pattern": "volume_climax"}
        return {"confirmed": False, "pattern": "none"}

    # side == "short" — CC entries want a bearish reversal at a top
    is_bear_reversal_bar = (
        last_close < last_open
        and last_close < prev_close
        and avg_volume > 0
        and last_volume > avg_volume
    )

    # Shooting star: long upper wick, small body, close in lower half.
    is_shooting_star = (
        upper_wick > 0.6 * candle_range
        and body < 0.3 * candle_range
        and last_close <= (last_open + last_high) / 2
    )

    is_volume_climax_top = (
        avg_volume > 0
        and last_volume > 2 * avg_volume
        and last_close <= last_open
    )

    if is_bear_reversal_bar:
        return {"confirmed": True, "pattern": "reversal_bar"}
    if is_shooting_star:
        return {"confirmed": True, "pattern": "shooting_star"}
    if is_volume_climax_top:
        return {"confirmed": True, "pattern": "volume_climax"}
    return {"confirmed": False, "pattern": "none"}


# --- Local min/max helpers --------------------------------------------------

def _find_local_minima(values: list, window: int = 2) -> list:
    """Indices of local minima where the value is <= its neighbors within `window`."""
    if len(values) < 2 * window + 1:
        return []
    out = []
    for i in range(window, len(values) - window):
        v = values[i]
        left = values[i - window:i]
        right = values[i + 1:i + window + 1]
        if v <= min(left) and v <= min(right):
            out.append(i)
    return out


def _find_local_maxima(values: list, window: int = 2) -> list:
    if len(values) < 2 * window + 1:
        return []
    out = []
    for i in range(window, len(values) - window):
        v = values[i]
        left = values[i - window:i]
        right = values[i + 1:i + window + 1]
        if v >= max(left) and v >= max(right):
            out.append(i)
    return out


# --- Chart patterns ---------------------------------------------------------

def detect_double_bottom(bars) -> Optional[dict]:
    """Double bottom (W): two similar lows followed by a green bar above midpoint.

    Returns dict with `low1`, `low2`, `midpoint`, `current`, `diff_pct` or None.
    """
    if bars is None or len(bars) < 7:
        return None
    try:
        lows = [float(x) for x in bars["Low"].tolist()]
        closes = [float(x) for x in bars["Close"].tolist()]
    except Exception:
        return None

    minima = _find_local_minima(lows, window=2)
    if len(minima) < 2:
        return None

    low1_idx, low2_idx = minima[-2], minima[-1]
    low1, low2 = lows[low1_idx], lows[low2_idx]
    if low2 <= 0:
        return None
    diff_pct = abs(low1 - low2) / low2 * 100
    if diff_pct > 1.0:
        return None

    # Confirm: we've already seen a bar between the two lows that traded
    # higher (the middle hump of the W), and the most recent close is
    # above the midpoint between the two lows.
    between = closes[low1_idx + 1:low2_idx]
    if not between or max(between) <= max(low1, low2):
        return None

    midpoint = (low1 + low2) / 2 + (max(between) - max(low1, low2)) / 2
    current = closes[-1]
    if current < midpoint:
        return None

    return {
        "low1": round(low1, 2),
        "low2": round(low2, 2),
        "midpoint": round(midpoint, 2),
        "current": round(current, 2),
        "diff_pct": round(diff_pct, 2),
    }


def detect_double_top(bars) -> Optional[dict]:
    """Double top (M): two similar highs followed by a red bar below midpoint."""
    if bars is None or len(bars) < 7:
        return None
    try:
        highs = [float(x) for x in bars["High"].tolist()]
        closes = [float(x) for x in bars["Close"].tolist()]
    except Exception:
        return None

    maxima = _find_local_maxima(highs, window=2)
    if len(maxima) < 2:
        return None

    high1_idx, high2_idx = maxima[-2], maxima[-1]
    high1, high2 = highs[high1_idx], highs[high2_idx]
    if high2 <= 0:
        return None
    diff_pct = abs(high1 - high2) / high2 * 100
    if diff_pct > 1.0:
        return None

    between = closes[high1_idx + 1:high2_idx]
    if not between or min(between) >= min(high1, high2):
        return None

    midpoint = (high1 + high2) / 2 - (min(high1, high2) - min(between)) / 2
    current = closes[-1]
    if current > midpoint:
        return None

    return {
        "high1": round(high1, 2),
        "high2": round(high2, 2),
        "midpoint": round(midpoint, 2),
        "current": round(current, 2),
        "diff_pct": round(diff_pct, 2),
    }


def detect_v_bottom(bars) -> Optional[dict]:
    """V-bottom: sharp drop then sharp recovery (the ASTS pattern).

    - Drop of >3% in any 5-bar window within the last 10 bars.
    - Recovery of >2% in the next 3 bars after that drop.
    """
    if bars is None or len(bars) < 10:
        return None
    try:
        closes = [float(x) for x in bars["Close"].tolist()]
    except Exception:
        return None

    # Look at the last 10 bars — find the 5-bar drop + 3-bar recovery
    lookback = closes[-10:] if len(closes) >= 10 else closes
    if len(lookback) < 8:
        return None

    best = None
    for i in range(len(lookback) - 7):
        start = lookback[i]
        drop_window = lookback[i:i + 5]
        min_idx_rel = min(range(len(drop_window)), key=lambda k: drop_window[k])
        min_price = drop_window[min_idx_rel]
        if start <= 0 or min_price <= 0:
            continue
        drop_pct = (min_price - start) / start * 100
        if drop_pct > -3.0:
            continue

        # Recovery measured from min to current close within next 3 bars
        recovery_end = min(i + 5 + 3, len(lookback))
        recovery_window = lookback[i + 5:recovery_end]
        if not recovery_window:
            continue
        recovery_peak = max(recovery_window)
        recovery_pct = (recovery_peak - min_price) / min_price * 100
        if recovery_pct < 2.0:
            continue

        candidate = {
            "start_price": round(start, 2),
            "min_price": round(min_price, 2),
            "recovery_peak": round(recovery_peak, 2),
            "drop_pct": round(drop_pct, 2),
            "recovery_pct": round(recovery_pct, 2),
        }
        if best is None or candidate["recovery_pct"] > best["recovery_pct"]:
            best = candidate

    return best


def detect_bull_flag_breakout(bars) -> Optional[dict]:
    """Bear flag → bull flag: sharp drop, then tight consolidation forming a floor.

    - Previous 5 bars saw a >2% drop
    - Most recent 5 bars trade in a range < 0.5% of price (consolidation)
    """
    if bars is None or len(bars) < 10:
        return None
    try:
        highs = [float(x) for x in bars["High"].tolist()]
        lows = [float(x) for x in bars["Low"].tolist()]
        closes = [float(x) for x in bars["Close"].tolist()]
    except Exception:
        return None

    recent_high = max(highs[-5:])
    recent_low = min(lows[-5:])
    last_close = closes[-1]
    if last_close <= 0:
        return None

    range_pct = (recent_high - recent_low) / last_close * 100
    if range_pct >= 0.5:
        return None

    prior_start = closes[-10]
    prior_end = closes[-5]
    if prior_start <= 0:
        return None
    prior_drop_pct = (prior_end - prior_start) / prior_start * 100
    if prior_drop_pct > -2.0:
        return None

    return {
        "range_pct": round(range_pct, 2),
        "prior_drop_pct": round(prior_drop_pct, 2),
        "consolidation_high": round(recent_high, 2),
        "consolidation_low": round(recent_low, 2),
    }


# --- Public scorer ----------------------------------------------------------

def detect_patterns(bars) -> dict:
    """Run all chart-pattern detectors and return a combined score boost.

    Returns dict with:
      double_bottom:      dict | None
      double_top:         dict | None
      v_bottom:           dict | None
      bull_flag_breakout: dict | None
      score_boost:        float  (sum of boosts, capped at +1.5)
      flags:              list[str]  (emoji-tagged strings for signal['tags'])
    """
    out = {
        "double_bottom": None,
        "double_top": None,
        "v_bottom": None,
        "bull_flag_breakout": None,
        "score_boost": 0.0,
        "flags": [],
    }
    if bars is None or len(bars) < 7:
        return out

    try:
        db = detect_double_bottom(bars)
        if db:
            out["double_bottom"] = db
            out["score_boost"] += 1.0
            out["flags"].append("\U0001f4ca Double bottom")

        dt = detect_double_top(bars)
        if dt:
            out["double_top"] = dt
            out["score_boost"] += 1.0
            out["flags"].append("\U0001f4ca Double top")

        vb = detect_v_bottom(bars)
        if vb:
            out["v_bottom"] = vb
            out["score_boost"] += 0.5
            out["flags"].append("\U0001f4c9\U0001f4c8 V-bottom confirmed")

        bf = detect_bull_flag_breakout(bars)
        if bf:
            out["bull_flag_breakout"] = bf
            out["flags"].append("\U0001f6a9 Flag breakout forming")
    except Exception as e:
        logger.debug(f"Pattern detection error: {e}")

    out["score_boost"] = min(out["score_boost"], 1.5)
    return out
