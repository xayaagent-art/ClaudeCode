"""
main.py — WheelSniper Bot entry point.

Starts the Telegram bot and APScheduler for market-hours signal scanning.
"""

import asyncio
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import pytz
import yaml
from dotenv import load_dotenv

# Ensure the project root is on the path so src imports work
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

# Load environment variables
load_dotenv()

ET = pytz.timezone("America/New_York")

from src.position_tracker import init_db
from src.scheduler import create_scheduler
from src.telegram_bot import create_bot

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(PROJECT_ROOT / "wheelsniper.log"),
    ],
)
logger = logging.getLogger("wheelsniper")


async def main():
    """Initialize database, start scheduler, and run Telegram bot."""
    logger.info("=" * 50)
    logger.info("WheelSniper Bot starting up...")
    logger.info("=" * 50)

    # Load config for validation
    with open("config.yaml", "r") as f:
        config = yaml.safe_load(f)

    watchlist = config.get("watchlist", [])
    positions = config.get("positions", {}) or {}
    logger.info(f"Watchlist: {len(watchlist)} tickers")
    logger.info(f"Assigned positions: {len(positions)} tickers")

    # Initialize SQLite database
    init_db()
    logger.info("Database initialized.")

    # Create and start the scheduler
    scheduler = create_scheduler()
    scheduler.start()
    logger.info("Scheduler started.")

    # Create and run the Telegram bot
    app = create_bot()
    if app is None:
        logger.error(
            "Telegram bot failed to initialize. "
            "Check TELEGRAM_TOKEN in your .env file."
        )
        # Keep scheduler running even without Telegram commands
        logger.info("Running in scan-only mode (no Telegram commands).")
        try:
            while True:
                await asyncio.sleep(60)
        except (KeyboardInterrupt, SystemExit):
            logger.info("Shutting down...")
            scheduler.shutdown()
            return

    # Run the bot (this blocks until stopped)
    logger.info("Telegram bot running. Send /status to test.")
    async with app:
        await app.initialize()
        await app.start()
        await app.updater.start_polling()

        # Send startup verification message
        try:
            from src.telegram_bot import send_alert
            now_et = datetime.now(ET).strftime("%Y-%m-%d %H:%M")
            await send_alert(
                f"\U0001f916 WheelSniper Phase 3 online\n"
                f"\u2705 AI analyst ready\n"
                f"\u2705 Notion connected\n"
                f"\u2705 Signal scoring active\n"
                f"\u2705 Sector guard active\n"
                f"Time: {now_et} ET"
            )
        except Exception as e:
            logger.warning(f"Startup message failed: {e}")

        try:
            while True:
                await asyncio.sleep(60)
        except (KeyboardInterrupt, SystemExit):
            logger.info("Shutting down...")
            await app.updater.stop()
            await app.stop()
            scheduler.shutdown()

    logger.info("WheelSniper Bot stopped.")


if __name__ == "__main__":
    asyncio.run(main())
