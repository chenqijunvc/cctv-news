"""
ETF universe fetcher for the Universe Trend Dashboard.

Fetches the full US ETF universe from TradingView and maps raw
classification IDs to human-readable labels.

Public entry point
------------------
    df = fetch_full_universe(short_term=False)
"""

import pandas as pd
from tradingview_screener import Query, col

from .classification import CLASSIFICATION_MAP
import config.settings as cfg


# ---------------------------------------------------------------------------
# Classification mapping
# ---------------------------------------------------------------------------

def map_classifications(df: pd.DataFrame, unknown: str = "Unknown") -> pd.DataFrame:
    """Map raw TradingView IDs to human-readable labels.

    Renames originals to *_id columns and overwrites the original columns
    with the mapped strings.
    """
    result = df.copy()
    int_fields = ("category", "focus", "niche", "strategy", "weighting_scheme", "selection_criteria")
    all_fields = ("asset_class",) + int_fields

    for field in all_fields:
        if field in result.columns:
            result[f"{field}_id"] = result[field]

    for field in int_fields:
        id_col = f"{field}_id"
        if id_col in result.columns:
            result[id_col] = pd.to_numeric(result[id_col], errors="coerce").fillna(0).astype(int)

    for field in all_fields:
        if field in result.columns:
            mapping = CLASSIFICATION_MAP.get(field, {})
            result[field] = result[f"{field}_id"].map(lambda x, m=mapping: m.get(x, unknown))

    return result


# ---------------------------------------------------------------------------
# Asset group assignment
# ---------------------------------------------------------------------------

def assign_asset_groups(df: pd.DataFrame) -> pd.DataFrame:
    """Add `asset_group` column mapping asset classes to the 50/30/20 buckets."""
    result = df.copy()
    result["asset_group"] = "Asset Allocation"
    result.loc[result["asset_class"] == "Equity",       "asset_group"] = "Equity"
    result.loc[result["asset_class"] == "Fixed Income",  "asset_group"] = "Fixed Income"
    result.loc[result["asset_class"].isin(["Commodities", "Currency", "Alternatives"]),
               "asset_group"] = "Alternative"
    return result


# ---------------------------------------------------------------------------
# Full universe fetch
# ---------------------------------------------------------------------------

def fetch_full_universe(short_term: bool = False) -> pd.DataFrame:
    """Fetch all non-leveraged, non-single-stock ETFs with AUM > $10M.

    Parameters
    ----------
    short_term : If True, adds a 3M momentum_score; otherwise uses 1Y.

    Returns
    -------
    DataFrame sorted by AUM descending with classification labels applied.
    """
    _, df = (
        Query()
        .set_markets("america")
        .select(
            "name", "description",
            "asset_class", "category", "focus", "niche",
            "strategy", "weighting_scheme", "selection_criteria",
            "aum", "average_volume", "expense_ratio", "nav",
            "nav_total_return.1M", "nav_total_return.3M",
            "nav_total_return.6M", "nav_total_return.1Y",
            "exchange", "country", "currency",
        )
        .where(
            col("type")           == "fund",
            col("aum")            > cfg.UNIVERSE_MIN_AUM,
            col("currency")       == "USD",
            col("exchange")       != "OTC",
            col("leveraged_flag") == "Non-leveraged",
            # col("selection_criteria")       != "36",
        )
        .order_by("aum", ascending=False)
        .limit(cfg.UNIVERSE_LIMIT)
        .get_scanner_data()
    )
    print(f"  Full universe fetched: {len(df):,} ETFs")

    df = map_classifications(df)
    df = assign_asset_groups(df)
    df["momentum_score"] = df["nav_total_return.3M"] if short_term else df["nav_total_return.1Y"]

    return df
