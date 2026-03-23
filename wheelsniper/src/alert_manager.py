"""
alert_manager.py — Alert deduplication and history.

Prevents re-alerting the same ticker/signal combination within
a configurable time window (default: 4 hours).
"""

import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pytz

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

DB_PATH = Path(__file__).parent.parent / "wheelsniper.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def should_alert(ticker: str, signal_type: str, dedup_hours: int = 4) -> bool:
    """Check if we should send an alert for this ticker/signal combo.

    Returns True if no alert was sent in the last dedup_hours.
    """
    conn = _get_conn()
    cutoff = (datetime.now(ET) - timedelta(hours=dedup_hours)).strftime("%Y-%m-%d %H:%M:%S")

    row = conn.execute(
        """SELECT COUNT(*) as cnt FROM alert_history
           WHERE ticker = ? AND signal_type = ? AND alert_time > ?""",
        (ticker, signal_type, cutoff),
    ).fetchone()

    conn.close()
    return row["cnt"] == 0


def record_alert(ticker: str, signal_type: str, message: str = ""):
    """Record that an alert was sent."""
    conn = _get_conn()
    conn.execute(
        """INSERT INTO alert_history (ticker, signal_type, alert_time, message)
           VALUES (?, ?, ?, ?)""",
        (ticker, signal_type, datetime.now(ET).strftime("%Y-%m-%d %H:%M:%S"), message),
    )
    conn.commit()
    conn.close()
    logger.debug(f"Recorded alert: {signal_type} {ticker}")


def cleanup_old_alerts(days: int = 30):
    """Remove alert history older than the specified number of days."""
    conn = _get_conn()
    cutoff = (datetime.now(ET) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("DELETE FROM alert_history WHERE alert_time < ?", (cutoff,))
    conn.commit()
    conn.close()


def get_recent_alerts(hours: int = 24) -> list[dict]:
    """Get alerts from the last N hours."""
    conn = _get_conn()
    cutoff = (datetime.now(ET) - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    rows = conn.execute(
        "SELECT * FROM alert_history WHERE alert_time > ? ORDER BY alert_time DESC",
        (cutoff,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
