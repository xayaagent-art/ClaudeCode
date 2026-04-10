"""
weekly_summary.py — Friday 4:05pm ET weekly P&L + signal summary.

Pulls closed-profit trades from Notion for this week + MTD, combines with
bot signal stats parsed from alert_history, and emits a Telegram-friendly
summary message.
"""

import logging
import re
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pytz
import yaml

from src.market_data import get_stock_snapshot
from src.notion_sync import get_closed_profit_positions, get_open_positions

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

DB_PATH = Path(__file__).parent.parent / "wheelsniper.db"
SEP = "\u2501" * 24

# Parse "Score: 7.5/10" out of compact alert message bodies
_SCORE_REGEX = re.compile(r"Score[:\s]+([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE)


def _load_config() -> dict:
    try:
        with open("config.yaml", "r") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _week_bounds(now: datetime) -> tuple[datetime, datetime]:
    """Return (monday_00:00, friday_23:59) ET for the week containing `now`."""
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    friday_end = (monday + timedelta(days=4)).replace(
        hour=23, minute=59, second=59, microsecond=0,
    )
    return monday, friday_end


def _signal_stats_for_week(monday: datetime, friday_end: datetime) -> dict:
    """Pull signal stats from alert_history for the week.

    Returns dict with: signals_fired, avg_score, top_tickers (list of tuples).
    Scores are parsed from the message text via regex since alert_history has
    no score column.
    """
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT ticker, signal_type, alert_time, message
               FROM alert_history
               WHERE alert_time >= ? AND alert_time <= ?
               AND signal_type IN ('CSP', 'CC')""",
            (
                monday.strftime("%Y-%m-%d %H:%M:%S"),
                friday_end.strftime("%Y-%m-%d %H:%M:%S"),
            ),
        ).fetchall()
        conn.close()
    except Exception as e:
        logger.debug(f"alert_history query failed: {e}")
        return {"signals_fired": 0, "avg_score": None, "top_tickers": []}

    scores: list[float] = []
    ticker_counts: Counter = Counter()
    for row in rows:
        ticker_counts[row["ticker"]] += 1
        m = _SCORE_REGEX.search(row["message"] or "")
        if m:
            try:
                scores.append(float(m.group(1)))
            except ValueError:
                pass

    avg_score = round(sum(scores) / len(scores), 1) if scores else None
    top = ticker_counts.most_common(3)

    return {
        "signals_fired": len(rows),
        "avg_score": avg_score,
        "top_tickers": top,
    }


def _format_close_date(s: Optional[str]) -> str:
    if not s:
        return "?"
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%a %-m/%-d")
    except ValueError:
        return s


def _best_trade(week_trades: list[dict]) -> Optional[dict]:
    if not week_trades:
        return None
    return max(week_trades, key=lambda t: t.get("profit", 0) or 0)


def _watching_list(open_positions: list[dict], limit: int = 5) -> list[str]:
    """Build a 'watching' list — open CSPs whose underlying is within 10% above strike.

    Helps flag risk of early assignment while avoiding noise from far-OTM positions.
    """
    out = []
    for pos in open_positions:
        if pos.get("type") != "CSP":
            continue
        strike = pos.get("strike")
        ticker = pos.get("ticker")
        if not strike or not ticker:
            continue
        snap = get_stock_snapshot(ticker)
        if not snap:
            continue
        price = snap.get("price")
        if not price:
            continue
        # How far above strike the stock trades (negative = ITM risk)
        cushion_pct = ((price - strike) / strike) * 100
        if -5 <= cushion_pct <= 10:
            out.append(
                f"  {ticker} ${strike:.2f}P \u2014 stock ${price:.2f} "
                f"({cushion_pct:+.1f}% vs strike)"
            )
        if len(out) >= limit:
            break
    return out


def build_weekly_summary() -> str:
    """Build the weekly P&L + signal stats summary message.

    Layout:
      header w/ date range
      week premium + trade count
      best trade of the week
      MTD total vs monthly target
      open positions count + avg DTE
      watching list (at-risk CSPs)
      signals fired + avg score + top tickers
    """
    now = datetime.now(ET)
    monday, friday_end = _week_bounds(now)

    config = _load_config()
    monthly_target_low = 3500
    monthly_target_high = 4000
    mt = config.get("monthly_target") or {}
    if isinstance(mt, dict):
        monthly_target_low = mt.get("low", monthly_target_low)
        monthly_target_high = mt.get("high", monthly_target_high)

    # ---- Pull closed-profit trades for the current month, then split by week ----
    mtd_trades = get_closed_profit_positions(year=now.year, month=now.month)
    week_trades = []
    for t in mtd_trades:
        cd = t.get("close_date")
        if not cd:
            continue
        try:
            d = datetime.strptime(cd, "%Y-%m-%d").replace(tzinfo=ET)
        except ValueError:
            continue
        if monday <= d <= friday_end:
            week_trades.append(t)

    week_premium = sum((t.get("profit") or 0) for t in week_trades)
    mtd_premium = sum((t.get("profit") or 0) for t in mtd_trades)
    mtd_pct = (mtd_premium / monthly_target_low * 100) if monthly_target_low > 0 else 0

    # ---- Open positions + DTE ----
    open_positions = get_open_positions()
    open_count = len(open_positions)
    today = now.date()
    dtes = []
    for pos in open_positions:
        exp = pos.get("expiry")
        if exp:
            try:
                ed = datetime.strptime(exp, "%Y-%m-%d").date()
                dtes.append((ed - today).days)
            except ValueError:
                pass
    avg_dte = round(sum(dtes) / len(dtes)) if dtes else None

    # ---- Signal stats from alert_history ----
    stats = _signal_stats_for_week(monday, friday_end)

    # ---- Build message ----
    date_range = f"{monday.strftime('%b %-d')}\u2013{friday_end.strftime('%b %-d, %Y')}"
    lines = [
        f"\U0001f4ca WEEKLY SUMMARY \u2014 {date_range}",
        SEP,
    ]

    # Week premium
    lines.append(
        f"\U0001f4b5 Week premium: ${week_premium:,.0f} "
        f"({len(week_trades)} trade{'s' if len(week_trades) != 1 else ''} closed)"
    )

    # Best trade
    best = _best_trade(week_trades)
    if best:
        opt_type = "P" if best.get("type") == "CSP" else "C"
        lines.append(
            f"\U0001f3c6 Best trade: {best.get('ticker')} "
            f"${best.get('strike'):.2f}{opt_type} "
            f"\u2014 +${best.get('profit'):,.0f}"
        )

    # MTD progress
    lines.append(
        f"\U0001f4c8 MTD: ${mtd_premium:,.0f} / "
        f"${monthly_target_low:,}\u2013${monthly_target_high:,} "
        f"({mtd_pct:.0f}%)"
    )

    lines.append("")
    dte_str = f"{avg_dte}d avg DTE" if avg_dte is not None else "\u2014"
    lines.append(f"\U0001f4c2 Open positions: {open_count} ({dte_str})")

    # Watching list (risk flags)
    watching = _watching_list(open_positions)
    if watching:
        lines.append("\n\U0001f440 Watching (cushion <10%):")
        lines.extend(watching)

    # Signal engine stats
    lines.append("")
    lines.append(SEP)
    lines.append("\U0001f50d Signal Engine:")
    lines.append(f"  Signals fired: {stats['signals_fired']}")
    if stats["avg_score"] is not None:
        lines.append(f"  Avg score: {stats['avg_score']:.1f}/10")
    if stats["top_tickers"]:
        top_str = ", ".join(f"{t} ({n})" for t, n in stats["top_tickers"])
        lines.append(f"  Top tickers: {top_str}")

    # Footer
    lines.append("")
    lines.append("\U0001f4c5 Next scan: Monday 9:30 AM ET")
    return "\n".join(lines)
