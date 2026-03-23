"""
sector_guard.py — Sector Concentration Guard.

Prevents over-concentration in a single sector by:
1. Max 1 CSP per sector per scan cycle
2. Suppress new CSP if 3+ open positions in same sector (from Notion)
"""

import logging

logger = logging.getLogger(__name__)

# Sector mapping for watchlist tickers
SECTOR_MAP = {
    # Technology
    "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology",
    "GOOG": "Technology", "META": "Technology", "NVDA": "Technology",
    "AMD": "Technology", "INTC": "Technology", "TSM": "Technology",
    "AVGO": "Technology", "CRM": "Technology", "ORCL": "Technology",
    "ADBE": "Technology", "CSCO": "Technology", "QCOM": "Technology",
    "MU": "Technology", "AMAT": "Technology", "LRCX": "Technology",
    "KLAC": "Technology", "MRVL": "Technology", "ON": "Technology",
    "SMCI": "Technology", "ARM": "Technology", "DELL": "Technology",
    # Fintech / Financial
    "SOFI": "Fintech", "PYPL": "Fintech", "SQ": "Fintech",
    "HOOD": "Fintech", "AFRM": "Fintech", "UPST": "Fintech",
    "NU": "Fintech", "COIN": "Fintech",
    "JPM": "Financial", "BAC": "Financial", "GS": "Financial",
    "MS": "Financial", "WFC": "Financial", "C": "Financial",
    "SCHW": "Financial", "V": "Financial", "MA": "Financial",
    # EV / Auto
    "TSLA": "EV/Auto", "RIVN": "EV/Auto", "LCID": "EV/Auto",
    "NIO": "EV/Auto", "XPEV": "EV/Auto", "GM": "EV/Auto",
    "F": "EV/Auto",
    # Energy / Mining / Data Centers
    "IREN": "Energy/Mining", "MARA": "Energy/Mining", "RIOT": "Energy/Mining",
    "CLSK": "Energy/Mining", "BITF": "Energy/Mining", "HUT": "Energy/Mining",
    "CIFR": "Energy/Mining", "APLD": "Energy/Mining",
    "XOM": "Energy", "CVX": "Energy", "OXY": "Energy",
    "SLB": "Energy", "HAL": "Energy",
    "OKLO": "Nuclear", "UEC": "Nuclear",
    # Healthcare / Biotech
    "MRNA": "Biotech", "BNTX": "Biotech", "PFE": "Biotech",
    "JNJ": "Healthcare", "UNH": "Healthcare", "ABBV": "Healthcare",
    "LLY": "Healthcare", "BMY": "Healthcare",
    # Consumer / Retail
    "AMZN": "Consumer", "WMT": "Consumer", "TGT": "Consumer",
    "COST": "Consumer", "HD": "Consumer", "LOW": "Consumer",
    "NKE": "Consumer", "SBUX": "Consumer", "MCD": "Consumer",
    "DIS": "Consumer",
    # Aerospace / Defense
    "BA": "Aerospace", "LMT": "Aerospace", "RTX": "Aerospace",
    "NOC": "Aerospace", "GD": "Aerospace",
    # Telecom / Media
    "T": "Telecom", "VZ": "Telecom", "TMUS": "Telecom",
    "NFLX": "Media", "ROKU": "Media", "SPOT": "Media",
    # Real Estate / REITs
    "O": "REIT", "AMT": "REIT", "PLD": "REIT",
    # Cannabis / Speculative
    "TLRY": "Cannabis", "CGC": "Cannabis",
    # AI / Cloud / Quantum
    "PLTR": "AI/Cloud", "SNOW": "AI/Cloud", "NET": "AI/Cloud",
    "DDOG": "AI/Cloud", "ZS": "AI/Cloud", "CRWD": "AI/Cloud",
    "AI": "AI/Cloud", "PATH": "AI/Cloud", "S": "AI/Cloud",
    "IONQ": "Quantum", "NBIS": "AI/Cloud",
    # Space / Defense
    "ASTS": "Space", "RKLB": "Space", "LUNR": "Space",
    # Speculative / Small Cap
    "CRWV": "Speculative", "BMNU": "Speculative", "ONDS": "Speculative",
    "TE": "Speculative", "AXT": "Semiconductor",
    # Healthcare / Consumer
    "HIMS": "Healthcare", "EOSE": "Energy Storage",
    # ETF / Index
    "IBIT": "ETF", "TQQQ": "ETF",
    # Adtech / Marketing
    "ZETA": "Adtech",
}


def get_sector(ticker: str) -> str:
    """Get sector for a ticker. Returns 'Other' if not mapped."""
    return SECTOR_MAP.get(ticker, "Other")


def check_sector_concentration(
    ticker: str,
    scan_sectors: dict = None,
    max_per_scan: int = 1,
    max_open: int = 3,
) -> dict:
    """Check if a CSP signal should be suppressed due to sector concentration.

    Args:
        ticker: The ticker to check
        scan_sectors: Dict tracking sectors already signaled this scan cycle
        max_per_scan: Max CSP signals per sector per scan (default 1)
        max_open: Max open positions per sector before suppression (default 3)

    Returns:
        dict with keys: allowed (bool), reason (str), sector (str)
    """
    sector = get_sector(ticker)

    # Check 1: Max per scan cycle
    if scan_sectors is not None:
        count = scan_sectors.get(sector, 0)
        if count >= max_per_scan:
            return {
                "allowed": False,
                "reason": f"Sector limit: already have {count} {sector} CSP this scan",
                "sector": sector,
            }

    # Check 2: Max open positions in sector (from Notion)
    open_count = _count_open_in_sector(sector)
    if open_count >= max_open:
        return {
            "allowed": False,
            "reason": f"Concentration guard: {open_count} open {sector} positions (max {max_open})",
            "sector": sector,
        }

    return {"allowed": True, "reason": "", "sector": sector}


def record_scan_sector(scan_sectors: dict, ticker: str):
    """Record that a sector was signaled in this scan cycle."""
    sector = get_sector(ticker)
    scan_sectors[sector] = scan_sectors.get(sector, 0) + 1


def _count_open_in_sector(sector: str) -> int:
    """Count open CSP positions in a given sector from Notion."""
    try:
        from src.notion_sync import get_open_positions

        positions = get_open_positions()
        count = 0
        for pos in positions:
            ticker = pos.get("ticker", "")
            pos_type = pos.get("type", "")
            if pos_type == "CSP" and get_sector(ticker) == sector:
                count += 1
        return count
    except Exception:
        return 0


def get_sector_summary() -> dict:
    """Get a summary of open positions by sector for display."""
    try:
        from src.notion_sync import get_open_positions

        positions = get_open_positions()
        sectors = {}
        for pos in positions:
            ticker = pos.get("ticker", "")
            sector = get_sector(ticker)
            if sector not in sectors:
                sectors[sector] = []
            sectors[sector].append(ticker)
        return sectors
    except Exception:
        return {}


def format_sector_warnings(signals: list[dict]) -> list[str]:
    """Generate sector concentration warnings for the morning brief."""
    sector_summary = get_sector_summary()
    warnings = []

    for sector, tickers in sector_summary.items():
        if len(tickers) >= 3:
            ticker_list = ", ".join(tickers[:5])
            warnings.append(
                f"  \u26a0\ufe0f {sector}: {len(tickers)} open CSPs ({ticker_list}) "
                f"\u2014 new {sector} CSPs suppressed"
            )

    return warnings
