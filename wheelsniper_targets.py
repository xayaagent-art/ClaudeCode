#!/usr/bin/env python3
"""
WheelSniper — MA Price Target Tool
Calculates theoretical option prices at key moving average price targets
to help set limit orders in advance without monitoring the screen.

Future enhancements (not built):
  - Streamlit web UI for browser-based access
  - Telegram/email alert when stock price reaches within 2% of a MA level
  - Auto-pull DTE from open Robinhood positions via CSV export
  - Support VWAP and key horizontal support levels as additional price targets
  - Log historical estimates vs actual option prices to measure B-S accuracy
"""

import argparse
import sys
import math
from datetime import datetime, date

import numpy as np
from scipy.stats import norm
import yfinance as yf

# ─── Constants ───────────────────────────────────────────────────────────────
RISK_FREE_RATE = 0.0525  # Hardcoded ~Fed funds rate
FALLBACK_IV = 0.80       # Used when IV is 0 or unavailable
SCAN_DTE_MIN = 30
SCAN_DTE_MAX = 45

WATCHLIST = [
    "IREN", "ASTS", "HIMS", "RKLB", "EOSE",
    "SOFI", "HOOD", "CIFR", "APLD", "NBIS", "CRWV",
]

# ─── Black-Scholes ────────────────────────────────────────────────────────────

def black_scholes(S, K, T, r, sigma, option_type="put"):
    """
    Standard Black-Scholes pricing for European puts and calls.
    S     = underlying price (target MA level)
    K     = strike price
    T     = time to expiry in years (DTE / 365)
    r     = risk-free rate
    sigma = implied volatility (annualized)
    """
    if T <= 0 or sigma <= 0:
        # Intrinsic value only
        if option_type == "put":
            return max(K - S, 0.0)
        else:
            return max(S - K, 0.0)

    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if option_type == "put":
        price = K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    else:
        price = S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)

    return max(price, 0.0)


def round_down_to_nickel(price):
    """Round down to nearest $0.05 for safety margin on limit orders."""
    return math.floor(price * 20) / 20


# ─── Data Fetching ────────────────────────────────────────────────────────────

def fetch_price_and_mas(symbol):
    """
    Returns (current_price, {50: ma50, 100: ma100, 200: ma200}).
    Returns None on failure.
    """
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="250d", interval="1d")
        if hist.empty or len(hist) < 50:
            print(f"  [!] {symbol}: Insufficient price history.")
            return None

        current_price = ticker.fast_info.get("lastPrice") or hist["Close"].iloc[-1]

        mas = {}
        for window in [50, 100, 200]:
            if len(hist) >= window:
                mas[window] = float(hist["Close"].rolling(window).mean().iloc[-1])
            else:
                mas[window] = None  # Not enough data

        return float(current_price), mas
    except Exception as e:
        print(f"  [!] {symbol}: Error fetching price data — {e}")
        return None


def fetch_option_data(symbol, expiry_str, strike, option_type="put"):
    """
    Returns (iv, market_price) for the contract closest to the given strike.
    Falls back to FALLBACK_IV if IV is missing.
    """
    try:
        ticker = yf.Ticker(symbol)
        chain = ticker.option_chain(expiry_str)
        df = chain.puts if option_type == "put" else chain.calls

        if df is None or df.empty:
            print(f"  [!] {symbol}: No {option_type}s chain for {expiry_str}.")
            return FALLBACK_IV, None

        # Find closest strike to the requested strike for market price
        df = df.copy()
        df["strike_diff"] = (df["strike"] - strike).abs()
        closest = df.sort_values("strike_diff").iloc[0]

        market_price = closest.get("lastPrice", None)
        if market_price is not None and float(market_price) <= 0:
            market_price = None

        # Get ATM IV (closest to current price) for sigma input
        current_price_for_iv = closest.get("strike", strike)  # fallback
        try:
            price_info = yf.Ticker(symbol).fast_info
            cur_px = price_info.get("lastPrice", 0)
            if cur_px and cur_px > 0:
                df["atm_diff"] = (df["strike"] - cur_px).abs()
                atm_row = df.sort_values("atm_diff").iloc[0]
                iv = atm_row.get("impliedVolatility", None)
            else:
                iv = closest.get("impliedVolatility", None)
        except Exception:
            iv = closest.get("impliedVolatility", None)

        if iv is None or float(iv) <= 0:
            print(f"  [!] {symbol}: IV unavailable, using fallback {FALLBACK_IV*100:.0f}% IV.")
            iv = FALLBACK_IV
        else:
            iv = float(iv)

        return iv, float(market_price) if market_price else None

    except Exception as e:
        print(f"  [!] {symbol}: Error fetching options chain — {e}")
        return FALLBACK_IV, None


def get_available_expiries(symbol):
    """Returns list of expiry date strings from yfinance."""
    try:
        ticker = yf.Ticker(symbol)
        return list(ticker.options) if ticker.options else []
    except Exception:
        return []


def auto_select_expiry(symbol, dte_min=SCAN_DTE_MIN, dte_max=SCAN_DTE_MAX):
    """
    Finds the nearest expiry within dte_min–dte_max days from today.
    Returns (expiry_str, dte) or (None, None).
    """
    today = date.today()
    expiries = get_available_expiries(symbol)
    best = None
    best_dte = None

    for exp_str in expiries:
        try:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
            dte = (exp_date - today).days
            if dte_min <= dte <= dte_max:
                if best_dte is None or dte < best_dte:
                    best = exp_str
                    best_dte = dte
        except ValueError:
            continue

    return best, best_dte


# ─── Display ──────────────────────────────────────────────────────────────────

def format_expiry(expiry_str):
    """'2025-04-17' → 'Apr 17, 2025'"""
    try:
        return datetime.strptime(expiry_str, "%Y-%m-%d").strftime("%b %d, %Y")
    except Exception:
        return expiry_str


def dte_from_expiry(expiry_str):
    """Return days to expiry from today."""
    try:
        exp = datetime.strptime(expiry_str, "%Y-%m-%d").date()
        return (exp - date.today()).days
    except Exception:
        return 0


SEP = "━" * 49


def print_analysis(symbol, strike, expiry_str, option_type, current_price, mas,
                   iv, market_price, dte):
    """Renders the formatted output block for one ticker/contract."""
    opt_label = f"${strike:.0f}{'P' if option_type == 'put' else 'C'}"

    print()
    print(SEP)
    print(f"{symbol} | {opt_label} | Exp: {format_expiry(expiry_str)} | {dte} DTE")
    print(f"Current price:  ${current_price:<8.2f}IV: {iv*100:.0f}%")
    print(SEP)
    print("MA PRICE TARGETS — Estimated Option Value at Each Level")

    T = dte / 365.0
    ma_labels = {50: "50 DMA ", 100: "100 DMA", 200: "200 DMA"}

    for window in [50, 100, 200]:
        ma_price = mas.get(window)
        if ma_price is None:
            print(f"{ma_labels[window]}  → N/A (insufficient history)")
            continue

        est_price = black_scholes(ma_price, strike, T, RISK_FREE_RATE, iv, option_type)
        limit_price = round_down_to_nickel(est_price)

        if ma_price > current_price:
            action = f"BTC limit @ ${limit_price:.2f}  ✅ CLOSE"
        else:
            action = f"STO new CSP @ ${limit_price:.2f} 💡 OPEN"

        print(f"{ma_labels[window]}  → ${ma_price:<7.2f}| "
              f"{option_type.capitalize()} est: ${est_price:<5.2f} | Action: {action}")

    print(SEP)
    if market_price is not None:
        profit_target = round_down_to_nickel(market_price * 0.50)
        print(f"Current option market price: ${market_price:.2f}")
        print(f"50% profit target (BTC):     ${profit_target:.2f}")
    else:
        print("Current option market price: N/A")
    print(SEP)


# ─── Main Logic ───────────────────────────────────────────────────────────────

def run_single(symbol, strike, expiry_str, option_type):
    """Handle single-ticker mode."""
    dte = dte_from_expiry(expiry_str)
    if dte <= 0:
        print(f"Error: Expiry {expiry_str} is in the past.")
        sys.exit(1)

    result = fetch_price_and_mas(symbol)
    if result is None:
        sys.exit(1)
    current_price, mas = result

    iv, market_price = fetch_option_data(symbol, expiry_str, strike, option_type)

    print_analysis(symbol, strike, expiry_str, option_type,
                   current_price, mas, iv, market_price, dte)


def run_scan(option_type="put"):
    """Handle --scan mode: loop through watchlist with auto-selected expiry."""
    print(f"\nWheelSniper Watchlist Scan — {date.today().strftime('%B %d, %Y')}")
    print(f"Looking for nearest expiry with {SCAN_DTE_MIN}–{SCAN_DTE_MAX} DTE\n")

    for symbol in WATCHLIST:
        print(f"Fetching {symbol}...")
        expiry_str, dte = auto_select_expiry(symbol)

        if expiry_str is None:
            print(f"  [!] {symbol}: No expiry found in {SCAN_DTE_MIN}–{SCAN_DTE_MAX} DTE window. Skipping.\n")
            continue

        result = fetch_price_and_mas(symbol)
        if result is None:
            continue
        current_price, mas = result

        # Use ATM strike (nearest $1 increment to current price)
        atm_strike = round(current_price)
        iv, market_price = fetch_option_data(symbol, expiry_str, atm_strike, option_type)

        print_analysis(symbol, atm_strike, expiry_str, option_type,
                       current_price, mas, iv, market_price, dte)


def print_help():
    print("""
WheelSniper — MA Price Target Tool

USAGE:
  python wheelsniper_targets.py TICKER --strike STRIKE --expiry YYYY-MM-DD [--type put|call]
  python wheelsniper_targets.py --scan

EXAMPLES:
  python wheelsniper_targets.py IREN --strike 35 --expiry 2025-04-17
  python wheelsniper_targets.py IREN --strike 35 --expiry 2025-04-17 --type call
  python wheelsniper_targets.py --scan

OPTIONS:
  TICKER          Stock symbol (e.g. IREN, ASTS)
  --strike        Strike price (e.g. 35)
  --expiry        Expiration date in YYYY-MM-DD format
  --type          Option type: put or call (default: put)
  --scan          Run all tickers in the built-in watchlist

WATCHLIST (used with --scan):
  """ + ", ".join(WATCHLIST))


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("ticker", nargs="?", default=None)
    parser.add_argument("--strike", type=float, default=None)
    parser.add_argument("--expiry", type=str, default=None)
    parser.add_argument("--type", dest="option_type", choices=["put", "call"], default="put")
    parser.add_argument("--scan", action="store_true")
    parser.add_argument("-h", "--help", action="store_true")

    args = parser.parse_args()

    if args.help or (not args.scan and not args.ticker):
        print_help()
        sys.exit(0)

    if args.scan:
        run_scan(option_type=args.option_type)
        return

    # Single ticker mode
    if not args.ticker:
        print("Error: Provide a ticker symbol or use --scan.")
        print_help()
        sys.exit(1)

    if args.strike is None:
        print("Error: --strike is required in single-ticker mode.")
        sys.exit(1)

    if args.expiry is None:
        print("Error: --expiry is required in single-ticker mode.")
        sys.exit(1)

    # Validate date format
    try:
        datetime.strptime(args.expiry, "%Y-%m-%d")
    except ValueError:
        print(f"Error: --expiry must be in YYYY-MM-DD format (got '{args.expiry}').")
        sys.exit(1)

    run_single(
        symbol=args.ticker.upper(),
        strike=args.strike,
        expiry_str=args.expiry,
        option_type=args.option_type,
    )


if __name__ == "__main__":
    main()
