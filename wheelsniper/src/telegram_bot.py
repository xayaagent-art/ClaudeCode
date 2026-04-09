"""
telegram_bot.py — Telegram bot for alerts and command interface.

Sends formatted trade signals with BB, VWAP, key levels, and provides commands:
/status, /scan, /pnl, /positions
"""

import logging
import os
from datetime import datetime

import pytz
from telegram import BotCommand, Update
from telegram.ext import Application, CommandHandler, ContextTypes

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

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
    vix_emoji = "\u2705" if env == "elevated" else ""
    return f"VIX: {vix if vix else 'N/A'} ({label}) {vix_emoji}".rstrip()


def _earnings_line(signal: dict) -> str:
    """Build earnings display line."""
    earnings = signal.get("earnings", {})
    if earnings.get("earnings_date"):
        days = earnings.get("days_until")
        date = earnings["earnings_date"]
        safe = "\u2705 Safe" if days and days > 10 else ""
        if days is not None:
            return f"\U0001f4c5 Earnings: {date} ({days}d away) {safe}".rstrip()
        return f"\U0001f4c5 Earnings: {date}"
    return "\U0001f4c5 Earnings: None in window \u2705"


def _macd_label(trend: str) -> str:
    """Format MACD trend label."""
    if trend == "bullish":
        return "\U0001f4c8 Bullish MACD"
    return "\U0001f4c9 Bearish MACD"


def _rsi_label(rsi: float) -> str:
    """Format RSI with oversold/overbought indicator."""
    if rsi < 30:
        return f"{rsi:.0f} \U0001f4c9 Oversold"
    if rsi < 40:
        return f"{rsi:.0f} \U0001f4c9 Near oversold"
    if rsi > 70:
        return f"{rsi:.0f} \U0001f4c8 Overbought"
    if rsi > 60:
        return f"{rsi:.0f} \U0001f4c8 Near overbought"
    return f"{rsi:.0f}"


def _bb_line(signal: dict) -> str:
    """Build Bollinger Bands display line."""
    bb_lower = signal.get("bb_lower")
    bb_upper = signal.get("bb_upper")
    pct_b = signal.get("bb_pct_b")
    position = signal.get("bb_position", "unknown")

    if bb_lower is None or bb_upper is None:
        return "BB: N/A"

    pos_flags = {
        "at_lower": "\U0001f3af At lower band",
        "at_upper": "\U0001f3af At upper band",
        "middle": "Middle",
        "unknown": "",
    }
    flag = pos_flags.get(position, "")
    pct_str = f"{pct_b:.2f}" if pct_b is not None else "N/A"
    return f"BB: ${bb_lower:.2f} / ${bb_upper:.2f} | %B: {pct_str} {flag}".rstrip()


def _vwap_line(signal: dict) -> str:
    """Build VWAP display line."""
    vwap = signal.get("vwap")
    position = signal.get("vwap_position", "unknown")
    if vwap is None:
        return "VWAP: N/A"
    if position == "below":
        return f"VWAP: ${vwap:.2f} (price below \u2705)"
    elif position == "above":
        return f"VWAP: ${vwap:.2f} (price above \u2705)"
    return f"VWAP: ${vwap:.2f}"


def _csp_key_levels_block(signal: dict) -> str:
    """Build key levels block for CSP alerts."""
    levels = signal.get("levels")
    if not levels:
        return ""

    lines = ["Key levels:"]
    pdl = levels.get("pdl")
    pwl = levels.get("pwl")
    monthly_low = levels.get("monthly_low")

    parts = []
    if pdl is not None:
        parts.append(f"PDL: ${pdl:.2f}")
    if pwl is not None:
        parts.append(f"PWL: ${pwl:.2f}")
    if monthly_low is not None:
        parts.append(f"Monthly low: ${monthly_low:.2f}")
    if parts:
        lines.append(" | ".join(parts))

    return "\n".join(lines)


def _cc_key_levels_block(signal: dict) -> str:
    """Build key levels block for CC alerts."""
    levels = signal.get("levels")
    if not levels:
        return ""

    lines = ["Key levels:"]
    pdh = levels.get("pdh")
    pwh = levels.get("pwh")
    monthly_high = levels.get("monthly_high")

    parts = []
    if pdh is not None:
        parts.append(f"PDH: ${pdh:.2f}")
    if pwh is not None:
        parts.append(f"PWH: ${pwh:.2f}")
    if monthly_high is not None:
        parts.append(f"Monthly high: ${monthly_high:.2f}")
    if parts:
        lines.append(" | ".join(parts))

    return "\n".join(lines)


def _strike_vs_basis_line(signal: dict) -> str:
    """Build strike vs cost basis line, adjusted for exit mode."""
    strike = signal["strike"]
    basis = signal["cost_basis"]
    conviction = signal.get("conviction", "medium")

    if conviction == "aggressive_exit":
        return f"Strike: ${strike:.2f} | Basis: ${basis:.2f} \U0001f534 EXIT MODE"
    elif conviction == "exit_efficient":
        return f"Strike: ${strike:.2f} vs basis ${basis:.2f} \U0001f7e0 EXIT"
    elif strike > basis:
        return f"Strike vs basis: ${strike:.2f} > ${basis:.2f} \u2705 Safe"
    else:
        return f"Strike vs basis: ${strike:.2f} <= ${basis:.2f} \u26a0\ufe0f Below basis"


def _score_line(signal: dict) -> str:
    """Build the score display line for an alert."""
    score = signal.get("score")
    label = signal.get("score_label", "")
    if score is None:
        return ""
    thesis = signal.get("ai_thesis")
    confidence = signal.get("ai_confidence")
    conf_str = f" | AI: {confidence}" if confidence else ""
    thesis_line = f"\n\U0001f9e0 {thesis}" if thesis else ""
    return f"\n{SEP}\n{label} ({score}/10){conf_str}{thesis_line}"


def _tags_block(tags: list) -> str:
    """Format signal tags as a block."""
    if not tags:
        return ""
    return "\n".join(tags)


def format_csp_alert(signal: dict) -> str:
    """Format a CSP signal into a Telegram message with full Phase 2B data."""
    direction = "\u2193" if signal["change_pct"] < 0 else "\u2191"
    day_emoji = "\U0001f534" if signal["change_pct"] < 0 else "\U0001f7e2"
    day_label = "Red day" if signal["change_pct"] < 0 else "Green day"

    vix_note = f"\n{signal['vix_note']}" if signal.get("vix_note") else ""

    # Build key levels + tags section
    key_levels = _csp_key_levels_block(signal)
    tags = _tags_block(signal.get("tags", []))
    levels_section = ""
    if key_levels or tags:
        parts = [p for p in [key_levels, tags] if p]
        levels_section = f"\n".join(parts) + "\n"

    return (
        f"\U0001f534 CSP SIGNAL \u2014 {signal['ticker']}\n"
        f"{SEP}\n"
        f"Price: ${signal['price']:.2f} ({direction} {abs(signal['change_pct']):.1f}%) "
        f"{day_emoji} {day_label} \u2705\n"
        f"RSI: {_rsi_label(signal['rsi_14'])} | IVR: {signal['ivr']:.0f} | IV: {signal['iv']:.0f}%\n"
        f"Trend: {_macd_label(signal['macd_trend'])} | {_vix_line(signal)}{vix_note}\n"
        f"{_bb_line(signal)}\n"
        f"{_vwap_line(signal)}\n"
        f"20MA: ${signal['ma_20']:.2f} | 50MA: ${signal['ma_50']:.2f} | {signal['ma_position']}\n"
        f"{SEP}\n"
        f"{levels_section}"
        f"{SEP}\n"
        f"Setup: {signal['expiry']} ${signal['strike']:.2f}P (DTE: {signal['dte']})\n"
        f"Delta: {signal['delta']:.2f} | Premium: ${signal['premium']:.2f}\n"
        f"Yield: {signal.get('cycle_roi', signal['yield_pct']):.1f}% / {signal['dte']} days | "
        f"Ann: ~{signal.get('annualized_roi', signal['annualized_yield']):.0f}% "
        f"{signal.get('yield_flag', '')}\n"
        f"Breakeven: ${signal['breakeven']:.2f}\n"
        f"{SEP}\n"
        f"{_earnings_line(signal)}\n"
        f"Action: SELL TO OPEN 1x {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}P"
        f"{_score_line(signal)}"
    )


def format_cc_alert(signal: dict) -> str:
    """Format a CC signal into a Telegram message with full Phase 2B data."""
    direction = "\u2191" if signal["change_pct"] > 0 else "\u2193"
    pnl_if_called = signal.get("pnl_if_called", 0)
    pnl_sign = "+" if pnl_if_called >= 0 else "-"
    contracts = signal.get("shares", 100) // 100

    vix_note = f"\n{signal['vix_note']}" if signal.get("vix_note") else ""

    # Build key levels + tags section
    key_levels = _cc_key_levels_block(signal)
    tags = _tags_block(signal.get("tags", []))
    levels_section = ""
    if key_levels or tags:
        parts = [p for p in [key_levels, tags] if p]
        levels_section = f"\n".join(parts) + "\n"

    return (
        f"\U0001f7e2 CC SIGNAL \u2014 {signal['ticker']}\n"
        f"{SEP}\n"
        f"Price: ${signal['price']:.2f} ({direction} {abs(signal['change_pct']):.1f}%) "
        f"\U0001f7e2 Green day \u2705\n"
        f"Cost basis: ${signal['cost_basis']:.2f} | "
        f"P&L if called: {pnl_sign}${abs(pnl_if_called):,.2f}\n"
        f"RSI: {_rsi_label(signal['rsi_14'])} | IVR: {signal['ivr']:.0f} | IV: {signal['iv']:.0f}%\n"
        f"Trend: {_macd_label(signal['macd_trend'])} | {_vix_line(signal)}{vix_note}\n"
        f"{_bb_line(signal)}\n"
        f"{_vwap_line(signal)}\n"
        f"20MA: ${signal['ma_20']:.2f} | 50MA: ${signal['ma_50']:.2f}\n"
        f"{SEP}\n"
        f"{levels_section}"
        f"{SEP}\n"
        f"Setup: {signal['expiry']} ${signal['strike']:.2f}C (DTE: {signal['dte']})\n"
        f"Delta: {signal['delta']:.2f} | Premium: ${signal['premium']:.2f}\n"
        f"Yield: {signal.get('cycle_roi', signal['yield_pct']):.1f}% / {signal['dte']} days | "
        f"Ann: ~{signal.get('annualized_roi', signal['annualized_yield']):.0f}% "
        f"{signal.get('yield_flag', '')}\n"
        f"{_strike_vs_basis_line(signal)}\n"
        f"{SEP}\n"
        f"{_earnings_line(signal)}\n"
        f"Action: SELL TO OPEN {contracts}x {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}C"
        f"{_score_line(signal)}"
    )


def format_close_alert(signal: dict, monthly_total: float = 0, monthly_target: int = 3500) -> str:
    """Format a time-weighted close signal into a Telegram message."""
    opt_type = "P" if signal["trade_type"] == "CSP" else "C"
    theta_label = "\u26a1 accelerating" if signal.get("theta_accelerating") else "normal"
    theta_daily = signal.get("theta_daily", 0)
    profit_target = signal.get("profit_target", 50)
    days_held = signal.get("days_held", 0)
    opened_date = signal.get("opened_date", "N/A")

    # Theta acceleration special format
    if signal.get("reason") == "theta_acceleration":
        return (
            f"\u26a1 THETA ALERT \u2014 {signal['ticker']} {signal['trade_type']}\n"
            f"{SEP}\n"
            f"Position entering fast theta decay zone (DTE: {signal['dte']})\n"
            f"Credit: ${signal['open_premium']:.2f} \u2192 Now: ${signal['current_price']:.2f}\n"
            f"Profit: {signal['profit_pct']:.0f}%\n"
            f"Consider closing at 35%+ profit now.\n"
            f"{SEP}\n"
            f"Action: BUY TO CLOSE {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}{opt_type}"
        )

    return (
        f"\u2705 CLOSE TARGET \u2014 {signal['ticker']} {signal['trade_type']}\n"
        f"{SEP}\n"
        f"Opened: {opened_date} ({days_held} days ago)\n"
        f"Credit: ${signal['open_premium']:.2f} \u2192 Now: ${signal['current_price']:.2f}\n"
        f"Profit: {signal['profit_pct']:.0f}% \U0001f3af {profit_target}% threshold hit\n"
        f"Days held: {days_held} | DTE remaining: {signal['dte']}\n"
        f"Theta: -${theta_daily:.2f}/day ({theta_label})\n"
        f"{SEP}\n"
        f"Monthly P&L: ${monthly_total:,.0f} / ${monthly_target:,} target\n"
        f"Action: BUY TO CLOSE {signal['ticker']} {signal['expiry']} ${signal['strike']:.2f}{opt_type}"
    )


def format_premarket_alert(
    date_str: str,
    spy_data: dict,
    qqq_data: dict,
    vix_level: float,
    movers_down: list[dict],
    movers_up: list[dict],
    avoid_list: list[dict],
) -> str:
    """Format the 8:00 AM pre-market scan alert."""
    spy_dir = "+" if spy_data and spy_data.get("premarket_change_pct", 0) >= 0 else ""
    qqq_dir = "+" if qqq_data and qqq_data.get("premarket_change_pct", 0) >= 0 else ""

    lines = [
        f"\U0001f304 Pre-Market Scan \u2014 {date_str} 8:00 AM ET",
        SEP,
    ]

    # Market indices
    if spy_data:
        lines.append(
            f"SPY pre-market: ${spy_data['premarket_price']:.2f} "
            f"({spy_dir}{spy_data['premarket_change_pct']:.1f}%)"
        )
    if qqq_data:
        lines.append(
            f"QQQ pre-market: ${qqq_data['premarket_price']:.2f} "
            f"({qqq_dir}{qqq_data['premarket_change_pct']:.1f}%)"
        )
    if vix_level:
        lines.append(f"VIX: {vix_level:.2f}")
    lines.append(SEP)

    # Movers down (CSP watch)
    if movers_down:
        lines.append("\U0001f4c9 MOVERS DOWN (CSP watch):")
        for m in movers_down:
            lines.append(
                f"\U0001f534 {m['ticker']} \u2193 {abs(m['premarket_change_pct']):.1f}% pre-mkt | "
                f"{_premarket_note(m)}"
            )
        lines.append(SEP)

    # Movers up (CC watch)
    if movers_up:
        lines.append("\U0001f4c8 MOVERS UP (CC watch):")
        for m in movers_up:
            lines.append(
                f"\U0001f7e2 {m['ticker']} \u2191 {m['premarket_change_pct']:.1f}% pre-mkt | "
                f"{_premarket_note(m)}"
            )
        lines.append(SEP)

    # Avoid list
    if avoid_list:
        lines.append("\u26a0\ufe0f AVOID TODAY:")
        for a in avoid_list:
            lines.append(
                f"{a['ticker']} \u2193 {abs(a['premarket_change_pct']):.1f}% \u2014 "
                f"unusual move, check news first"
            )
        lines.append(SEP)

    if not movers_down and not movers_up and not avoid_list:
        lines.append("\U0001f4ca Quiet pre-market \u2014 no major movers")
        lines.append(SEP)

    lines.append("Full morning brief with setups: 9:30 AM")

    return "\n".join(lines)


def _premarket_note(mover: dict) -> str:
    """Generate a note for a pre-market mover."""
    signal = mover.get("premarket_signal", "watch")
    if signal == "strong_csp":
        return "IV likely spiking"
    elif signal == "strong_cc":
        return "CC entry on open"
    elif signal == "avoid":
        return "unusual move, check news"
    return "Watch for entry"


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
    now = datetime.now(ET).strftime("%Y-%m-%d %H:%M ET")

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
    now = datetime.now(ET)

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
    """Handle /positions — list open positions from Notion Trade Log."""
    from src.notion_sync import format_positions_from_notion

    msg = format_positions_from_notion()
    await update.message.reply_text(msg)


async def cmd_notion(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /notion — show Notion connection status."""
    from src.notion_sync import format_notion_status

    msg = format_notion_status()
    await update.message.reply_text(msg)


async def cmd_analyze(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /analyze TICKER — AI-powered ticker analysis."""
    from src.ai_analyst import analyze_ticker

    if not context.args:
        await update.message.reply_text("Usage: /analyze TICKER (e.g. /analyze SOFI)")
        return

    ticker = context.args[0].upper()
    await update.message.reply_text(f"\U0001f50d Analyzing {ticker}...")

    result = analyze_ticker(ticker)
    if not result:
        await update.message.reply_text(f"Could not analyze {ticker}. Check ticker or try again.")
        return

    # Truncate to stay under Telegram's 4096 char limit
    if len(result) > 3800:
        result = result[:3800] + "\n...(truncated)"

    try:
        await update.message.reply_text(result)
    except Exception as e:
        logger.error(f"/analyze send failed for {ticker}: {e}")
        await update.message.reply_text(
            f"Analysis ready but message too long. Try /analyze {ticker} again."
        )


async def _post_init(application: Application):
    """Register command menu with BotFather after bot initializes."""
    commands = [
        BotCommand("status", "Bot health and status"),
        BotCommand("scan", "Run manual signal scan"),
        BotCommand("pnl", "Monthly P&L breakdown"),
        BotCommand("positions", "View open positions from Notion"),
        BotCommand("analyze", "Analyze any ticker for wheel setup"),
        BotCommand("notion", "Check Notion connection status"),
    ]
    await application.bot.set_my_commands(commands)
    logger.info("Bot commands registered with Telegram")


def create_bot() -> Application:
    """Create and configure the Telegram bot application."""
    global _app
    token = os.getenv("TELEGRAM_TOKEN")
    if not token or token == "your_telegram_bot_token_here":
        logger.error("TELEGRAM_TOKEN not set in .env")
        return None

    _app = Application.builder().token(token).post_init(_post_init).build()

    _app.add_handler(CommandHandler("status", cmd_status))
    _app.add_handler(CommandHandler("scan", cmd_scan))
    _app.add_handler(CommandHandler("pnl", cmd_pnl))
    _app.add_handler(CommandHandler("positions", cmd_positions))
    _app.add_handler(CommandHandler("notion", cmd_notion))
    _app.add_handler(CommandHandler("analyze", cmd_analyze))

    logger.info("Telegram bot created with command handlers")
    return _app
