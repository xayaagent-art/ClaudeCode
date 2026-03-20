"""
morning_brief.py — 9:30am ET daily summary builder.

Generates a pre-market overview of the best setups for the day,
including top CSP/CC candidates ranked by IVR and yield potential.
Incorporates pre-market data for momentum context.
"""

import logging

import yaml

from src.earnings_filter import has_upcoming_earnings
from src.iv_calculator import calculate_ivr
from src.market_data import get_options_chain, get_premarket_data, get_stock_snapshot
from src.position_tracker import get_monthly_summary, get_open_trades
from src.strike_selector import calculate_yield, select_call_strike, select_put_strike

logger = logging.getLogger(__name__)

SEP = "\u2501" * 24


def _get_market_bias(spy_data: dict) -> str:
    """Determine market bias from SPY pre-market data."""
    if not spy_data:
        return "\U0001f4ca Mixed open \u2014 stock-specific setups"
    change = spy_data.get("premarket_change_pct", 0)
    if change < -1:
        return "\U0001f4c9 Market opening red \u2014 favor CSPs today"
    elif change > 1:
        return "\U0001f4c8 Market opening green \u2014 favor CCs today"
    return "\U0001f4ca Mixed open \u2014 stock-specific setups"


def _premarket_context(ticker: str, pm_data: dict, setup_type: str) -> str:
    """Build pre-market context line for a setup."""
    if not pm_data:
        return ""
    change = pm_data["premarket_change_pct"]
    direction = "\u2193" if change < 0 else "\u2191"
    signal = pm_data.get("premarket_signal", "watch")

    if setup_type == "CSP" and change < -2:
        return f" | {direction} {abs(change):.1f}% pre-mkt \u2192 IV elevated \u2192 CSP favored"
    elif setup_type == "CC" and change > 2:
        return f" | {direction} {change:.1f}% pre-mkt \u2192 Momentum \u2192 CC favored"
    elif abs(change) > 1:
        return f" | {direction} {abs(change):.1f}% pre-mkt"
    return ""


def build_morning_brief(config: dict = None) -> str:
    """Build the daily morning brief message.

    Scans all watchlist tickers, ranks them by setup quality,
    and produces a formatted summary with pre-market context.
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

    # Fetch pre-market data for market bias
    spy_pm = get_premarket_data("SPY")
    qqq_pm = get_premarket_data("QQQ")

    # Pre-fetch pre-market data for all watchlist tickers
    pm_cache = {}
    for ticker in watchlist:
        pm_cache[ticker] = get_premarket_data(ticker)

    # Scan tickers for potential setups
    csp_candidates = []
    cc_candidates = []
    earnings_warnings = []
    premarket_warnings = []

    for ticker in watchlist:
        # Check earnings
        earnings = has_upcoming_earnings(ticker, params["earnings_blackout_days"])
        if earnings["has_earnings"]:
            earnings_warnings.append(f"  \u26a0\ufe0f {ticker} \u2014 earnings in {earnings['days_until']}d ({earnings['earnings_date']})")
            continue

        # Check for large pre-market drops (avoid warning)
        pm = pm_cache.get(ticker)
        if pm and pm.get("premarket_change_pct", 0) < -7:
            premarket_warnings.append(
                f"  \u26a0\ufe0f {ticker} \u2193 {abs(pm['premarket_change_pct']):.1f}% pre-mkt "
                f"\u2014 verify no news before trading"
            )

        # Get IVR
        ivr_data = calculate_ivr(ticker)
        if not ivr_data:
            continue

        snap = get_stock_snapshot(ticker)
        if not snap:
            continue

        # Pre-market context string
        pm_context = _premarket_context(ticker, pm, "CSP")

        # Check for CSP setup potential
        if ivr_data["ivr"] >= params["ivr_min"]:
            dte_target = params.get("csp_dte_target", 35)
            dte_min = params.get("csp_dte_min", params.get("dte_min", 30))
            dte_max = params.get("csp_dte_max", params.get("dte_max", 45))
            chain = get_options_chain(ticker, dte_min, dte_max, dte_target=dte_target)
            if chain:
                strike = select_put_strike(
                    chain["puts"], snap["price"], params["csp_delta_min"], params["csp_delta_max"],
                    ticker=ticker,
                )
                if strike:
                    yield_info = calculate_yield(strike["premium"], strike["strike"], chain["days_to_expiry"])
                    # Pre-market dip confirmation tag
                    pm_tag = ""
                    if pm and pm.get("premarket_change_pct", 0) < -2:
                        pm_tag = " \U0001f3af Pre-market dip confirms CSP entry"
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
                        "pm_context": pm_context,
                        "pm_tag": pm_tag,
                    })

        # Check for CC setup if we hold shares
        if ticker in positions and positions[ticker] and positions[ticker].get("shares", 0) >= 100:
            cc_dte_target = params.get("cc_dte_target", 28)
            cc_dte_min = params.get("cc_dte_min", 21)
            cc_dte_max = params.get("cc_dte_max", 35)
            chain = get_options_chain(ticker, cc_dte_min, cc_dte_max, dte_target=cc_dte_target)
            if chain:
                strike = select_call_strike(chain["calls"], snap["price"], params["cc_delta_max"], ticker=ticker)
                if strike:
                    cost_basis = positions[ticker].get("cost_basis", snap["price"])
                    yield_info = calculate_yield(strike["premium"], cost_basis, chain["days_to_expiry"])
                    pm_cc_context = _premarket_context(ticker, pm, "CC")
                    pm_tag = ""
                    if pm and pm.get("premarket_change_pct", 0) > 2:
                        pm_tag = " \U0001f3af Pre-market strength confirms CC entry"
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
                        "pm_context": pm_cc_context,
                        "pm_tag": pm_tag,
                    })

    # Sort by IVR descending (highest IV rank = best premium environment)
    csp_candidates.sort(key=lambda x: x["ivr"], reverse=True)
    cc_candidates.sort(key=lambda x: x["ivr"], reverse=True)

    # Build message
    lines = ["\u2600\ufe0f MORNING BRIEF\n"]

    # Market bias from SPY pre-market
    lines.append(_get_market_bias(spy_pm))
    if spy_pm:
        spy_dir = "+" if spy_pm["premarket_change_pct"] >= 0 else ""
        lines.append(f"SPY: ${spy_pm['premarket_price']:.2f} ({spy_dir}{spy_pm['premarket_change_pct']:.1f}%)")
    if qqq_pm:
        qqq_dir = "+" if qqq_pm["premarket_change_pct"] >= 0 else ""
        lines.append(f"QQQ: ${qqq_pm['premarket_price']:.2f} ({qqq_dir}{qqq_pm['premarket_change_pct']:.1f}%)")
    lines.append("")

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
                f"{c.get('pm_context', '')}"
            )
            if c.get("pm_tag"):
                lines.append(f"    {c['pm_tag']}")
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
                f"{c.get('pm_context', '')}"
            )
            if c.get("pm_tag"):
                lines.append(f"    {c['pm_tag']}")
    else:
        lines.append("\U0001f7e2 No CC setups (check assigned positions in config).")

    # Pre-market warnings
    if premarket_warnings:
        lines.append(f"\n{SEP}")
        lines.append("\u26a0\ufe0f Pre-Market Warnings:")
        lines.extend(premarket_warnings)

    # Earnings warnings
    if earnings_warnings:
        lines.append("\n\U0001f4c5 Earnings Watch:")
        lines.extend(earnings_warnings)

    lines.append(f"\n\u23f0 Next scan at 9:35 AM ET")
    return "\n".join(lines)
