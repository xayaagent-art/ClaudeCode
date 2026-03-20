"""
position_tracker.py — SQLite-backed position and P&L tracker.

Tracks open option trades, closed trades, and monthly income
against the $3,500–$4,000/month target.
"""

import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "wheelsniper.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS open_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            trade_type TEXT NOT NULL,          -- 'CSP' or 'CC'
            strike REAL NOT NULL,
            expiry TEXT NOT NULL,
            premium REAL NOT NULL,
            quantity INTEGER DEFAULT 1,
            opened_date TEXT NOT NULL,
            status TEXT DEFAULT 'open'         -- 'open', 'closed', 'rolled'
        );

        CREATE TABLE IF NOT EXISTS closed_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            trade_type TEXT NOT NULL,
            strike REAL NOT NULL,
            expiry TEXT NOT NULL,
            open_premium REAL NOT NULL,
            close_premium REAL NOT NULL,
            quantity INTEGER DEFAULT 1,
            opened_date TEXT NOT NULL,
            closed_date TEXT NOT NULL,
            profit REAL NOT NULL               -- net profit per contract
        );

        CREATE TABLE IF NOT EXISTS monthly_pnl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            total_premium REAL DEFAULT 0,
            total_closed_profit REAL DEFAULT 0,
            trade_count INTEGER DEFAULT 0,
            UNIQUE(year, month)
        );

        CREATE TABLE IF NOT EXISTS alert_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            alert_time TEXT NOT NULL,
            message TEXT
        );
    """)
    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {DB_PATH}")


def add_open_trade(
    ticker: str,
    trade_type: str,
    strike: float,
    expiry: str,
    premium: float,
    quantity: int = 1,
) -> int:
    """Record a new open trade. Returns the trade ID."""
    conn = _get_conn()
    cursor = conn.execute(
        """INSERT INTO open_trades (ticker, trade_type, strike, expiry, premium, quantity, opened_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (ticker, trade_type, strike, expiry, premium, quantity, datetime.now().strftime("%Y-%m-%d")),
    )
    trade_id = cursor.lastrowid
    conn.commit()
    conn.close()
    logger.info(f"Added open trade #{trade_id}: {trade_type} {ticker} {strike} {expiry}")
    return trade_id


def close_trade(trade_id: int, close_premium: float) -> Optional[float]:
    """Close a trade and record the profit. Returns profit per contract."""
    conn = _get_conn()
    trade = conn.execute("SELECT * FROM open_trades WHERE id = ? AND status = 'open'", (trade_id,)).fetchone()
    if not trade:
        conn.close()
        logger.warning(f"Trade #{trade_id} not found or already closed")
        return None

    profit = (trade["premium"] - close_premium) * 100 * trade["quantity"]

    conn.execute("UPDATE open_trades SET status = 'closed' WHERE id = ?", (trade_id,))
    conn.execute(
        """INSERT INTO closed_trades
           (ticker, trade_type, strike, expiry, open_premium, close_premium,
            quantity, opened_date, closed_date, profit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            trade["ticker"], trade["trade_type"], trade["strike"], trade["expiry"],
            trade["premium"], close_premium, trade["quantity"],
            trade["opened_date"], datetime.now().strftime("%Y-%m-%d"), profit,
        ),
    )

    # Update monthly P&L
    now = datetime.now()
    _update_monthly_pnl(conn, now.year, now.month, profit)

    conn.commit()
    conn.close()
    logger.info(f"Closed trade #{trade_id}: profit ${profit:.2f}")
    return profit


def get_open_trades() -> list[dict]:
    """Get all open trades."""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM open_trades WHERE status = 'open' ORDER BY expiry").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_monthly_summary(year: int = None, month: int = None) -> dict:
    """Get P&L summary for a given month (defaults to current)."""
    now = datetime.now()
    year = year or now.year
    month = month or now.month

    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM monthly_pnl WHERE year = ? AND month = ?", (year, month)
    ).fetchone()

    # Also sum open trade premiums for this month
    open_premium = conn.execute(
        """SELECT COALESCE(SUM(premium * quantity * 100), 0) as total
           FROM open_trades
           WHERE status = 'open'
           AND substr(opened_date, 1, 7) = ?""",
        (f"{year:04d}-{month:02d}",),
    ).fetchone()["total"]

    conn.close()

    closed_profit = float(row["total_closed_profit"]) if row else 0.0
    trade_count = int(row["trade_count"]) if row else 0

    return {
        "year": year,
        "month": month,
        "closed_profit": round(closed_profit, 2),
        "open_premium": round(open_premium, 2),
        "total_income": round(closed_profit + open_premium, 2),
        "trade_count": trade_count,
    }


def _update_monthly_pnl(conn: sqlite3.Connection, year: int, month: int, profit: float):
    """Upsert monthly P&L record."""
    conn.execute(
        """INSERT INTO monthly_pnl (year, month, total_closed_profit, trade_count)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(year, month) DO UPDATE SET
               total_closed_profit = total_closed_profit + ?,
               trade_count = trade_count + 1""",
        (year, month, profit, profit),
    )
