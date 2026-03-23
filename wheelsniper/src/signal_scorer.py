"""
signal_scorer.py — Score signals 1-10 based on technical indicators.

Only signals scoring 6+ get Telegram alerts.
Scores 5 are logged silently. Below 5 are ignored.
"""

import logging

logger = logging.getLogger(__name__)


def score_signal(signal: dict) -> dict:
    """Score a signal 1-10 based on technical indicators.

    Returns dict with: score, breakdown, label, should_alert, should_log
    """
    signal_type = signal.get("type", "CSP")
    breakdown = {}
    total = 0.0

    # IVR (max 2.5 pts)
    ivr = signal.get("ivr", 0)
    if ivr >= 60:
        pts = 2.5
    elif ivr >= 50:
        pts = 2.0
    elif ivr >= 40:
        pts = 1.5
    elif ivr >= 30:
        pts = 1.0
    else:
        pts = 0.0
    breakdown["ivr"] = pts
    total += pts

    # RSI (max 2.0 pts)
    rsi = signal.get("rsi_14")
    if rsi is not None:
        if signal_type == "CSP":
            if rsi < 30:
                pts = 2.0
            elif rsi < 35:
                pts = 1.5
            elif rsi < 40:
                pts = 1.0
            elif rsi < 45:
                pts = 0.5
            else:
                pts = 0.0
        else:  # CC
            if rsi > 70:
                pts = 2.0
            elif rsi > 65:
                pts = 1.5
            elif rsi > 60:
                pts = 1.0
            elif rsi > 55:
                pts = 0.5
            else:
                pts = 0.0
    else:
        pts = 0.0
    breakdown["rsi"] = pts
    total += pts

    # BB %B (max 1.5 pts)
    bb_pct_b = signal.get("bb_pct_b")
    if bb_pct_b is not None:
        if signal_type == "CSP":
            if bb_pct_b < 0.10:
                pts = 1.5
            elif bb_pct_b < 0.20:
                pts = 1.0
            elif bb_pct_b < 0.30:
                pts = 0.5
            else:
                pts = 0.0
        else:  # CC
            if bb_pct_b > 0.90:
                pts = 1.5
            elif bb_pct_b > 0.80:
                pts = 1.0
            elif bb_pct_b > 0.70:
                pts = 0.5
            else:
                pts = 0.0
    else:
        pts = 0.0
    breakdown["bb"] = pts
    total += pts

    # Key level confluence (max 1.5 pts)
    levels = signal.get("levels") or {}
    confluence_count = 0
    if levels.get("support_confluence") or levels.get("resistance_confluence"):
        confluence_count = 3
    else:
        for key in ["at_weekly_support", "at_weekly_resistance", "at_monthly_low",
                     "at_monthly_high", "pdl_proximity", "pdh_proximity"]:
            val = levels.get(key)
            if val is True or (isinstance(val, (int, float)) and val < 3):
                confluence_count += 1

    if confluence_count >= 3:
        pts = 1.5
    elif confluence_count >= 2:
        pts = 1.0
    elif confluence_count >= 1:
        pts = 0.5
    else:
        pts = 0.0
    breakdown["levels"] = pts
    total += pts

    # Annualized ROI (max 1.5 pts)
    ann_roi = signal.get("annualized_roi", 0)
    if ann_roi > 60:
        pts = 1.5
    elif ann_roi > 40:
        pts = 1.0
    elif ann_roi > 20:
        pts = 0.5
    else:
        pts = 0.0
    breakdown["roi"] = pts
    total += pts

    # VIX (max 1.0 pt)
    vix = signal.get("vix_level")
    if vix is not None:
        if 20 <= vix <= 30:
            pts = 1.0
        elif 15 <= vix < 20:
            pts = 0.5
        elif vix > 30:
            pts = 0.3
        else:
            pts = 0.0
    else:
        pts = 0.0
    breakdown["vix"] = pts
    total += pts

    # Round and classify
    score = round(total, 1)
    score = min(score, 10.0)

    if score >= 9:
        label = "\U0001f525 STRONG SIGNAL"
    elif score >= 7:
        label = "\u2b50 GOOD SIGNAL"
    elif score >= 6:
        label = "\U0001f44d DECENT SIGNAL"
    elif score >= 5:
        label = "moderate"
    else:
        label = "weak"

    should_alert = score >= 6
    should_log = 5 <= score < 6

    if should_log:
        logger.info(
            f"Score {score}/10 for {signal.get('ticker')} {signal_type} — "
            f"below alert threshold (IVR:{breakdown['ivr']} RSI:{breakdown['rsi']} "
            f"BB:{breakdown['bb']} Levels:{breakdown['levels']} "
            f"ROI:{breakdown['roi']} VIX:{breakdown['vix']})"
        )

    return {
        "score": score,
        "breakdown": breakdown,
        "label": label,
        "should_alert": should_alert,
        "should_log": should_log,
    }
