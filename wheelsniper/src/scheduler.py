"""
scheduler.py — APScheduler config for market-hours-only polling.

Runs the pre-market scan at 8:00am ET, morning brief at 9:30am ET,
signal scan every 5 minutes between 9:35am–3:55pm ET.
Skips weekends and holidays.
"""

import asyncio
import logging
from datetime import datetime

import pytz
import yaml
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.ai_analyst import generate_signal_thesis
from src.alert_manager import cleanup_old_alerts, record_alert, should_alert
from src.market_data import get_premarket_data, get_vix
from src.morning_brief import build_morning_brief
from src.notion_sync import log_signal_to_notion, track_intraday_premium, track_position_targets
from src.position_tracker import get_monthly_summary
from src.signal_engine import scan_cc_signals, scan_close_signals, scan_csp_signals
from src.telegram_bot import (
    format_cc_alert,
    format_close_alert,
    format_csp_alert,
    format_premarket_alert,
    send_alert,
)

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")


def load_config() -> dict:
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)


async def run_scan():
    """Execute a full signal scan and send alerts for new signals."""
    logger.info("Running scheduled scan...")
    config = load_config()
    dedup_hours = config.get("alert_dedup_hours", 4)

    # CSP signals (only alert on score >= 6)
    for signal in scan_csp_signals(config):
        if not signal.get("should_alert", True):
            continue
        if should_alert(signal["ticker"], "CSP", dedup_hours):
            thesis = generate_signal_thesis(signal)
            if thesis:
                signal["ai_thesis"] = thesis
            # Apply AI confidence to score
            ai_adj = signal.get("ai_confidence_adjustment", 0)
            if ai_adj != 0:
                signal["score"] = round(max(0, min(10, signal["score"] + ai_adj)), 1)
                if signal["score"] < 6:
                    signal["should_alert"] = False
            if not signal["should_alert"]:
                continue
            msg = format_csp_alert(signal)
            await send_alert(msg)
            record_alert(signal["ticker"], "CSP", msg)
            log_signal_to_notion(signal)

    # CC signals (only alert on score >= 6)
    for signal in scan_cc_signals(config):
        if not signal.get("should_alert", True):
            continue
        if should_alert(signal["ticker"], "CC", dedup_hours):
            thesis = generate_signal_thesis(signal)
            if thesis:
                signal["ai_thesis"] = thesis
            # Apply AI confidence to score
            ai_adj = signal.get("ai_confidence_adjustment", 0)
            if ai_adj != 0:
                signal["score"] = round(max(0, min(10, signal["score"] + ai_adj)), 1)
                if signal["score"] < 6:
                    signal["should_alert"] = False
            if not signal["should_alert"]:
                continue
            msg = format_cc_alert(signal)
            await send_alert(msg)
            record_alert(signal["ticker"], "CC", msg)
            log_signal_to_notion(signal)

    # Close signals
    for signal in scan_close_signals(config):
        if should_alert(signal["ticker"], "CLOSE", dedup_hours):
            summary = get_monthly_summary()
            target = config["monthly_target"]["low"]
            msg = format_close_alert(signal, summary["total_income"], target)
            await send_alert(msg)
            record_alert(signal["ticker"], "CLOSE", msg)

    # Notion position tracking (close targets + intraday premium)
    try:
        await track_position_targets(send_alert_fn=send_alert)
        await track_intraday_premium(send_alert_fn=send_alert)
    except Exception as e:
        logger.debug(f"Notion tracking error: {e}")

    logger.info("Scan complete.")


async def run_premarket_scan():
    """Run the 8:00 AM pre-market scan and send alert."""
    logger.info("Running pre-market scan...")
    config = load_config()
    watchlist = config.get("watchlist", [])
    positions = config.get("positions", {}) or {}

    # Get all tickers to scan (watchlist + positions)
    all_tickers = set(watchlist)
    for ticker in positions:
        if positions[ticker] and positions[ticker].get("shares", 0) >= 100:
            all_tickers.add(ticker)

    # Fetch pre-market data for all tickers
    movers_down = []
    movers_up = []
    avoid_list = []

    for ticker in sorted(all_tickers):
        pm = get_premarket_data(ticker)
        if not pm:
            continue

        change = pm["premarket_change_pct"]

        if change < -7:
            avoid_list.append(pm)
        elif change < -1.5:
            movers_down.append(pm)
        elif change > 1.5:
            movers_up.append(pm)

    # Sort by magnitude of move
    movers_down.sort(key=lambda x: x["premarket_change_pct"])
    movers_up.sort(key=lambda x: x["premarket_change_pct"], reverse=True)

    # Get SPY, QQQ, VIX
    spy_data = get_premarket_data("SPY")
    qqq_data = get_premarket_data("QQQ")
    vix_level, _ = get_vix()

    now_et = datetime.now(ET)
    date_str = now_et.strftime("%b %d, %Y")

    msg = format_premarket_alert(
        date_str, spy_data, qqq_data, vix_level,
        movers_down, movers_up, avoid_list,
    )
    await send_alert(msg)
    logger.info("Pre-market scan sent.")


async def run_morning_brief():
    """Build and send the morning brief."""
    logger.info("Building morning brief...")
    config = load_config()
    brief = build_morning_brief(config)
    await send_alert(brief)
    logger.info("Morning brief sent.")


async def run_daily_cleanup():
    """Clean up old alert history."""
    cleanup_old_alerts(days=30)
    logger.info("Old alerts cleaned up.")


def is_market_day() -> bool:
    """Check if today is a weekday (basic check; doesn't account for holidays)."""
    now = datetime.now(ET)
    return now.weekday() < 5  # Mon=0, Fri=4


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the APScheduler.

    Schedule:
    - Morning brief: 9:30 AM ET, Mon–Fri
    - Signal scan: Every 5 min, 9:35 AM – 3:55 PM ET, Mon–Fri
    - Daily cleanup: 4:00 PM ET
    """
    config = load_config()
    interval = config.get("poll_interval_minutes", 5)
    market = config.get("market_hours", {})
    open_time = market.get("open", "09:35")
    close_time = market.get("close", "15:55")
    brief_time = market.get("morning_brief", "09:30")

    open_h, open_m = map(int, open_time.split(":"))
    close_h, close_m = map(int, close_time.split(":"))
    brief_h, brief_m = map(int, brief_time.split(":"))

    scheduler = AsyncIOScheduler(timezone=ET)

    # Pre-market scan at 8:00 AM ET, weekdays only
    scheduler.add_job(
        run_premarket_scan,
        CronTrigger(hour=8, minute=0, day_of_week="mon-fri", timezone=ET),
        id="premarket_scan",
        name="Pre-Market Scan",
        misfire_grace_time=300,
    )

    # Morning brief at 9:30 AM ET, weekdays only
    scheduler.add_job(
        run_morning_brief,
        CronTrigger(hour=brief_h, minute=brief_m, day_of_week="mon-fri", timezone=ET),
        id="morning_brief",
        name="Morning Brief",
        misfire_grace_time=300,
    )

    # Signal scan every N minutes during market hours, weekdays only
    scheduler.add_job(
        run_scan,
        CronTrigger(
            hour=f"{open_h}-{close_h}",
            minute=f"*/{interval}",
            day_of_week="mon-fri",
            timezone=ET,
        ),
        id="signal_scan",
        name="Signal Scan",
        misfire_grace_time=120,
    )

    # Daily cleanup at 4:00 PM ET
    scheduler.add_job(
        run_daily_cleanup,
        CronTrigger(hour=16, minute=0, day_of_week="mon-fri", timezone=ET),
        id="daily_cleanup",
        name="Daily Cleanup",
        misfire_grace_time=600,
    )

    logger.info(
        f"Scheduler configured: pre-market at 8:00 ET, brief at {brief_time} ET, "
        f"scans every {interval}min {open_time}-{close_time} ET"
    )
    return scheduler
