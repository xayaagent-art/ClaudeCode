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
MAX_TOKENS = 150
TEMPERATURE = 0.3
TIMEOUT = 8

SNIPER_SYSTEM = (
    "You are SniperBot, an elite options wheel trader AI. "
    "You write ultra-concise signal theses for a $100K wheel "
    "strategy portfolio targeting $3,500/month premium income. "
    "Your trader is assigned on: HIMS $45, EOSE $13.07, SOFI $17.14, "
    "APLD $35, TE $8, CIFR $25, ONDS $12, HOOD $110, RKLB $80, "
    "IREN $50, NBIS $121, ASTS $100. "
    "Always write theses in 15-20 words max. "
    "Be direct, confident, specific. Use numbers. No fluff."
)


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
    """Generate a concise trading thesis with confidence rating.

    Returns thesis string. Also sets signal["ai_confidence"] and
    signal["ai_confidence_adjustment"] for score adjustment.
    """
    ticker = signal.get("ticker", "")
    sig_type = signal.get("type", "CSP")
    price = signal.get("price", 0)
    change = signal.get("change_pct", 0)
    rsi = signal.get("rsi_14", "N/A")
    ivr = signal.get("ivr", 0)
    iv = signal.get("iv", 0)
    bb_pct_b = signal.get("bb_pct_b", "N/A")
    vix = signal.get("vix_level", "N/A")
    strike_val = signal.get("strike", 0)
    premium = signal.get("premium", 0)
    expiry = signal.get("expiry", "")
    ann_roi = signal.get("annualized_roi", 0)
    score = signal.get("score", 0)
    opt_type = "P" if sig_type == "CSP" else "C"

    # Key levels
    levels = signal.get("levels") or {}
    pdl = levels.get("pdl", "N/A")
    pdh = levels.get("pdh", "N/A")
    if isinstance(pdl, (int, float)):
        pdl = f"${pdl:.2f}"
    if isinstance(pdh, (int, float)):
        pdh = f"${pdh:.2f}"
    ma_20 = signal.get("ma_20", "N/A")
    if isinstance(ma_20, (int, float)):
        ma_20 = f"${ma_20:.2f}"
    vwap = signal.get("vwap", "N/A")
    if isinstance(vwap, (int, float)):
        vwap = f"${vwap:.2f}"

    # TA flags
    ta_tags = signal.get("ta_tags", [])
    ta_str = " | ".join(ta_tags[:4]) if ta_tags else "none"

    # Market regime from SPY
    spy_change = signal.get("spy_change", 0)
    if spy_change > 0.5:
        regime = "BULL"
    elif spy_change < -0.5:
        regime = "BEAR"
    else:
        regime = "CHOPPY"

    # News (from tags if available)
    news_str = "N/A"

    user = (
        f"Signal: {sig_type} on {ticker} {strike_val}{opt_type} {expiry}\n"
        f"Price: ${price:.2f} | RSI: {rsi} | IVR: {ivr:.0f} | IV: {iv:.0f}%\n"
        f"Score: {score}/10 | TA flags: {ta_str}\n"
        f"Market regime: {regime} | VIX: {vix}\n"
        f"Key levels: PDL {pdl} | PDH {pdh} | 20MA {ma_20} | VWAP {vwap}\n"
        f"Write a 15-20 word thesis explaining WHY this trade makes "
        f"sense RIGHT NOW given market conditions and TA setup.\n"
        f"Then on next line write: CONFIDENCE: [HIGH/MEDIUM/LOW]"
    )

    result = _call_ai(SNIPER_SYSTEM, user)
    if not result:
        return None

    # Parse confidence from response
    lines = result.strip().split("\n")
    thesis_lines = []
    confidence = "MEDIUM"
    for line in lines:
        upper = line.strip().upper()
        if upper.startswith("CONFIDENCE:"):
            conf_val = upper.replace("CONFIDENCE:", "").strip()
            if "HIGH" in conf_val:
                confidence = "HIGH"
            elif "LOW" in conf_val:
                confidence = "LOW"
            else:
                confidence = "MEDIUM"
        else:
            thesis_lines.append(line.strip())

    thesis = " ".join(thesis_lines).strip()
    if len(thesis) > 200:
        thesis = thesis[:197] + "..."

    # Map confidence to score adjustment
    conf_map = {"HIGH": 0.0, "MEDIUM": -0.3, "LOW": -0.7}
    signal["ai_confidence"] = confidence
    signal["ai_confidence_adjustment"] = conf_map.get(confidence, -0.3)

    return thesis


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
