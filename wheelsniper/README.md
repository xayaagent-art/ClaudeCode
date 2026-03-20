# WheelSniper Bot

Personal options trading signal engine for the wheel strategy on Robinhood.

Monitors a watchlist of stocks every 5 minutes during market hours, applies wheel strategy signal logic (CSP and CC entry signals + close/roll signals), and sends formatted alerts via Telegram.

**This bot does NOT trade automatically** — it only sends signals so you can manually open trades.

## Quick Start

### 1. Install dependencies

```bash
cd wheelsniper
pip install -r requirements.txt
```

### 2. Configure environment

Edit `.env` with your Telegram credentials:

```
TELEGRAM_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_personal_chat_id
```

**How to get these:**
- **TELEGRAM_TOKEN**: Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts
- **TELEGRAM_CHAT_ID**: Message [@userinfobot](https://t.me/userinfobot) and it will reply with your chat ID

### 3. Configure positions

Edit `config.yaml` to add your assigned stock positions:

```yaml
positions:
  SOFI:
    shares: 100
    cost_basis: 8.50
  HIMS:
    shares: 200
    cost_basis: 12.30
```

### 4. Run

```bash
python main.py
```

## What Gets Monitored

The bot scans your watchlist every 5 minutes from 9:35 AM to 3:55 PM ET (weekdays).

### Signal Rules

**CSP (Cash-Secured Put)** — fires when:
- Stock is down on the day
- IV Rank > 30
- Price near 20-day MA support
- Best strike delta 0.20–0.30, DTE 21–35
- No earnings within 7 days

**CC (Covered Call)** — fires when:
- Stock is up on the day
- You hold 100+ shares
- Price approaching 50-day MA resistance
- Best strike delta ≤ 0.20, DTE 21–35
- No earnings within 7 days

**Close** — fires when:
- Position hits 50% of max profit
- OR within 7 DTE with < 25% profit remaining

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/status` | Bot health, open trades, monthly P&L |
| `/scan` | Run an immediate signal scan |
| `/pnl` | Monthly P&L breakdown vs target |
| `/positions` | List all open trades |

## Project Structure

```
wheelsniper/
├── main.py              # Entry point
├── config.yaml          # Watchlist, positions, parameters
├── .env                 # Telegram credentials
├── requirements.txt     # Python dependencies
└── src/
    ├── market_data.py       # Live prices, options chains
    ├── iv_calculator.py     # IV Rank from 52-week range
    ├── signal_engine.py     # CSP/CC/close signal logic
    ├── strike_selector.py   # Best strike picker
    ├── earnings_filter.py   # Earnings date checker
    ├── position_tracker.py  # SQLite trade/P&L tracking
    ├── alert_manager.py     # Alert deduplication
    ├── telegram_bot.py      # Bot + command handlers
    ├── morning_brief.py     # 9:30 AM daily summary
    └── scheduler.py         # APScheduler market hours
```

## Configuration

All tunable parameters are in `config.yaml` — no code changes needed:

- **watchlist**: Tickers to monitor for CSP opportunities
- **positions**: Your assigned shares for CC signals
- **signal_params**: Delta ranges, IVR thresholds, DTE windows, MA proximity
- **monthly_target**: Your income goal ($3,500–$4,000)
- **poll_interval_minutes**: How often to scan (default: 5)
- **alert_dedup_hours**: Don't re-alert same signal within this window (default: 4)

## Data Storage

SQLite database (`wheelsniper.db`) stores:
- Open and closed trades
- Monthly P&L summaries
- Alert history for deduplication
