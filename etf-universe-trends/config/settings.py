"""
Configuration for the ETF Universe Trend Dashboard.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE_DIR   = Path(__file__).parent.parent   # project root (etf-universe-trends/)
OUTPUT_DIR = BASE_DIR / "output"

UNIVERSE_DASHBOARD  = OUTPUT_DIR / "universe_trends.html"
EXCEL_FULL_UNIVERSE = OUTPUT_DIR / "full_universe.xlsx"

# ---------------------------------------------------------------------------
# TradingView Screener — universe fetch settings
# ---------------------------------------------------------------------------

# Minimum AUM to include in the full universe export ($10M by default)
UNIVERSE_MIN_AUM = 10_000_000

# Maximum ETFs to fetch (TradingView cap)
UNIVERSE_LIMIT = 10_000

# VIX threshold for momentum regime: > threshold → short-term (3M), else long-term (1Y)
VIX_THRESHOLD = 20.0
