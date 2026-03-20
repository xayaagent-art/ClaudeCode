"""
telegram_bot.py — Telegram bot for alerts and command interface.

Sends formatted trade signals and provides commands:
/status, /scan, /pnl, /positions
"""

import logging
import os
from datetime import datetime

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

logger = logging.getLogger(__name__)

# Global application reference for sending alerts outside command handlers
_app: Application = None

SEP = "\u2501" * 24  # ━━━━━━━━━━━━━━━━━━━━━━━━


def _vix_line(signal: dict) -> str:
    """Build VIX display line with environment context."""
    vix = signal.get("vix_level")
    env = signal.get("vix_env", "unknown")
    env_labels = {
        "low_vol": "Low vol",
        "normal": "Normal",
        "elevated": "Elevated vol",
        "high_fear": "High fear",
    }
    label = env_labels.get(env, env)
    return f"VIX: {vix if vix else 'N/A'} ({label})"


def _earnings_line(signal: dict) -> str:
    """Build earnings display line."""
    earnings = signal.get("earnings", {})
    if earnings.get("earnings_date"):
        days = earnings.get("days_until")
        date = earnings["earnings_date"]
        if days is not None:
            return f"\U0001f4c5 Earnings: {date} ({days}d away)"
        return f"\U0001f4c5 Earnings: {date}"
    return "\U0001f4c5 Earnings: None in window \u2705"


def _macd_label(trend: str) -> str:
    """Format MACD trend label."""
    if trend == "bullish":
        return "\U0001f4c8 Bullish MACD"
    return "\U0001f4c9 Bearish MACD"


def _tags_line(tags: list) -> str:
    """Format signal tags if present."""
    if not tags:
        return ""
    return "\n".join(tags) + "\n"


def format_csp_alert(signal: dict) -> str:
    """Format a CSP signal into a Telegram message."""
    direction = "\u2193" if signal["change_pct"] < 0 else "\u2191"
    day_emoji = "\U0001f534" if signal["change_pct"] < 0 else "\U0001f7e2"
    day_label = "Red day" if signal["change_pct"] < 0 else "Green day"

    tags = _tags_line(signal.get("tags", []))
    vix_note = f"\n{signal['vix_note']}" if signal.get("vix_note") else ""

    return (
        f"\U0001f534 CSP SIGNAL \u2014 {signal['ticker']}\n"
        f"{SEP}\n"
        f"{tags}"
        f"Price: ${signal['price']:.2f} ({direction} {abs(signal['change_pct']):.1f}% today) "
        f"{day_emoji} {day_label} \u2705\n"
        f"RSI: {signal['rsi_14']:.0f} | IVR: {signal['ivr']:.0f} | IV: {signal['iv']:.0f}%\n"
        f"Trend: {_macd_label(signal['macd_trend'])}\n"
        f"{_vix_line(signal)}{vix_note}\n"
        f"20MA: ${signal['ma_20']:.2f} | 50MA: ${signal['ma_50']:.2f} | {signal['ma_position']}\n"
        f"52W Low: ${signal['week52_low']:.2f} | 52W High: ${signal['week52_high']:.2f}\n"
        f"{SEP}\n"
        f"Setup: {signal['expiry']} ${signal['strike']:.2f}P (DTE: {signal['dte']})\n"
        f"Delta: {signal['delta']:.2f} | Premium: ${signal['premium']:.2f}\n"
        f"Yield: {signal['yield_pct']:.1f}% / {signal['dte']} days\n"
        f"Breakeven: ${signal['breakeven']:.2f}\n"
        f"{SEP}\n"
        f"{_earnings_line(signal)}\n"
        f"Action: SELL TO OPEN 1x {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}P"
    )


def format_cc_alert(signal: dict) -> str:
    """Format a CC signal into a Telegram message."""
    direction = "\u2191" if signal["change_pct"] > 0 else "\u2193"
    pnl_if_called = signal.get("pnl_if_called", 0)
    pnl_sign = "+" if pnl_if_called >= 0 else "-"
    contracts = signal.get("shares", 100) // 100

    tags = _tags_line(signal.get("tags", []))
    vix_note = f"\n{signal['vix_note']}" if signal.get("vix_note") else ""

    return (
        f"\U0001f7e2 CC SIGNAL \u2014 {signal['ticker']}\n"
        f"{SEP}\n"
        f"{tags}"
        f"Price: ${signal['price']:.2f} ({direction} {abs(signal['change_pct']):.1f}% today) "
        f"\U0001f7e2 Green day \u2705\n"
        f"Cost basis: ${signal['cost_basis']:.2f} | "
        f"P&L if called: {pnl_sign}${abs(pnl_if_called):,.2f}\n"
        f"RSI: {signal['rsi_14']:.0f} | IVR: {signal['ivr']:.0f} | IV: {signal['iv']:.0f}%\n"
        f"Trend: {_macd_label(signal['macd_trend'])}\n"
        f"{_vix_line(signal)}{vix_note}\n"
        f"20MA: ${signal['ma_20']:.2f} | 50MA: ${signal['ma_50']:.2f}\n"
        f"{SEP}\n"
        f"Setup: {signal['expiry']} ${signal['strike']:.2f}C (DTE: {signal['dte']})\n"
        f"Delta: {signal['delta']:.2f} | Premium: ${signal['premium']:.2f}\n"
        f"Yield: {signal['yield_pct']:.1f}% / {signal['dte']} days\n"
        f"Strike vs basis: ${signal['strike']:.2f} > ${signal['cost_basis']:.2f} \u2705 Safe\n"
        f"{SEP}\n"
        f"{_earnings_line(signal)}\n"
        f"Action: SELL TO OPEN {contracts}x {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}C"
    )


def format_close_alert(signal: dict, monthly_total: float = 0, monthly_target: int = 3500) -> str:
    """Format a close signal into a Telegram message."""
    opt_type = "P" if signal["trade_type"] == "CSP" else "C"
    return (
        f"\u2705 CLOSE TARGET \u2014 {signal['ticker']} {signal['trade_type']}\n"
        f"Opened @ ${signal['open_premium']:.2f} credit | Now: ${signal['current_price']:.2f} "
        f"({signal['profit_pct']:.0f}% profit)\n"
        f"Monthly total: ${monthly_total:,.0f} / ${monthly_target:,} target\n"
        f"Action: BUY TO CLOSE {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}{opt_type}"
    )


async def send_alert(message: str):
    """Send a message to the configured Telegram chat."""
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not chat_id or not _app:
        logger.warning("Telegram not configured \u2014 skipping alert")
        return

    try:
        await _app.bot.send_message(chat_id=chat_id, text=message, parse_mode=None)
        logger.info(f"Sent Telegram alert ({len(message)} chars)")
    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")


# --- Command Handlers ---

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status — show bot health and summary."""
    from src.position_tracker import get_monthly_summary, get_open_trades

    trades = get_open_trades()
    summary = get_monthly_summary()
    now = datetime.now().strftime("%Y-%m-%d %H:%M ET")

    msg = (
        f"\U0001f916 WheelSniper Status\n"
        f"Time: {now}\n"
        f"Open trades: {len(trades)}\n"
        f"Monthly P&L: ${summary['total_income']:,.2f}\n"
        f"Target: $3,500\u2013$4,000\n"
        f"Trades this month: {summary['trade_count']}"
    )
    await update.message.reply_text(msg)


async def cmd_scan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /scan — run an immediate signal scan."""
    await update.message.reply_text("\U0001f50d Running scan...")

    from src.signal_engine import scan_cc_signals, scan_close_signals, scan_csp_signals

    csp_signals = scan_csp_signals()
    cc_signals = scan_cc_signals()
    close_signals = scan_close_signals()

    if not csp_signals and not cc_signals and not close_signals:
        await update.message.reply_text("No signals found right now.")
        return

    for s in csp_signals:
        await update.message.reply_text(format_csp_alert(s))
    for s in cc_signals:
        await update.message.reply_text(format_cc_alert(s))
    for s in close_signals:
        await update.message.reply_text(format_close_alert(s))


async def cmd_pnl(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /pnl — show monthly P&L breakdown."""
    from src.position_tracker import get_monthly_summary

    summary = get_monthly_summary()
    now = datetime.now()

    msg = (
        f"\U0001f4b0 P&L \u2014 {now.strftime('%B %Y')}\n"
        f"Closed profit: ${summary['closed_profit']:,.2f}\n"
        f"Open premium: ${summary['open_premium']:,.2f}\n"
        f"Total income: ${summary['total_income']:,.2f}\n"
        f"Target: $3,500\u2013$4,000\n"
        f"Trades: {summary['trade_count']}\n"
        f"Progress: {summary['total_income'] / 3500 * 100:.0f}%"
    )
    await update.message.reply_text(msg)


async def cmd_positions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /positions — list all open trades."""
    from src.position_tracker import get_open_trades

    trades = get_open_trades()
    if not trades:
        await update.message.reply_text("No open trades.")
        return

    lines = ["\U0001f4cb Open Positions\n"]
    for t in trades:
        opt = "P" if t["trade_type"] == "CSP" else "C"
        lines.append(
            f"  {t['trade_type']} {t['ticker']} {t['expiry']} ${t['strike']:.2f}{opt} "
            f"@ ${t['premium']:.2f} x{t['quantity']}"
        )
    await update.message.reply_text("\n".join(lines))


def create_bot() -> Application:
    """Create and configure the Telegram bot application."""
    global _app
    token = os.getenv("TELEGRAM_TOKEN")
    if not token or token == "your_telegram_bot_token_here":
        logger.error("TELEGRAM_TOKEN not set in .env")
        return None

    _app = Application.builder().token(token).build()

    _app.add_handler(CommandHandler("status", cmd_status))
    _app.add_handler(CommandHandler("scan", cmd_scan))
    _app.add_handler(CommandHandler("pnl", cmd_pnl))
    _app.add_handler(CommandHandler("positions", cmd_positions))

    logger.info("Telegram bot created with command handlers")
    return _app
