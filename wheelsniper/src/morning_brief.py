"""
morning_brief.py — 9:30am ET daily summary builder.

Generates a pre-market overview of the best setups for the day,
including top CSP/CC candidates ranked by IVR and yield potential.
"""

import logging

import yaml

from src.earnings_filter import has_upcoming_earnings
from src.iv_calculator import calculate_ivr
from src.market_data import get_options_chain, get_stock_snapshot
from src.position_tracker import get_monthly_summary, get_open_trades
from src.strike_selector import calculate_yield, select_call_strike, select_put_strike

logger = logging.getLogger(__name__)


def build_morning_brief(config: dict = None) -> str:
    """Build the daily morning brief message.

    Scans all watchlist tickers, ranks them by setup quality,
    and produces a formatted summary.
    """
    if config is None:
        with open("config.yaml", "r") as f:
            config = yaml.safe_load(f)

    params = config["signal_params"]
    positions = config.get("positions", {}) or {}
    watchlist = config.get("watchlist", [])

    # Monthly progress
    summary = get_monthly_summary()
    target_low = config["monthly_target"]["low"]
    target_high = config["monthly_target"]["high"]

    # Open trades count
    open_trades = get_open_trades()

    # Scan tickers for potential setups
    csp_candidates = []
    cc_candidates = []
    earnings_warnings = []

    for ticker in watchlist:
        # Check earnings
        earnings = has_upcoming_earnings(ticker, params["earnings_blackout_days"])
        if earnings["has_earnings"]:
            earnings_warnings.append(f"  \u26a0\ufe0f {ticker} — earnings in {earnings['days_until']}d ({earnings['earnings_date']})")
            continue

        # Get IVR
        ivr_data = calculate_ivr(ticker)
        if not ivr_data:
            continue

        snap = get_stock_snapshot(ticker)
        if not snap:
            continue

        # Check for CSP setup potential
        if ivr_data["ivr"] >= params["ivr_min"]:
            chain = get_options_chain(ticker, params["dte_min"], params["dte_max"])
            if chain:
                strike = select_put_strike(
                    chain["puts"], snap["price"], params["csp_delta_min"], params["csp_delta_max"]
                )
                if strike:
                    yield_info = calculate_yield(strike["premium"], strike["strike"], chain["days_to_expiry"])
                    csp_candidates.append({
                        "ticker": ticker,
                        "price": snap["price"],
                        "ivr": ivr_data["ivr"],
                        "iv": ivr_data["current_iv"],
                        "strike": strike["strike"],
                        "premium": strike["premium"],
                        "delta": strike["delta"],
                        "expiry": chain["expiry"],
                        "dte": chain["days_to_expiry"],
                        "yield_pct": yield_info["yield_pct"],
                    })

        # Check for CC setup if we hold shares
        if ticker in positions and positions[ticker] and positions[ticker].get("shares", 0) >= 100:
            chain = get_options_chain(ticker, params["dte_min"], params["dte_max"])
            if chain:
                strike = select_call_strike(chain["calls"], snap["price"], params["cc_delta_max"])
                if strike:
                    cost_basis = positions[ticker].get("cost_basis", snap["price"])
                    yield_info = calculate_yield(strike["premium"], cost_basis, chain["days_to_expiry"])
                    cc_candidates.append({
                        "ticker": ticker,
                        "price": snap["price"],
                        "ivr": ivr_data["ivr"],
                        "strike": strike["strike"],
                        "premium": strike["premium"],
                        "delta": strike["delta"],
                        "expiry": chain["expiry"],
                        "dte": chain["days_to_expiry"],
                        "yield_pct": yield_info["yield_pct"],
                    })

    # Sort by IVR descending (highest IV rank = best premium environment)
    csp_candidates.sort(key=lambda x: x["ivr"], reverse=True)
    cc_candidates.sort(key=lambda x: x["ivr"], reverse=True)

    # Build message
    lines = ["\u2600\ufe0f MORNING BRIEF\n"]

    # Monthly progress
    progress_pct = (summary["total_income"] / target_low * 100) if target_low > 0 else 0
    lines.append(
        f"\U0001f4b5 Monthly: ${summary['total_income']:,.0f} / ${target_low:,}\u2013${target_high:,} "
        f"({progress_pct:.0f}%)"
    )
    lines.append(f"\U0001f4c2 Open trades: {len(open_trades)}\n")

    # Top CSP setups
    if csp_candidates:
        lines.append("\U0001f534 Top CSP Setups:")
        for c in csp_candidates[:5]:
            lines.append(
                f"  {c['ticker']} @ ${c['price']:.2f} | IVR: {c['ivr']:.0f} | "
                f"${c['strike']:.2f}P {c['expiry']} | ${c['premium']:.2f} ({c['yield_pct']:.1f}%)"
            )
    else:
        lines.append("\U0001f534 No CSP setups meeting criteria today.")

    lines.append("")

    # Top CC setups
    if cc_candidates:
        lines.append("\U0001f7e2 Top CC Setups:")
        for c in cc_candidates[:5]:
            lines.append(
                f"  {c['ticker']} @ ${c['price']:.2f} | IVR: {c['ivr']:.0f} | "
                f"${c['strike']:.2f}C {c['expiry']} | ${c['premium']:.2f} ({c['yield_pct']:.1f}%)"
            )
    else:
        lines.append("\U0001f7e2 No CC setups (check assigned positions in config).")

    # Earnings warnings
    if earnings_warnings:
        lines.append("\n\U0001f4c5 Earnings Watch:")
        lines.extend(earnings_warnings)

    lines.append(f"\n\u23f0 Next scan at 9:35 AM ET")
    return "\n".join(lines)
