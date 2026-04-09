"""
notion_sync.py — Notion Trade Log integration.

Syncs open positions, logs signals, tracks intraday premium,
and provides position monitoring with close/roll alerts.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import pytz

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

NOTION_DB_ID = "0d26868c0c174ea1be3e11938099c2d4"

# Log the database ID at import time so it shows in Railway startup logs
logger.info(f"[NOTION] Using database ID: {NOTION_DB_ID}")

# Cache open positions for 5 minutes
_positions_cache: dict = {"data": None, "timestamp": None}
_POSITIONS_CACHE_SECONDS = 300

# Intraday premium tracking (resets at 4pm daily)
_intraday_data: dict = {}
_intraday_date: Optional[str] = None

# Dedup for close/premium alerts
_alert_dedup: dict = {}

SEP = "\u2501" * 24


def _get_client():
    """Get Notion client."""
    try:
        from notion_client import Client
        api_key = os.getenv("NOTION_API_KEY")
        if not api_key:
            logger.warning("NOTION_API_KEY not set")
            return None
        return Client(auth=api_key)
    except ImportError:
        logger.warning("notion-client package not installed")
        return None


def get_open_positions() -> list[dict]:
    """Query Trade Log for Status = 'Open'. Cached for 5 min."""
    global _positions_cache

    now = datetime.now(ET)
    if (_positions_cache["data"] is not None
            and _positions_cache["timestamp"]
            and (now - _positions_cache["timestamp"]).total_seconds() < _POSITIONS_CACHE_SECONDS):
        return _positions_cache["data"]

    client = _get_client()
    if not client:
        return []

    try:
        result = client.databases.query(
            database_id=NOTION_DB_ID,
            filter={"property": "Status", "status": {"equals": "Open"}},
        )
        logger.info(f"[NOTION] Query returned {len(result.get('results', []))} pages")

        positions = []
        for page in result.get("results", []):
            props = page["properties"]
            pos = {
                "page_id": page["id"],
                "ticker": _get_text(props.get("Ticker")),
                "type": _get_select(props.get("Type")),
                "strike": _get_number(props.get("Strike")),
                "expiry": _get_date(props.get("Expiry")),
                "premium": _get_number(props.get("Premium Received")),
                "contracts": _get_number(props.get("Contracts")) or 1,
                "open_date": _get_date(props.get("Open Date")),
                "dte_at_open": _get_number(props.get("DTE at Open")),
                "iv_at_open": _get_number(props.get("IV at Open")),
                "signal_score": _get_number(props.get("Signal Score")),
                "notes": _get_text(props.get("Notes")),
            }
            if pos["ticker"] and pos["strike"]:
                positions.append(pos)

        _positions_cache["data"] = positions
        _positions_cache["timestamp"] = now
        logger.info(f"Notion: {len(positions)} open positions loaded")
        return positions

    except Exception as e:
        logger.error(f"Notion query failed: {e}")
        return _positions_cache.get("data") or []


async def track_position_targets(send_alert_fn=None) -> list[dict]:
    """Check open positions against time-weighted close targets.

    Returns list of close alert dicts. Fires Telegram alert if send_alert_fn provided.
    """
    positions = get_open_positions()
    if not positions:
        return []

    alerts = []
    today = datetime.now(ET).date()

    for pos in positions:
        try:
            ticker = pos["ticker"]
            strike = pos["strike"]
            expiry_str = pos["expiry"]
            premium = pos["premium"]
            if not all([ticker, strike, expiry_str, premium]):
                continue

            expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
            dte = (expiry_date - today).days
            if dte < 0:
                continue

            open_date_str = pos.get("open_date")
            if open_date_str:
                open_date = datetime.strptime(open_date_str, "%Y-%m-%d").date()
                days_held = (today - open_date).days
            else:
                days_held = 0

            # Time-weighted close target
            if dte < 7:
                target = 25
            elif days_held <= 3:
                target = 35
            elif days_held <= 7:
                target = 40
            else:
                target = 50

            # Fetch current option mark price
            current = _get_current_option_price(ticker, strike, expiry_str, pos["type"])
            if current is None:
                continue

            profit_pct = ((premium - current) / premium) * 100 if premium > 0 else 0

            if profit_pct >= target:
                dedup_key = f"close_{ticker}_{strike}_{expiry_str}"
                if _should_alert(dedup_key, hours=6):
                    opt_type = "P" if pos["type"] == "CSP" else "C"
                    alert = {
                        "ticker": ticker,
                        "type": pos["type"],
                        "strike": strike,
                        "expiry": expiry_str,
                        "premium": premium,
                        "current": round(current, 2),
                        "profit_pct": round(profit_pct, 1),
                        "target": target,
                        "days_held": days_held,
                        "dte": dte,
                        "opt_type": opt_type,
                    }
                    alerts.append(alert)

                    if send_alert_fn:
                        msg = _format_close_target_alert(alert)
                        await send_alert_fn(msg)

        except Exception as e:
            logger.debug(f"Position target check failed for {pos.get('ticker')}: {e}")

    return alerts


async def track_intraday_premium(send_alert_fn=None) -> list[dict]:
    """Track option premium high/low for open positions.

    Fires alerts for:
    - CSP close window (premium near day low, buy back cheap)
    - Position moving against (premium near day high)
    - IV spike (>25% from morning baseline)
    - IV crush close signal (IV dropped >20% from position open IV in Notion)
    Iterates ALL open positions from Notion Trade Log.
    """
    global _intraday_data, _intraday_date

    today_str = datetime.now(ET).strftime("%Y-%m-%d")
    if _intraday_date != today_str:
        _intraday_data = {}
        _intraday_date = today_str

    positions = get_open_positions()
    if not positions:
        return []

    alerts = []

    for pos in positions:
        try:
            ticker = pos["ticker"]
            strike = pos["strike"]
            expiry_str = pos["expiry"]
            premium = pos["premium"]
            if not all([ticker, strike, expiry_str, premium]):
                continue
            opt_type = "P" if pos["type"] == "CSP" else "C"
            key = f"{ticker}_{strike}{opt_type}_{expiry_str}"

            current = _get_current_option_price(ticker, strike, expiry_str, pos["type"])
            if current is None:
                continue

            current_iv = _get_current_option_iv(ticker, strike, expiry_str, pos["type"])

            # Initialize or update intraday tracking
            if key not in _intraday_data:
                _intraday_data[key] = {
                    "day_high": current,
                    "day_low": current,
                    "morning_price": current,
                    "morning_iv": current_iv,
                    "prices": [current],
                }
            else:
                entry = _intraday_data[key]
                if current > entry["day_high"]:
                    entry["day_high"] = current
                if current < entry["day_low"]:
                    entry["day_low"] = current
                entry["prices"].append(current)

            entry = _intraday_data[key]
            profit_pct = ((premium - current) / premium) * 100 if premium > 0 else 0

            # Calculate pct_of_range for timing intelligence
            day_range = entry["day_high"] - entry["day_low"]
            if day_range > 0:
                pct_of_range = (current - entry["day_low"]) / day_range
            else:
                pct_of_range = 0.5

            # Alert 1: CSP CLOSE WINDOW — premium near day low, buy back cheap
            if (pct_of_range <= 0.20
                    and current <= premium * 0.50
                    and profit_pct > 20):
                dedup_key = f"intraday_{ticker}_{strike}_day_low_{today_str}"
                if _should_alert(dedup_key, hours=2):
                    alert = {
                        "alert_type": "day_low",
                        "ticker": ticker, "type": pos["type"],
                        "strike": strike, "expiry": expiry_str,
                        "opt_type": opt_type,
                        "current": round(current, 2),
                        "day_low": round(entry["day_low"], 2),
                        "day_high": round(entry["day_high"], 2),
                        "profit_pct": round(profit_pct, 1),
                        "original_premium": round(premium, 2),
                        "pct_of_range": round(pct_of_range, 2),
                    }
                    alerts.append(alert)
                    if send_alert_fn:
                        msg = _format_day_low_alert(alert)
                        await send_alert_fn(msg)

            # Alert 2: Near day high (moving against)
            if (pct_of_range >= 0.80
                    and profit_pct < -15):
                dedup_key = f"intraday_{ticker}_{strike}_day_high_{today_str}"
                if _should_alert(dedup_key, hours=2):
                    alert = {
                        "alert_type": "day_high",
                        "ticker": ticker, "type": pos["type"],
                        "strike": strike, "expiry": expiry_str,
                        "opt_type": opt_type,
                        "current": round(current, 2),
                        "day_low": round(entry["day_low"], 2),
                        "day_high": round(entry["day_high"], 2),
                        "profit_pct": round(profit_pct, 1),
                    }
                    alerts.append(alert)
                    if send_alert_fn:
                        msg = _format_day_high_alert(alert)
                        await send_alert_fn(msg)

            # Alert 3: IV spike >25% from morning baseline
            morning_iv = entry.get("morning_iv")
            if (current_iv and morning_iv
                    and current_iv > morning_iv * 1.25):
                dedup_key = f"intraday_{ticker}_{strike}_iv_spike_{today_str}"
                if _should_alert(dedup_key, hours=2):
                    alert = {
                        "alert_type": "iv_spike",
                        "ticker": ticker, "type": pos["type"],
                        "strike": strike, "expiry": expiry_str,
                        "opt_type": opt_type,
                        "current_iv": round(current_iv, 1),
                        "morning_iv": round(morning_iv, 1),
                        "iv_change": round(current_iv - morning_iv, 1),
                    }
                    alerts.append(alert)
                    if send_alert_fn:
                        msg = _format_iv_spike_alert(alert)
                        await send_alert_fn(msg)

            # Alert 4: IV CRUSH — IV dropped >20% from position open IV (from Notion)
            iv_at_open = pos.get("iv_at_open")
            if (current_iv and iv_at_open
                    and iv_at_open > 0
                    and current_iv < iv_at_open * 0.80):
                dedup_key = f"intraday_{ticker}_{strike}_iv_crush_{today_str}"
                if _should_alert(dedup_key, hours=4):
                    alert = {
                        "alert_type": "iv_crush",
                        "ticker": ticker, "type": pos["type"],
                        "strike": strike, "expiry": expiry_str,
                        "opt_type": opt_type,
                        "current_iv": round(current_iv, 1),
                        "open_iv": round(iv_at_open, 1),
                        "profit_pct": round(profit_pct, 1),
                    }
                    alerts.append(alert)
                    if send_alert_fn:
                        msg = _format_iv_crush_alert(alert)
                        await send_alert_fn(msg)

        except Exception as e:
            logger.debug(f"Intraday tracking failed for {pos.get('ticker')}: {e}")

    return alerts


def get_premium_timing(ticker: str, strike: float, expiry: str, trade_type: str) -> dict:
    """Get premium timing data for a signal candidate.

    Returns pct_of_range and timing flags for CC/CSP timing intelligence.
    Called by signal_engine to add timing context to new signals.
    """
    global _intraday_data, _intraday_date

    today_str = datetime.now(ET).strftime("%Y-%m-%d")
    if _intraday_date != today_str:
        _intraday_data = {}
        _intraday_date = today_str

    opt_type = "P" if trade_type == "CSP" else "C"
    key = f"{ticker}_{strike}{opt_type}_{expiry}"

    current = _get_current_option_price(ticker, strike, expiry, trade_type)
    if current is None:
        return {"pct_of_range": None, "timing_tag": None}

    if key not in _intraday_data:
        _intraday_data[key] = {
            "day_high": current,
            "day_low": current,
            "morning_price": current,
            "morning_iv": None,
            "prices": [current],
        }
    else:
        entry = _intraday_data[key]
        if current > entry["day_high"]:
            entry["day_high"] = current
        if current < entry["day_low"]:
            entry["day_low"] = current
        entry["prices"].append(current)

    entry = _intraday_data[key]
    day_range = entry["day_high"] - entry["day_low"]
    if day_range > 0:
        pct_of_range = (current - entry["day_low"]) / day_range
    else:
        pct_of_range = 0.5

    timing_tag = None
    if trade_type == "CC" and pct_of_range >= 0.80:
        timing_tag = (
            f"\U0001f514 PREMIUM PEAK \u2014 near day high ${current:.2f}. "
            f"Best fill window NOW."
        )

    return {
        "pct_of_range": round(pct_of_range, 2),
        "current_premium": round(current, 2),
        "day_high": round(entry["day_high"], 2),
        "day_low": round(entry["day_low"], 2),
        "timing_tag": timing_tag,
    }


def log_signal_to_notion(signal: dict) -> bool:
    """Log a signal scoring 7+ to the Notion Trade Log."""
    client = _get_client()
    if not client:
        return False

    try:
        ticker = signal.get("ticker", "")
        sig_type = signal.get("type", "CSP")
        strike = signal.get("strike", 0)
        expiry = signal.get("expiry", "")
        premium = signal.get("premium", 0)
        dte = signal.get("dte", 0)
        score = signal.get("score", 0)
        thesis = signal.get("ai_thesis", "")
        iv = signal.get("iv", 0)
        opt_type = "P" if sig_type == "CSP" else "C"
        today = datetime.now(ET).strftime("%Y-%m-%d")

        properties = {
            "Trade": {"title": [{"text": {"content": f"{ticker} {strike}{opt_type} {expiry} [SIGNAL]"}}]},
            "Ticker": {"rich_text": [{"text": {"content": ticker}}]},
            "Type": {"select": {"name": sig_type}},
            "Strike": {"number": strike},
            "Premium Received": {"number": premium},
            "Contracts": {"number": 1},
            "Status": {"status": {"name": "Open"}},
            "Open Date": {"date": {"start": today}},
            "DTE at Open": {"number": dte},
            "Signal Score": {"number": score},
            "Notes": {"rich_text": [{"text": {"content": f"Bot signal \u2014 update when traded or delete"}}]},
        }

        if expiry:
            properties["Expiry"] = {"date": {"start": expiry}}
        if thesis:
            properties["AI Thesis"] = {"rich_text": [{"text": {"content": thesis[:2000]}}]}
        if iv:
            properties["IV at Open"] = {"number": round(iv, 1)}

        client.pages.create(
            parent={"database_id": NOTION_DB_ID},
            properties=properties,
        )
        logger.info(f"Logged signal to Notion: {ticker} {sig_type} {strike}{opt_type}")
        return True

    except Exception as e:
        logger.error(f"Failed to log signal to Notion: {e}")
        return False


def get_notion_status() -> dict:
    """Get Notion connection status for /notion command."""
    client = _get_client()
    now = datetime.now(ET).strftime("%H:%M ET")

    if not client:
        return {
            "connected": False,
            "trade_log": False,
            "open_positions": 0,
            "last_sync": now,
        }

    try:
        positions = get_open_positions()
        return {
            "connected": True,
            "trade_log": True,
            "open_positions": len(positions),
            "last_sync": now,
        }
    except Exception:
        return {
            "connected": True,
            "trade_log": False,
            "open_positions": 0,
            "last_sync": now,
        }


def format_positions_from_notion() -> str:
    """Format open positions from Notion for /positions command."""
    positions = get_open_positions()
    if not positions:
        return "No open positions in Notion."

    today = datetime.now(ET).date()
    lines = [f"\U0001f4cb Open Positions (from Notion):", SEP]

    for i, pos in enumerate(positions, 1):
        ticker = pos["ticker"]
        opt_type = "P" if pos["type"] == "CSP" else "C"
        strike = pos["strike"]
        expiry = pos["expiry"] or "N/A"
        premium = pos["premium"] or 0
        contracts = pos["contracts"] or 1

        # Calculate DTE
        dte_str = "N/A"
        if expiry != "N/A":
            try:
                exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
                dte = (exp_date - today).days
                dte_str = str(dte)
            except ValueError:
                pass

        # Get current price
        current = _get_current_option_price(ticker, strike, expiry, pos["type"])
        if current is not None:
            profit_pct = ((premium - current) / premium) * 100 if premium > 0 else 0
            profit_dollars = (premium - current) * 100 * contracts
            pnl_sign = "+" if profit_dollars >= 0 else ""
            current_line = f"   Current: ${current:.2f} | P&L: {pnl_sign}${profit_dollars:,.0f} ({profit_pct:+.0f}%)"
        else:
            current_line = "   Current: unavailable"

        lines.append(
            f"{i}. {ticker} ${strike}{opt_type} {expiry} \u2014 ${premium:.2f} credit ({contracts} contract{'s' if contracts > 1 else ''})"
        )
        lines.append(current_line)
        if dte_str != "N/A":
            lines.append(f"   DTE: {dte_str}")

    lines.append(SEP)
    lines.append(f"Total: {len(positions)} open position{'s' if len(positions) != 1 else ''}")
    return "\n".join(lines)


def format_notion_status() -> str:
    """Format Notion status for /notion command."""
    status = get_notion_status()
    conn = "\u2705 Connected" if status["connected"] else "\u274c Not connected"
    log = "\u2705 Found" if status["trade_log"] else "\u274c Not found"

    return (
        f"\U0001f4d2 Notion Status\n"
        f"{SEP}\n"
        f"Connection: {conn}\n"
        f"Trade Log: {log}\n"
        f"Open positions: {status['open_positions']}\n"
        f"Last sync: {status['last_sync']}"
    )


# --- Alert formatters ---

def _format_close_target_alert(alert: dict) -> str:
    return (
        f"\u2705 CLOSE TARGET HIT \u2014 {alert['ticker']} {alert['type']}\n"
        f"{SEP}\n"
        f"{alert['strike']}{alert['opt_type']} exp {alert['expiry']}\n"
        f"Opened: ${alert['premium']:.2f} | Now: ${alert['current']:.2f}\n"
        f"Profit: {alert['profit_pct']:.0f}% \U0001f3af ({alert['target']}% target)\n"
        f"Days held: {alert['days_held']} | DTE: {alert['dte']}\n"
        f"{SEP}\n"
        f"Action: BUY TO CLOSE on Robinhood\n"
        f"Update Notion status when done \u2705"
    )


def _format_day_low_alert(alert: dict) -> str:
    orig = alert.get("original_premium", 0)
    pct_str = ""
    if orig > 0:
        pct_str = f" ({alert['profit_pct']:.0f}% of original ${orig:.2f})"
    return (
        f"\U0001f4b0 {alert['ticker']} ${alert['strike']}{alert['opt_type']} "
        f"\u2014 Premium crushed to ${alert['current']:.2f}{pct_str}.\n"
        f"Close now, lock profit, redeploy capital.\n"
        f"{SEP}\n"
        f"Day range: ${alert['day_low']:.2f}\u2013${alert['day_high']:.2f}\n"
        f"Profit if closed now: {alert['profit_pct']:.0f}%"
    )


def _format_day_high_alert(alert: dict) -> str:
    return (
        f"\U0001f534 {alert['ticker']} ${alert['strike']}{alert['opt_type']} "
        f"\u2014 Premium near day high ${alert['current']:.2f}.\n"
        f"Position moving against you. Review.\n"
        f"{SEP}\n"
        f"Day range: ${alert['day_low']:.2f}\u2013${alert['day_high']:.2f}\n"
        f"P&L: {alert['profit_pct']:.0f}%"
    )


def _format_iv_spike_alert(alert: dict) -> str:
    return (
        f"\u26a1 {alert['ticker']} IV spike \u2014 "
        f"IV now {alert['current_iv']:.0f}% vs morning {alert['morning_iv']:.0f}%. "
        f"Act now.\n"
        f"{SEP}\n"
        f"+{alert['iv_change']:.0f}% spike \u2014 premium inflated\n"
        f"Open position: {alert['type']} \u2014 high IV = good roll window"
    )


def _format_iv_crush_alert(alert: dict) -> str:
    return (
        f"\U0001f4c9 IV CRUSH \u2014 {alert['ticker']} "
        f"IV now {alert['current_iv']:.0f}% vs {alert['open_iv']:.0f}% at open.\n"
        f"Premium decayed fast. Consider closing "
        f"${alert['strike']}{alert['opt_type']}.\n"
        f"{SEP}\n"
        f"P&L: {alert['profit_pct']:.0f}%"
    )


# --- Helpers ---

def _get_current_option_price(
    ticker: str, strike: float, expiry: str, trade_type: str,
) -> Optional[float]:
    """Fetch current mark price for an option from yfinance."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        chain = stock.option_chain(expiry)
        options = chain.puts if trade_type == "CSP" else chain.calls

        match = options[options["strike"] == strike]
        if match.empty:
            return None

        row = match.iloc[0]
        bid = float(row.get("bid", 0) or 0)
        ask = float(row.get("ask", 0) or 0)
        if bid > 0 and ask > 0:
            return round((bid + ask) / 2, 2)
        return round(float(row.get("lastPrice", 0) or 0), 2)

    except Exception:
        return None


def _get_current_option_iv(
    ticker: str, strike: float, expiry: str, trade_type: str,
) -> Optional[float]:
    """Fetch current IV for a specific option."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        chain = stock.option_chain(expiry)
        options = chain.puts if trade_type == "CSP" else chain.calls

        match = options[options["strike"] == strike]
        if match.empty:
            return None

        row = match.iloc[0]
        iv = float(row.get("impliedVolatility", 0) or 0)
        return round(iv * 100, 1) if iv > 0 else None

    except Exception:
        return None


def _should_alert(key: str, hours: int) -> bool:
    """Simple in-memory dedup for Notion-based alerts."""
    now = datetime.now(ET)
    last = _alert_dedup.get(key)
    if last and (now - last).total_seconds() < hours * 3600:
        return False
    _alert_dedup[key] = now
    return True


def _get_text(prop: dict) -> str:
    """Extract text from Notion rich_text or title property."""
    if not prop:
        return ""
    prop_type = prop.get("type", "")
    if prop_type == "title":
        items = prop.get("title", [])
    elif prop_type == "rich_text":
        items = prop.get("rich_text", [])
    else:
        return ""
    return items[0]["plain_text"] if items else ""


def _get_number(prop: dict) -> Optional[float]:
    if not prop:
        return None
    return prop.get("number")


def _get_select(prop: dict) -> str:
    if not prop:
        return ""
    sel = prop.get("select") or prop.get("status")
    return sel.get("name", "") if sel else ""


def _get_date(prop: dict) -> Optional[str]:
    if not prop:
        return None
    date = prop.get("date")
    if not date:
        return None
    return date.get("start")
