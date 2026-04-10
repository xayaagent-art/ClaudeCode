"""
telegram_bot.py — Telegram bot for alerts and command interface.

Sends formatted trade signals with BB, VWAP, key levels, and provides commands:
/status, /scan, /pnl, /positions
"""

import logging
import os
from datetime import datetime
from typing import Optional

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


def _urgency_emoji(score: float) -> str:
    """Map signal score to urgency header emoji + label."""
    if score is None:
        return "\U0001f7e1 WATCH"
    if score >= 9:
        return "\U0001f6a8 ACT NOW"
    if score >= 7:
        return "\U0001f534 STRONG"
    return "\U0001f7e1 WATCH"


# Priority order for compact TA flag display (lower index = higher priority)
_TA_FLAG_PRIORITY = [
    ("triple floor", "\U0001f3f0 Triple floor"),
    ("triple ceiling", "\U0001f3f0 Triple ceiling"),
    ("oversold bounce", "\u26a1 Oversold bounce"),
    ("overbought", "\U0001f4db Overbought fade"),
    ("vwap reclaim", "\U0001f4c8 VWAP reclaimed"),
    ("vwap lost", "\U0001f4c9 VWAP lost"),
    ("bb squeeze", "\U0001f3af BB squeeze"),
    ("peak theta", "\u23f1\ufe0f Peak theta zone"),
    ("support confluence", "\U0001f4aa Support confluence"),
    ("resistance confluence", "\U0001f4aa Resistance confluence"),
    ("near previous day low", "\U0001f4cd Near PDL"),
    ("near previous day high", "\U0001f4cd Near PDH"),
]


def _top_ta_flags(signal: dict, limit: int = 2) -> list[str]:
    """Return up to `limit` highest-priority TA flags for compact display.

    Walks the TA priority list and picks the first `limit` matches from the
    signal's ta_tags + tags lists. Case-insensitive substring match.
    """
    tags = (signal.get("ta_tags") or []) + (signal.get("tags") or [])
    tags_lc = [(t, t.lower()) for t in tags if isinstance(t, str)]
    picked = []
    seen = set()
    for needle, display in _TA_FLAG_PRIORITY:
        for original, lc in tags_lc:
            if needle in lc and display not in seen:
                picked.append(display)
                seen.add(display)
                break
        if len(picked) >= limit:
            break
    return picked


def _vol_chip(signal: dict) -> str:
    """Return volume chip string for the compact format."""
    vol = signal.get("vol_context") or {}
    display = vol.get("display")
    if display:
        return display
    return "Vol normal"


def _score_tier_label(score: float) -> str:
    """Short tier label for the footer line."""
    if score is None:
        return ""
    if score >= 9:
        return "\U0001f525 STRONG"
    if score >= 7:
        return "\u2b50 GOOD"
    if score >= 6:
        return "\U0001f44d DECENT"
    if score >= 5:
        return "moderate"
    return "weak"


def _ai_footer(signal: dict) -> str:
    """Short AI confidence suffix for the footer line."""
    confidence = signal.get("ai_confidence")
    if not confidence:
        return ""
    return f" | AI: {confidence}"


def _pct_from_pdl(signal: dict) -> Optional[float]:
    """Percent distance of current price above PDL (positive = above support)."""
    price = signal.get("price") or 0
    levels = signal.get("levels") or {}
    pdl = levels.get("pdl")
    if not pdl or price <= 0:
        return None
    return (price - pdl) / pdl * 100


def _pct_from_pdh(signal: dict) -> Optional[float]:
    """Percent distance of current price below PDH (positive = below ceiling)."""
    price = signal.get("price") or 0
    levels = signal.get("levels") or {}
    pdh = levels.get("pdh")
    if not pdh or price <= 0:
        return None
    return (pdh - price) / pdh * 100


def _earnings_compact(signal: dict) -> Optional[str]:
    """Compact earnings line — only show if within 45 days."""
    earnings = signal.get("earnings") or {}
    days = earnings.get("days_until")
    date = earnings.get("earnings_date")
    if date and days is not None and days <= 45:
        return f"\U0001f4c5 Earnings in {days}d ({date})"
    return None


def _tags_block(tags: list) -> str:
    """Format signal tags as a block."""
    if not tags:
        return ""
    return "\n".join(tags)


def format_csp_alert(signal: dict) -> str:
    """Format a CSP signal into a compact 9-line Telegram message.

    Layout:
      1. [URGENCY] [TICKER] CSP \u00b7 [TIME ET]
      2. $[STRIKE]P [EXPIRY] \u00b7 [DTE]DTE \u00b7 $[PREMIUM] \u00b7 [ANN]% ann \u00b7 \u0394[DELTA]
      3. $[PRICE] [\u00b1X.X%] from open \u00b7 [X]% from PDL \u00b7 Vol [tag]
      4. RSI [X] \u00b7 IVR [X] \u00b7 IV [X]% \u00b7 VIX [X]
      5. [up to 2 TA flags]
      6. \U0001f9e0 [AI thesis]
      7. [Earnings line — only if within 45 days]
      8. \u2500\u2500\u2500
      9. SELL [Xx] [TICKER] [EXPIRY] $[STRIKE]P \u00b7 Score [X]/10 [TIER]
    """
    ticker = signal["ticker"]
    score = signal.get("score") or 0
    urgency = _urgency_emoji(score)
    sig_time = signal.get("signal_time") or datetime.now(ET).strftime("%H:%M ET")

    strike = signal["strike"]
    expiry = signal["expiry"]
    dte = signal["dte"]
    premium = signal["premium"]
    ann = signal.get("annualized_roi", signal.get("annualized_yield", 0))
    delta = signal.get("delta", 0)

    price = signal["price"]
    change_from_open = signal.get("change_from_open_pct", signal.get("change_pct", 0))
    from_open_arrow = "\u2191" if change_from_open >= 0 else "\u2193"
    pdl_pct = _pct_from_pdl(signal)
    pdl_str = f"{pdl_pct:+.1f}% from PDL" if pdl_pct is not None else "PDL N/A"
    vol_chip = _vol_chip(signal)

    rsi_val = signal.get("rsi_14")
    rsi_str = f"{rsi_val:.0f}" if rsi_val is not None else "N/A"
    ivr_str = f"{signal['ivr']:.0f}"
    iv_str = f"{signal['iv']:.0f}%"
    vix_val = signal.get("vix_level")
    vix_str = f"{vix_val:.0f}" if vix_val is not None else "N/A"

    ta_flags = _top_ta_flags(signal, limit=2)
    ta_line = " \u00b7 ".join(ta_flags) if ta_flags else "\u2014 no TA flags"

    thesis = signal.get("ai_thesis")
    thesis_line = f"\U0001f9e0 {thesis}" if thesis else ""

    earnings = _earnings_compact(signal)
    time_note = signal.get("time_note")

    # Build optional lines (thesis, earnings, time note)
    optional_lines = []
    if thesis_line:
        optional_lines.append(thesis_line)
    if earnings:
        optional_lines.append(earnings)
    if time_note:
        optional_lines.append(time_note)

    tier = _score_tier_label(score)
    ai_footer = _ai_footer(signal)

    lines = [
        f"{urgency} \u2014 {ticker} CSP  [{sig_time}]",
        f"${strike:.2f}P {expiry} \u00b7 {dte}DTE \u00b7 ${premium:.2f} \u00b7 {ann:.0f}% ann \u00b7 \u0394{delta:.2f}",
        f"${price:.2f} {from_open_arrow}{abs(change_from_open):.1f}% from open \u00b7 {pdl_str} \u00b7 {vol_chip}",
        f"RSI {rsi_str} \u00b7 IVR {ivr_str} \u00b7 IV {iv_str} \u00b7 VIX {vix_str}",
        ta_line,
    ]
    lines.extend(optional_lines)
    lines.append("\u2500" * 23)
    lines.append(
        f"SELL TO OPEN 1x {ticker} {expiry} ${strike:.2f}P \u00b7 "
        f"Score: {score}/10 {tier}{ai_footer}"
    )
    return "\n".join(lines)


def format_cc_alert(signal: dict) -> str:
    """Format a CC signal into a compact 9-line Telegram message.

    Same layout as CSP but with call strike, cost basis, conviction mode,
    and SELL/BUY BACK based on trade side.
    """
    ticker = signal["ticker"]
    score = signal.get("score") or 0
    urgency = _urgency_emoji(score)
    sig_time = signal.get("signal_time") or datetime.now(ET).strftime("%H:%M ET")

    strike = signal["strike"]
    expiry = signal["expiry"]
    dte = signal["dte"]
    premium = signal["premium"]
    ann = signal.get("annualized_roi", signal.get("annualized_yield", 0))
    delta = signal.get("delta", 0)

    price = signal["price"]
    change_from_open = signal.get("change_from_open_pct", signal.get("change_pct", 0))
    from_open_arrow = "\u2191" if change_from_open >= 0 else "\u2193"
    pdh_pct = _pct_from_pdh(signal)
    pdh_str = f"{pdh_pct:+.1f}% from PDH" if pdh_pct is not None else "PDH N/A"
    vol_chip = _vol_chip(signal)

    cost_basis = signal.get("cost_basis", 0)
    conviction = signal.get("conviction", "medium")
    mode_label = {
        "aggressive_exit": "AGG EXIT",
        "exit_efficient": "EXIT EFF",
        "medium": "STANDARD",
        "high": "CONSERV",
    }.get(conviction, conviction.upper())

    rsi_val = signal.get("rsi_14")
    rsi_str = f"{rsi_val:.0f}" if rsi_val is not None else "N/A"
    ivr_str = f"{signal['ivr']:.0f}"
    iv_str = f"{signal['iv']:.0f}%"
    vix_val = signal.get("vix_level")
    vix_str = f"{vix_val:.0f}" if vix_val is not None else "N/A"

    ta_flags = _top_ta_flags(signal, limit=2)
    ta_line = " \u00b7 ".join(ta_flags) if ta_flags else "\u2014 no TA flags"

    thesis = signal.get("ai_thesis")
    thesis_line = f"\U0001f9e0 {thesis}" if thesis else ""

    earnings = _earnings_compact(signal)
    time_note = signal.get("time_note")

    optional_lines = []
    if thesis_line:
        optional_lines.append(thesis_line)
    if earnings:
        optional_lines.append(earnings)
    if time_note:
        optional_lines.append(time_note)

    tier = _score_tier_label(score)
    ai_footer = _ai_footer(signal)

    contracts = signal.get("shares", 100) // 100
    action_verb = "SELL TO OPEN"

    lines = [
        f"{urgency} \u2014 {ticker} CC  [{sig_time}]",
        f"${strike:.2f}C {expiry} \u00b7 {dte}DTE \u00b7 ${premium:.2f} \u00b7 {ann:.0f}% ann \u00b7 \u0394{delta:.2f}",
        f"${price:.2f} {from_open_arrow}{abs(change_from_open):.1f}% from open \u00b7 {pdh_str} \u00b7 {vol_chip}",
        f"Basis ${cost_basis:.2f} \u00b7 {mode_label} mode \u00b7 RSI {rsi_str} \u00b7 IVR {ivr_str} \u00b7 IV {iv_str} \u00b7 VIX {vix_str}",
        ta_line,
    ]
    lines.extend(optional_lines)
    lines.append("\u2500" * 23)
    lines.append(
        f"{action_verb} {contracts}x {ticker} {expiry} ${strike:.2f}C \u00b7 "
        f"Score: {score}/10 {tier}{ai_footer}"
    )
    return "\n".join(lines)


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

    # Log which Notion DB the /notion and /positions handlers will query
    from src.notion_sync import NOTION_DB_ID
    logger.info(f"[BOT] /notion handler using DB: {NOTION_DB_ID}")
    logger.info(f"[BOT] /positions handler using DB: {NOTION_DB_ID}")


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
