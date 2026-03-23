"""
ai_analyst.py — AI-powered analysis via OpenRouter API.

Uses OpenAI-compatible SDK to call moonshotai/kimi-k2 (primary)
or meta-llama/llama-3.3-70b-instruct (fallback) for:
- Signal thesis generation
- News sentiment classification
- Market context analysis
- Ticker analysis (/analyze command)
"""

import logging
import os
from typing import Optional

import pytz

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")

PRIMARY_MODEL = "moonshotai/kimi-k2"
FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct"
MAX_TOKENS = 120
TEMPERATURE = 0.3
TIMEOUT = 8


def _get_client():
    """Get OpenAI-compatible client for OpenRouter."""
    try:
        from openai import OpenAI
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            logger.warning("OPENROUTER_API_KEY not set")
            return None
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
    except ImportError:
        logger.warning("openai package not installed")
        return None


def _call_ai(system: str, user: str, model: str = None) -> Optional[str]:
    """Make an AI call with fallback model support."""
    client = _get_client()
    if not client:
        return None

    model = model or PRIMARY_MODEL

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
            timeout=TIMEOUT,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"AI call failed with {model}: {e}")
        if model == PRIMARY_MODEL:
            try:
                response = client.chat.completions.create(
                    model=FALLBACK_MODEL,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=MAX_TOKENS,
                    temperature=TEMPERATURE,
                    timeout=TIMEOUT,
                )
                return response.choices[0].message.content.strip()
            except Exception as e2:
                logger.error(f"AI fallback also failed: {e2}")
        return None


def generate_signal_thesis(signal: dict) -> Optional[str]:
    """Generate a 2-sentence trading thesis for a signal scoring 7+."""
    system = (
        "You are a professional wheel strategy options trader. "
        "Write concise specific theses referencing exact data points. Never be generic."
    )

    ticker = signal.get("ticker", "")
    sig_type = signal.get("type", "CSP")
    price = signal.get("price", 0)
    change = signal.get("change_pct", 0)
    rsi = signal.get("rsi_14", "N/A")
    ivr = signal.get("ivr", 0)
    bb_pct_b = signal.get("bb_pct_b", "N/A")
    vix = signal.get("vix_level", "N/A")
    strike = signal.get("strike", 0)
    premium = signal.get("premium", 0)
    ann_roi = signal.get("annualized_roi", 0)
    score = signal.get("score", 0)

    nearest_support = "N/A"
    levels = signal.get("levels") or {}
    if levels.get("nearest_support"):
        nearest_support = f"${levels['nearest_support']:.2f}"

    user = (
        f"2-sentence trading thesis, max 40 words. "
        f"WHY do conditions favor this specific trade?\n"
        f"{ticker} {sig_type} | Price: ${price:.2f} ({change:+.1f}%)\n"
        f"RSI: {rsi} | IVR: {ivr:.0f} | BB %B: {bb_pct_b}\n"
        f"Support: {nearest_support} | VIX: {vix}\n"
        f"Setup: {strike} @ ${premium:.2f} | Ann: {ann_roi:.0f}%\n"
        f"Score: {score}/10"
    )

    return _call_ai(system, user)


def get_news_sentiment(ticker: str) -> Optional[dict]:
    """Classify news sentiment for a ticker using yfinance headlines."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        news = stock.news
        if not news:
            return {"ticker": ticker, "sentiment": "neutral", "detail": None}

        headlines = [n.get("title", "") for n in news[:3]]
        headlines_text = "\n".join(f"- {h}" for h in headlines if h)

        if not headlines_text:
            return {"ticker": ticker, "sentiment": "neutral", "detail": None}

        system = "Financial news analyst. One word only."
        user = (
            f"Classify {ticker} sentiment.\n"
            f"Reply ONLY: bullish/bearish/neutral/major_event\n"
            f"If major_event add: colon + 4 word description\n"
            f"Headlines:\n{headlines_text}"
        )

        result = _call_ai(system, user)
        if not result:
            return {"ticker": ticker, "sentiment": "neutral", "detail": None}

        result = result.lower().strip()
        if "major_event" in result:
            parts = result.split(":", 1)
            detail = parts[1].strip() if len(parts) > 1 else "check news"
            return {"ticker": ticker, "sentiment": "major_event", "detail": detail}

        for s in ["bullish", "bearish", "neutral"]:
            if s in result:
                return {"ticker": ticker, "sentiment": s, "detail": None}

        return {"ticker": ticker, "sentiment": "neutral", "detail": None}

    except Exception as e:
        logger.debug(f"News sentiment failed for {ticker}: {e}")
        return {"ticker": ticker, "sentiment": "neutral", "detail": None}


def get_market_context(spy_change: float, qqq_change: float, vix: float) -> Optional[str]:
    """Get AI market context for the morning brief."""
    system = (
        "You are a professional wheel strategy options trader. "
        "Be specific and actionable."
    )
    user = (
        f"SPY: {spy_change:+.1f}% pre-mkt\n"
        f"QQQ: {qqq_change:+.1f}% pre-mkt | VIX: {vix}\n"
        f"2 sentences max 35 words:\n"
        f"1. Market regime today\n"
        f"2. Should wheel traders favor CSPs or CCs?"
    )

    return _call_ai(system, user)


def analyze_ticker(ticker: str) -> Optional[str]:
    """Full ticker analysis for /analyze command."""
    try:
        from src.market_data import get_market_data, get_vix

        data = get_market_data(ticker)
        if not data:
            return None

        vix_level, _ = get_vix()

        # Get news sentiment
        sentiment = get_news_sentiment(ticker)
        sentiment_str = sentiment["sentiment"] if sentiment else "neutral"
        if sentiment and sentiment.get("detail"):
            sentiment_str += f": {sentiment['detail']}"

        system = (
            "You are a professional wheel strategy options trader. "
            "Be specific with numbers."
        )
        user = (
            f"Analyze {ticker} for wheel strategy.\n"
            f"Price ${data['price']}|RSI {data['rsi_14']}|IVR N/A\n"
            f"BB %B {data.get('bb_pct_b', 'N/A')}|"
            f"20MA ${data['ma_20']}|50MA ${data['ma_50']}\n"
            f"VIX {vix_level}|News: {sentiment_str}\n"
            f"Answer exactly this format, 1 sentence each:\n"
            f"SETUP: [bull/bear/neutral] \u2014 [why, 8 words]\n"
            f"CSP: [yes/no] \u2014 [strike level and reason]\n"
            f"CC: [yes/no] \u2014 [strike level and reason]\n"
            f"RISK: [main risk, 8 words]"
        )

        analysis = _call_ai(system, user)
        if not analysis:
            return None

        SEP = "\u2501" * 24
        return (
            f"\U0001f50d {ticker} Analysis\n"
            f"{SEP}\n"
            f"{analysis}\n"
            f"{SEP}\n"
            f"Price: ${data['price']:.2f} | RSI: {data['rsi_14']} | "
            f"BB %B: {data.get('bb_pct_b', 'N/A')}"
        )

    except Exception as e:
        logger.error(f"Analyze failed for {ticker}: {e}")
        return None
