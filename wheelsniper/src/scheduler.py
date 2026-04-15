"""
scheduler.py — APScheduler config for market-hours-only polling.

Runs the pre-market scan at 8:00am ET, morning brief at 9:30am ET,
signal scan every 1 minute between 9:35am–3:55pm ET with a smart
throttle that only scans movers during the midday stretch.
Skips weekends and holidays.
"""

import asyncio
import copy
import logging
from datetime import datetime

import pytz
import yaml
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.ai_analyst import generate_signal_thesis
from src.alert_manager import cleanup_old_alerts, record_alert, should_alert
from src.market_data import get_premarket_data, get_stock_snapshot, get_vix
from src.morning_brief import build_morning_brief
from src.notion_sync import log_signal_to_notion, track_intraday_premium, track_position_targets
from src.position_tracker import get_monthly_summary
from src.signal_engine import (
    fast_velocity_scan,
    scan_cc_signals,
    scan_close_signals,
    scan_csp_signals,
    scan_proximity_alerts,
)
from src.telegram_bot import (
    format_cc_alert,
    format_close_alert,
    format_csp_alert,
    format_premarket_alert,
    format_proximity_alert,
    format_velocity_alert,
    send_alert,
)
from src.uoa import detect_uoa, format_uoa_alert
from src.weekly_summary import build_weekly_summary

# Seconds to wait between multiple alerts in a single scan cycle (FIX 4)
_ALERT_STAGGER_SECONDS = 5

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

# Per-ticker last scan price, used to detect >1% movers during midday throttle
_last_scan_price: dict[str, float] = {}

# Midday move threshold — only scan tickers that moved more than this %
_MIDDAY_MOVE_THRESHOLD_PCT = 1.0


def _classify_scan_window(now: datetime) -> str:
    """Return scan window label for current ET time: full | movers_only | idle."""
    hm = now.hour * 60 + now.minute
    # 9:30 - 10:30 AM ET (first hour)
    if 570 <= hm < 630:
        return "full"
    # 10:30 AM - 3:30 PM ET (midday, movers-only)
    if 630 <= hm < 930:
        return "movers_only"
    # 3:30 - 3:55 PM ET (end of day premium spike)
    if 930 <= hm <= 955:
        return "full"
    return "idle"


def _select_active_tickers(tickers: list, window: str) -> list:
    """Choose which tickers to scan based on the current window.

    full         -> all tickers (baseline prices refreshed)
    movers_only  -> only tickers whose price moved > 1% since last scan
    idle         -> none
    """
    global _last_scan_price

    if not tickers:
        return []

    if window == "full":
        active = list(tickers)
        for t in active:
            snap = get_stock_snapshot(t)
            if snap and snap.get("price"):
                _last_scan_price[t] = float(snap["price"])
        return active

    if window == "movers_only":
        active = []
        for t in tickers:
            snap = get_stock_snapshot(t)
            if not snap or not snap.get("price"):
                continue
            price = float(snap["price"])
            last = _last_scan_price.get(t)
            if last is None or last <= 0:
                # No baseline yet → set and include
                _last_scan_price[t] = price
                active.append(t)
                continue
            move_pct = abs(price - last) / last * 100
            if move_pct > _MIDDAY_MOVE_THRESHOLD_PCT:
                active.append(t)
                _last_scan_price[t] = price
        return active

    return []


def load_config() -> dict:
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)


async def run_scan():
    """Execute a signal scan with smart throttle and send alerts for new signals.

    Scan windows (ET):
      09:30-10:30  full (all tickers)
      10:30-15:30  movers_only (only tickers with >1% move since last scan)
      15:30-15:55  full
      other        idle (scheduler should not fire outside hours anyway)

    All outgoing alerts are collected and then sent with a 5-second stagger
    (FIX 4) so a cluster of signals doesn't spam Telegram in one burst.
    """
    config = load_config()
    dedup_hours = config.get("alert_dedup_hours", 1.5)

    now_et = datetime.now(ET)
    window = _classify_scan_window(now_et)
    if window == "idle":
        logger.debug(f"Scan skipped — outside active windows at {now_et.strftime('%H:%M')}")
        return

    # Build throttled config with only active tickers for this window
    csp_watchlist = config.get("watchlist", []) or []
    positions = config.get("positions", {}) or {}
    cc_candidates = [t for t, p in positions.items()
                     if p and p.get("shares", 0) >= 100]

    active_csp = _select_active_tickers(csp_watchlist, window)
    active_cc = _select_active_tickers(cc_candidates, window)

    logger.info(
        f"Scan window={window} @ {now_et.strftime('%H:%M ET')} "
        f"\u2014 CSP {len(active_csp)}/{len(csp_watchlist)} "
        f"CC {len(active_cc)}/{len(cc_candidates)}"
    )

    if not active_csp and not active_cc:
        logger.info("No active tickers this scan (smart throttle).")
        # Still run close-signal + proximity + notion tracking below
        csp_config = cc_config = None
    else:
        csp_config = copy.deepcopy(config)
        csp_config["watchlist"] = active_csp
        cc_config = copy.deepcopy(config)
        cc_config["positions"] = {
            t: p for t, p in positions.items() if t in active_cc
        }

    # Queue of (msg, ticker, alert_type, notion_signal_or_None) to fire at end
    alert_queue: list[tuple] = []

    # --- CSP signals (score >= 6, price gate applied inside scan_csp_signals) ---
    csp_iter = scan_csp_signals(csp_config) if csp_config else []
    for signal in csp_iter:
        if not signal.get("should_alert", True):
            continue
        if not should_alert(signal["ticker"], "CSP", dedup_hours):
            continue
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
        alert_queue.append((msg, signal["ticker"], "CSP", signal))

    # --- CC signals (score >= 6, price gate applied inside scan_cc_signals) ---
    cc_iter = scan_cc_signals(cc_config) if cc_config else []
    for signal in cc_iter:
        if not signal.get("should_alert", True):
            continue
        if not should_alert(signal["ticker"], "CC", dedup_hours):
            continue
        thesis = generate_signal_thesis(signal)
        if thesis:
            signal["ai_thesis"] = thesis
        ai_adj = signal.get("ai_confidence_adjustment", 0)
        if ai_adj != 0:
            signal["score"] = round(max(0, min(10, signal["score"] + ai_adj)), 1)
            if signal["score"] < 6:
                signal["should_alert"] = False
        if not signal["should_alert"]:
            continue
        msg = format_cc_alert(signal)
        alert_queue.append((msg, signal["ticker"], "CC", signal))

    # --- FIX 3: Support/Resistance proximity alerts (early warning) ---
    try:
        for prox in scan_proximity_alerts(config):
            alert_type = (
                "SUPPORT_TOUCH" if prox["kind"] == "support" else "RESISTANCE_TOUCH"
            )
            # 2-hour dedup per ticker per alert type
            if not should_alert(prox["ticker"], alert_type, dedup_hours=2):
                continue
            msg = format_proximity_alert(prox)
            alert_queue.append((msg, prox["ticker"], alert_type, None))
    except Exception as e:
        logger.debug(f"Proximity scan error: {e}")

    # --- Close signals ---
    for signal in scan_close_signals(config):
        if should_alert(signal["ticker"], "CLOSE", dedup_hours):
            summary = get_monthly_summary()
            target = config["monthly_target"]["low"]
            msg = format_close_alert(signal, summary["total_income"], target)
            alert_queue.append((msg, signal["ticker"], "CLOSE", None))

    # --- Fire queued alerts with stagger (FIX 4) ---
    for i, (msg, ticker, alert_type, notion_signal) in enumerate(alert_queue):
        if i > 0:
            await asyncio.sleep(_ALERT_STAGGER_SECONDS)
        await send_alert(msg)
        record_alert(ticker, alert_type, msg)
        if notion_signal is not None and alert_type in ("CSP", "CC"):
            log_signal_to_notion(notion_signal)

    logger.info(
        f"Scan alerts fired: {len(alert_queue)} "
        f"({sum(1 for a in alert_queue if a[2] in ('CSP', 'CC'))} signals, "
        f"{sum(1 for a in alert_queue if a[2] in ('SUPPORT_TOUCH', 'RESISTANCE_TOUCH'))} proximity, "
        f"{sum(1 for a in alert_queue if a[2] == 'CLOSE')} close)"
    )

    # --- Standalone UOA alerts (once per ticker per day, own stagger inside) ---
    try:
        await scan_standalone_uoa(config)
    except Exception as e:
        logger.debug(f"Standalone UOA scan error: {e}")

    # --- Notion position tracking (close targets + intraday premium) ---
    try:
        await track_position_targets(send_alert_fn=send_alert)
        await track_intraday_premium(send_alert_fn=send_alert)
    except Exception as e:
        logger.debug(f"Notion tracking error: {e}")

    logger.info("Scan complete.")


async def run_fast_velocity_scan():
    """Fast 30-second pre-scan for ±2.5% moves in 3 minutes.

    Runs alongside the 1-minute full scan to catch sharp moves within 30
    seconds of them starting. Tickers that trip the velocity threshold are
    flagged for priority processing in the next full scan cycle.

    Skips outside market hours (no yfinance churn when the market is closed).
    """
    now_et = datetime.now(ET)
    window = _classify_scan_window(now_et)
    if window == "idle":
        return

    try:
        config = load_config()
    except Exception as e:
        logger.debug(f"Velocity scan config load error: {e}")
        return

    try:
        alerts = fast_velocity_scan(config)
    except Exception as e:
        logger.debug(f"Velocity scan error: {e}")
        return

    if not alerts:
        return

    logger.info(f"Velocity pre-scan: {len(alerts)} alert(s) firing")
    for i, alert in enumerate(alerts):
        if i > 0:
            await asyncio.sleep(_ALERT_STAGGER_SECONDS)
        try:
            msg = format_velocity_alert(alert)
            await send_alert(msg)
            alert_type = (
                "VELOCITY_DROP" if alert["kind"] == "drop" else "VELOCITY_SURGE"
            )
            record_alert(alert["ticker"], alert_type, msg)
        except Exception as e:
            logger.debug(f"Velocity alert send error ({alert.get('ticker')}): {e}")


async def scan_standalone_uoa(config: dict):
    """Fire standalone UOA alerts for watchlist tickers (once per day per ticker).

    Runs cheap — only triggers heavy option-chain fetching for tickers that
    show unusual activity via the yfinance 3-expiration sum. Uses a 24h
    should_alert dedup so each ticker fires at most once per day.
    """
    watchlist = config.get("watchlist", []) or []
    positions = config.get("positions", {}) or {}
    # Also cover tickers we own (CC-eligible)
    tickers = set(watchlist)
    for t, p in positions.items():
        if p and p.get("shares", 0) >= 100:
            tickers.add(t)

    for ticker in sorted(tickers):
        try:
            uoa = detect_uoa(ticker)
            if not uoa or not uoa.get("unusual") or not uoa.get("direction"):
                continue
            # Once per ticker per day (24h dedup)
            if not should_alert(ticker, "UOA", 24):
                continue
            snap = get_stock_snapshot(ticker)
            price = snap.get("price") if snap else None
            msg = format_uoa_alert(ticker, uoa, price)
            await send_alert(msg)
            record_alert(ticker, "UOA", msg)
            logger.info(
                f"UOA alert fired for {ticker}: {uoa['direction']} "
                f"{uoa['volume_ratio']:.1f}x"
            )
        except Exception as e:
            logger.debug(f"scan_standalone_uoa {ticker} error: {e}")


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


async def run_weekly_summary():
    """Build and send the weekly P&L + signal-stats summary."""
    logger.info("Building weekly summary...")
    try:
        msg = build_weekly_summary()
        await send_alert(msg)
        logger.info("Weekly summary sent.")
    except Exception as e:
        logger.error(f"Weekly summary failed: {e}")


def is_market_day() -> bool:
    """Check if today is a weekday (basic check; doesn't account for holidays)."""
    now = datetime.now(ET)
    return now.weekday() < 5  # Mon=0, Fri=4


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the APScheduler.

    Schedule:
    - Morning brief: 9:30 AM ET, Mon–Fri
    - Signal scan: Every 1 min, 9:35 AM – 3:55 PM ET, Mon–Fri
      (smart-throttled: movers-only 10:30-15:30, full otherwise)
    - Daily cleanup: 4:00 PM ET
    """
    config = load_config()
    interval = config.get("poll_interval_minutes", 1)
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

    # Fast velocity pre-scan every 30s during market hours, weekdays only.
    # Skips internally when outside the full/movers window, so 8:00-9:30 and
    # post-3:55 no-ops cheaply.
    scheduler.add_job(
        run_fast_velocity_scan,
        CronTrigger(
            hour=f"{open_h}-{close_h}",
            second="0,30",
            day_of_week="mon-fri",
            timezone=ET,
        ),
        id="fast_velocity_scan",
        name="Fast Velocity Scan",
        misfire_grace_time=15,
        max_instances=1,
        coalesce=True,
    )

    # Daily cleanup at 4:00 PM ET
    scheduler.add_job(
        run_daily_cleanup,
        CronTrigger(hour=16, minute=0, day_of_week="mon-fri", timezone=ET),
        id="daily_cleanup",
        name="Daily Cleanup",
        misfire_grace_time=600,
    )

    # Weekly summary at 4:05 PM ET on Fridays
    scheduler.add_job(
        run_weekly_summary,
        CronTrigger(hour=16, minute=5, day_of_week="fri", timezone=ET),
        id="weekly_summary",
        name="Weekly Summary",
        misfire_grace_time=1800,
    )

    logger.info(
        f"Scheduler configured: pre-market at 8:00 ET, brief at {brief_time} ET, "
        f"scans every {interval}min + velocity every 30s {open_time}-{close_time} ET, "
        f"weekly summary Fri 16:05 ET"
    )
    return scheduler
