"""
ETF Universe Trend Dashboard — entry point.

Usage
-----
    python run.py                  # fetch live data + rebuild dashboard
    python run.py --skip-fetch     # rebuild dashboard from last saved full_universe.xlsx
    python run.py --help

Output
------
    output/universe_trends.html    open in any browser
    output/full_universe.xlsx      raw ETF universe data
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from tradingview_screener import Query
from src.screener import fetch_full_universe
from src.universe_dashboard import build_universe_dashboard
import config.settings as cfg


def detect_regime() -> bool:
    """Return True if VIX > threshold (short-term / 3M momentum regime)."""
    try:
        _, vix_df = (
            Query()
            .select("close")
            .set_markets("america")
            .set_property("symbols", {"tickers": ["CBOE:VIX"]})
            .get_scanner_data()
        )
        vix = float(vix_df["close"].iloc[0]) if len(vix_df) > 0 else cfg.VIX_THRESHOLD
        short_term = vix > cfg.VIX_THRESHOLD
        label = "3M (short-term)" if short_term else "1Y (long-term)"
        print(f"VIX: {vix:.2f}  →  {label} momentum")
        return short_term
    except Exception as e:
        print(f"  VIX fetch failed ({e}); defaulting to long-term 1Y momentum")
        return False


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ETF Universe Trend Dashboard Generator")
    p.add_argument(
        "--skip-fetch", action="store_true",
        help="Skip live TradingView fetch; use the existing full_universe.xlsx.",
    )
    return p.parse_args()


def main():
    args = parse_args()

    cfg.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Step 1: fetch live universe (optional) ────────────────────────────
    if not args.skip_fetch:
        print("=" * 60)
        print("STEP 1 — Fetching ETF Universe from TradingView")
        print("=" * 60)
        short_term = detect_regime()
        df = fetch_full_universe(short_term=short_term)
        df.to_excel(cfg.EXCEL_FULL_UNIVERSE, index=False, engine="openpyxl")
        print(f"  Saved {len(df):,} ETFs → {cfg.EXCEL_FULL_UNIVERSE}")
    else:
        if not cfg.EXCEL_FULL_UNIVERSE.exists():
            print("ERROR: full_universe.xlsx not found. Run without --skip-fetch first.")
            sys.exit(1)
        print(f"Skipping fetch; using {cfg.EXCEL_FULL_UNIVERSE}")

    # ── Step 2: build dashboard ───────────────────────────────────────────
    print()
    print("=" * 60)
    print("STEP 2 — Building Universe Trend Dashboard")
    print("=" * 60)
    out = build_universe_dashboard(cfg.EXCEL_FULL_UNIVERSE, cfg.UNIVERSE_DASHBOARD)
    print(f"\n✅ Dashboard → {out.resolve()}")
    print("   Open the HTML file in your browser to view the results.")


if __name__ == "__main__":
    main()
