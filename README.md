# WheelSniper — MA Price Target Tool

Calculates theoretical option prices at 50/100/200 DMA price targets using Black-Scholes. Set limit orders in advance without watching the screen.

## Setup

```bash
pip install yfinance numpy scipy
```

## Usage

### Single ticker

```bash
# Analyze an existing CSP position
python wheelsniper_targets.py IREN --strike 35 --expiry 2025-04-17

# Default type is put; use --type call for calls
python wheelsniper_targets.py IREN --strike 35 --expiry 2025-04-17 --type call
```

### Watchlist scan

```bash
# Scans all tickers, auto-selects nearest expiry with 30–45 DTE
python wheelsniper_targets.py --scan
```

## Output

For each contract, the tool shows:
- Current price, IV, DTE
- Estimated option value when the stock reaches each moving average
- Suggested limit order price (rounded down to nearest $0.05)
- Action label: `BTC limit` (close) or `STO new CSP` (open)
- Current market price and 50% profit target

## How It Works

- **Price & MAs** — fetched via `yfinance` (250 days of history, rolling means)
- **IV** — pulled from the live options chain (ATM strike)
- **Black-Scholes** — implemented from scratch with `scipy.stats.norm`
- **Risk-free rate** — hardcoded at 5.25%

## Watchlist

```
IREN, ASTS, HIMS, RKLB, EOSE, SOFI, HOOD, CIFR, APLD, NBIS, CRWV
```