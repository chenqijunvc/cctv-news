"""
Universe Trend Dashboard Generator.

Reads the full ETF universe Excel and produces a self-contained HTML page
where users can:

  • Choose grouping depth: by asset_class / category / category+focus /
    category+focus+niche  (dropdown)
  • Choose aggregation: simple average / AUM-weighted average /
    volume-weighted average  (toggle)
  • See aggregate return bars (1M / 3M / 6M / 1Y) for every group
  • Click any group row to expand and see all individual ETFs inside

All data is embedded as JSON; no server required.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import config.settings as cfg
from .classification import CLASSIFICATION_MAP


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _map_field(series: pd.Series, field: str) -> pd.Series:
    """Map a numeric ID series to human-readable labels."""
    mapping = CLASSIFICATION_MAP.get(field, {})
    def _cast(x):
        if pd.isna(x):
            return "Unknown"
        try:
            key = int(float(x))
        except (ValueError, TypeError):
            return str(x)
        return mapping.get(key, f"ID {key}")
    return series.map(_cast)


RET_COLS = [
    "nav_total_return.1M",
    "nav_total_return.3M",
    "nav_total_return.6M",
    "nav_total_return.1Y",
]

GROUP_LEVELS = {
    "By Asset Class":             ["asset_class"],
    "By Category":                ["asset_class", "category"],
    "By Category › Focus":        ["asset_class", "category", "focus"],
    "By Category › Focus › Niche":["asset_class", "category", "focus", "niche"],
}


def build_universe_dashboard(
    universe_path: Path = None,
    output_path: Path = None,
) -> Path:
    """
    Build the standalone universe trend dashboard HTML.

    Parameters
    ----------
    universe_path : Path to full_universe.xlsx  (defaults to settings value)
    output_path   : Destination HTML path        (defaults to settings value)

    Returns
    -------
    Path to the written HTML file.
    """
    universe_path = universe_path or cfg.EXCEL_FULL_UNIVERSE
    output_path   = output_path   or cfg.UNIVERSE_DASHBOARD

    # ── load & decode ──────────────────────────────────────────────────────
    df = pd.read_excel(universe_path, engine="openpyxl")

    # Ensure classification labels exist (recode any remaining float IDs)
    for field in ("strategy", "weighting_scheme", "selection_criteria"):
        if field in df.columns:
            first_valid = df[field].dropna().iloc[0] if not df[field].dropna().empty else None
            if first_valid is not None:
                try:
                    float(first_valid)          # still a number → map it
                    df[field] = _map_field(df[field], field)
                except (ValueError, TypeError):
                    pass                        # already a string label

    # Fill missing labels
    for col_name in ["asset_class", "category", "focus", "niche",
                     "strategy", "weighting_scheme", "selection_criteria"]:
        if col_name in df.columns:
            df[col_name] = df[col_name].fillna("Unknown").replace("", "Unknown")

    # Numeric return columns
    for rc in RET_COLS:
        if rc in df.columns:
            df[rc] = pd.to_numeric(df[rc], errors="coerce")

    # AUM / volume as numeric
    df["aum"]            = pd.to_numeric(df.get("aum",            pd.Series(dtype=float)), errors="coerce").fillna(0)
    df["average_volume"] = pd.to_numeric(df.get("average_volume", pd.Series(dtype=float)), errors="coerce").fillna(0)
    df["expense_ratio"]  = pd.to_numeric(df.get("expense_ratio",  pd.Series(dtype=float)), errors="coerce")

    # ── build per-ETF records (for individual rows in expanded view) ────────
    etf_records = []
    display_cols = [
        "ticker", "name", "description",
        "asset_class", "category", "focus", "niche",
        "strategy", "weighting_scheme", "selection_criteria",
        "aum", "average_volume", "expense_ratio",
    ] + RET_COLS

    existing = [c for c in display_cols if c in df.columns]
    for _, row in df[existing].iterrows():
        rec = {}
        for c in existing:
            v = row[c]
            if isinstance(v, float) and np.isnan(v):
                rec[c] = None
            elif isinstance(v, (np.integer, np.floating)):
                rec[c] = float(v)
            else:
                rec[c] = v
        etf_records.append(rec)

    # ── build group-level aggregates for all 4 depth levels ───────────────
    def _agg_group(group_cols: list[str]) -> list[dict]:
        rows = []
        for key, gdf in df.groupby(group_cols, observed=True, dropna=False):
            key_tuple = key if isinstance(key, tuple) else (key,)
            # pad to a fixed length so JS indexing is predictable
            key_padded = list(key_tuple) + [""] * (4 - len(key_tuple))

            n = len(gdf)
            total_aum = gdf["aum"].sum()
            total_vol = gdf["average_volume"].sum()

            simple, aum_w, vol_w = {}, {}, {}
            for rc in RET_COLS:
                if rc not in gdf.columns:
                    simple[rc] = aum_w[rc] = vol_w[rc] = None
                    continue
                valid = gdf[rc].dropna()
                valid_aum = gdf.loc[valid.index, "aum"]
                valid_vol = gdf.loc[valid.index, "average_volume"]

                simple[rc] = float(valid.mean()) if len(valid) else None

                aum_sum = valid_aum.sum()
                aum_w[rc] = float((valid * valid_aum).sum() / aum_sum) if aum_sum > 0 else simple[rc]

                vol_sum = valid_vol.sum()
                vol_w[rc] = float((valid * valid_vol).sum() / vol_sum) if vol_sum > 0 else simple[rc]

            # list of ticker strings belonging to this group
            ticker_col = "ticker" if "ticker" in gdf.columns else "name"
            tickers = gdf[ticker_col].dropna().tolist()

            rows.append({
                "keys":    key_padded,          # [asset_class, category, focus, niche]
                "depth":   len(group_cols),
                "count":   n,
                "total_aum": float(total_aum),
                "simple":  simple,
                "aum_w":   aum_w,
                "vol_w":   vol_w,
                "tickers": tickers,
            })
        return rows

    aggregates = {}
    for label, cols in GROUP_LEVELS.items():
        aggregates[label] = _agg_group(cols)

    # ── serialise to JSON ───────────────────────────────────────────────────
    etf_json  = json.dumps(etf_records,              default=str)
    agg_json  = json.dumps(aggregates,               default=str)
    meta_json = json.dumps({
        "generated":    pd.Timestamp.now().isoformat(timespec="seconds"),
        "total_etfs":   len(df),
        "ret_cols":     RET_COLS,
        "group_levels": list(GROUP_LEVELS.keys()),
    })

    html = _build_html(etf_json, agg_json, meta_json)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    print(f"  Universe dashboard → {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# HTML / CSS / JS template
# ---------------------------------------------------------------------------

def _build_html(etf_json: str, agg_json: str, meta_json: str) -> str:  # noqa: C901
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ETF Universe Trend Dashboard</title>
<style>
/* ── reset & base ──────────────────────────────────────────── */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{
    height: 100%;
}}
body {{
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #0f1117;
    color: #e2e8f0;
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}}

/* ── top bar ───────────────────────────────────────────────── */
#topbar {{
    background: linear-gradient(135deg, #1a1f35 0%, #162032 100%);
    border-bottom: 1px solid #2d3748;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
}}
#topbar h1 {{
    font-size: 1.05rem;
    font-weight: 700;
    color: #90cdf4;
    white-space: nowrap;
    margin-right: 4px;
}}
#topbar .meta {{
    font-size: 0.73rem;
    color: #718096;
    margin-left: auto;
}}

/* ── controls ──────────────────────────────────────────────── */
.ctrl-group {{ display: flex; align-items: center; gap: 6px; }}
.ctrl-group label {{
    font-size: 0.75rem;
    color: #a0aec0;
    white-space: nowrap;
}}
select {{
    background: #1e2535;
    border: 1px solid #2d3748;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.78rem;
    cursor: pointer;
}}
select:focus {{ outline: none; border-color: #4a90d9; }}
.toggle-btn {{ display: flex; border: 1px solid #2d3748; border-radius: 6px; overflow: hidden; }}
.toggle-btn button {{
    background: #1e2535;
    border: none;
    border-right: 1px solid #2d3748;
    color: #a0aec0;
    padding: 4px 10px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background .15s, color .15s;
    white-space: nowrap;
}}
.toggle-btn button:last-child {{ border-right: none; }}
.toggle-btn button.active {{ background: #3182ce; color: #fff; }}



/* ── search box ────────────────────────────────────────────── */
#searchBox {{
    background: #1e2535;
    border: 1px solid #2d3748;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.78rem;
    width: 160px;
}}
#searchBox:focus {{ outline: none; border-color: #4a90d9; }}
#searchBox::placeholder {{ color: #4a5568; }}

/* ── stats bar ─────────────────────────────────────────────── */
#statsBar {{
    display: flex;
    gap: 18px;
    padding: 7px 20px;
    background: #141824;
    border-bottom: 1px solid #1e2535;
    flex-wrap: wrap;
    flex-shrink: 0;
}}
.stat-chip {{ font-size: 0.73rem; color: #718096; }}
.stat-chip span {{ color: #90cdf4; font-weight: 600; }}

/* ── table container ───────────────────────────────────────── */
.table-wrap {{
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    padding: 0 0 12px;
}}
table {{ width: 100%; border-collapse: collapse; font-size: 0.81rem; }}

/* sticky header — top:0 relative to .table-wrap scroll container */
thead tr {{
    position: sticky;
    top: 0;
    z-index: 50;
}}
thead th {{
    padding: 8px 10px;
    text-align: right;
    color: #718096;
    font-weight: 600;
    font-size: 0.71rem;
    text-transform: uppercase;
    letter-spacing: .04em;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    border-bottom: 2px solid #2d3748;
    background: #1a1f35;
}}
thead th:first-child {{ text-align: left; min-width: 260px; position: sticky; left: 0; z-index: 60; background: #1a1f35; }}
thead th.th-desc     {{ text-align: left; min-width: 190px; }}
thead th.th-cls      {{ text-align: left; min-width: 110px; }}
thead th:hover       {{ color: #90cdf4; }}
thead th.sort-active {{ color: #90cdf4; }}
.sort-arrow {{ font-size: .65rem; margin-left: 3px; opacity: .85; }}

/* ── col widths ────────────────────────────────────────────── */
.col-label  {{ min-width: 260px; }}
.col-cls    {{ min-width: 110px; }}
.col-ret    {{ min-width: 78px;  text-align: right; }}
.col-aum    {{ min-width: 88px;  text-align: right; }}
.col-cnt    {{ min-width: 58px;  text-align: right; }}

/* ── group rows ────────────────────────────────────────────── */
tr.group-row {{ cursor: pointer; }}
tr.group-row:hover td {{ filter: brightness(1.15); }}
tr.group-row td {{
    padding: 7px 10px;
    border-bottom: 1px solid #1e2535;
    vertical-align: middle;
}}
tr.group-row td:first-child {{
    position: sticky; left: 0; z-index: 10;
}}

/* depth-based indentation */
tr.group-row.d1 td:first-child {{ padding-left: 8px;  font-size:.85rem; font-weight:700; color:#e2e8f0; }}
tr.group-row.d2 td:first-child {{ padding-left: 22px; font-size:.83rem; font-weight:600; color:#e2e8f0; }}
tr.group-row.d3 td:first-child {{ padding-left: 38px; font-size:.81rem; font-weight:500; color:#cbd5e0; }}
tr.group-row.d4 td:first-child {{ padding-left: 54px; font-size:.79rem; font-weight:400; color:#a0aec0; }}

/* depth-based background shading */
tr.group-row.d1 td {{ background: #1a1f35; }}
tr.group-row.d2 td {{ background: #161b2e; }}
tr.group-row.d3 td {{ background: #131827; }}
tr.group-row.d4 td {{ background: #111522; }}

.expand-icon {{
    display: inline-block;
    width: 13px;
    color: #4a5568;
    font-size: 0.65rem;
    transition: transform .15s;
    margin-right: 3px;
}}
.expanded .expand-icon {{ transform: rotate(90deg); color: #4a90d9; }}
.cnt-badge {{
    display: inline-block;
    background: #1e2535;
    color: #718096;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 0.67rem;
    margin-left: 5px;
    vertical-align: middle;
}}

/* breadcrumb */
.bc-sep {{ color: #4a5568; margin: 0 4px; font-size: .75em; }}
.bc-dim {{ color: #718096; }}
.bc-cur {{ color: #e2e8f0; font-weight: 600; }}

/* ── ETF individual rows ───────────────────────────────────── */
tr.etf-row td {{
    padding: 4px 10px;
    background: #0d1018;
    border-bottom: 1px solid #14171f;
    font-size: 0.77rem;
    color: #a0aec0;
    vertical-align: middle;
}}
tr.etf-row td:first-child {{
    padding-left: 68px;
    position: sticky; left: 0; z-index: 10;
    background: #0d1018;
}}
.ticker-sym {{ color: #63b3ed; font-weight: 700; font-size: .82rem; }}
.etf-name   {{ color: #718096; font-size: .72rem; overflow: hidden;
               text-overflow: ellipsis; white-space: nowrap; max-width: 210px; }}
.cls-tag    {{ color: #718096; font-size: .72rem; white-space: nowrap; }}

/* ── return cells — heatmap ────────────────────────────────── */
.ret {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
/* heatmap background applied inline via style= */
.ret-cell {{
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    font-weight: 600;
    font-size: .79rem;
    padding: 4px 10px;
    transition: background .2s;
}}
.pos {{ color: #68d391; }}
.neg {{ color: #fc8181; }}
.neu {{ color: #718096; }}

/* ── aum / count cells ─────────────────────────────────────── */
.aum-cell  {{ text-align: right; color: #718096; font-size: .73rem; white-space: nowrap; }}
.cnt-cell  {{ text-align: right; color: #718096; font-size: .73rem; }}

/* ── scrollbar ─────────────────────────────────────────────── */
::-webkit-scrollbar {{ width: 6px; height: 6px; }}
::-webkit-scrollbar-track {{ background: #0f1117; }}
::-webkit-scrollbar-thumb {{ background: #2d3748; border-radius: 3px; }}
</style>
</head>
<body>

<!-- ── top bar ──────────────────────────────────────────────────────── -->
<div id="topbar">
  <h1>📊 ETF Universe Trend</h1>

  <div class="ctrl-group">
    <label>Group</label>
    <select id="groupSelect"></select>
  </div>

  <div class="ctrl-group">
    <label>Wt.</label>
    <div class="toggle-btn" id="weightToggle">
      <button data-w="simple" class="active">Avg</button>
      <button data-w="aum_w">AUM</button>
      <button data-w="vol_w">Vol</button>
    </div>
  </div>

  <div class="ctrl-group">
    <label>Asset Class</label>
    <select id="assetSelect"></select>
  </div>

  <div class="ctrl-group">
    <input type="text" id="searchBox" placeholder="Search ticker / name…">
  </div>

  <div class="meta" id="metaLine"></div>
</div>

<!-- ── stats bar ────────────────────────────────────────────────────── -->
<div id="statsBar"></div>

<!-- ── table ────────────────────────────────────────────────────────── -->
<div class="table-wrap" id="tableWrap">
  <table id="mainTable">
    <thead id="mainThead">
      <tr>
        <th class="col-label"  id="th-label">Group / ETF</th>
        <th class="col-cnt"    id="th-count"># ETFs</th>
        <th class="col-ret"    id="th-1m">1 M</th>
        <th class="col-ret"    id="th-3m">3 M</th>
        <th class="col-ret"    id="th-6m">6 M</th>
        <th class="col-ret"    id="th-1y">1 Y</th>
        <th class="col-aum"    id="th-aum">AUM</th>
        <th class="th-cls col-cls">Strategy</th>
        <th class="th-cls col-cls">Weighting</th>
      </tr>
    </thead>
    <tbody id="tableBody"></tbody>
  </table>
</div>

<script>
/* ── embedded data ────────────────────────────────────────── */
const ETF_DATA = {etf_json};
const AGG_DATA = {agg_json};
const META     = {meta_json};

/* ── period keys ──────────────────────────────────────────── */
const PERIODS = [
  'nav_total_return.1M',
  'nav_total_return.3M',
  'nav_total_return.6M',
  'nav_total_return.1Y',
];
const PERIOD_LABEL = {{
  'nav_total_return.1M': '1M',
  'nav_total_return.3M': '3M',
  'nav_total_return.6M': '6M',
  'nav_total_return.1Y': '1Y',
}};

/* ── state ────────────────────────────────────────────────── */
const state = {{
  groupLevel:  META.group_levels[1],
  weightMode:  'simple',
  sortPeriod:  'nav_total_return.3M',
  sortDir:     'desc',       // 'desc' | 'asc'
  assetFilter: 'All',
  search:      '',
  expanded:    new Set(),
  allExpanded: false,
}};

/* ── ETF lookup ───────────────────────────────────────────── */
const ETF_BY_TICKER = {{}};
ETF_DATA.forEach(e => {{
  if (e.ticker) ETF_BY_TICKER[e.ticker] = e;
  if (e.name)   ETF_BY_TICKER[e.name]   = e;
}});

/* ── asset class list (from data) ────────────────────────── */
const ASSET_CLASSES = ['All', ...new Set(
  ETF_DATA.map(e => e.asset_class).filter(Boolean).sort()
)];

/* ── helpers ──────────────────────────────────────────────── */
const fmtAum = v => {{
  if (!v) return '—';
  if (v >= 1e12) return '$' + (v/1e12).toFixed(1) + 'T';
  if (v >= 1e9)  return '$' + (v/1e9 ).toFixed(1) + 'B';
  if (v >= 1e6)  return '$' + (v/1e6 ).toFixed(0) + 'M';
  return '$' + v.toFixed(0);
}};
const groupKey  = row  => row.keys.join('||');
const getRetVal = (row, mode, period) => row[mode] ? row[mode][period] : null;
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

/* ── heatmap colour scale ─────────────────────────────────── */
// Called once per render with the visible group rows
let _heatMin = 0, _heatMax = 0, _heatMid = 0;
function computeHeat(rows) {{
  const vals = rows.map(r => getRetVal(r, state.weightMode, state.sortPeriod)).filter(v => v != null);
  if (!vals.length) {{ _heatMin = _heatMax = _heatMid = 0; return; }}
  _heatMin = Math.min(...vals);
  _heatMax = Math.max(...vals);
  _heatMid = (_heatMin + _heatMax) / 2;
}}

// Interpolate between two hex colours by t∈[0,1]
function lerpColour(c1, c2, t) {{
  const p = x => parseInt(x, 16);
  const r = p(c1.slice(1,3)), g = p(c1.slice(3,5)), b = p(c1.slice(5,7));
  const r2= p(c2.slice(1,3)), g2= p(c2.slice(3,5)), b2= p(c2.slice(5,7));
  const ri= Math.round(r+(r2-r)*t), gi= Math.round(g+(g2-g)*t), bi= Math.round(b+(b2-b)*t);
  return `#${{ri.toString(16).padStart(2,'0')}}${{gi.toString(16).padStart(2,'0')}}${{bi.toString(16).padStart(2,'0')}}`;
}}

function heatBg(v) {{
  if (v == null) return 'transparent';
  const MID_NEU = '#1e2535';
  const TOP_POS = '#1a3d2b';
  const BOT_NEG = '#3d1a1a';
  const MAX_ABS = 20;   // ±20% = full intensity
  const t = Math.min(Math.abs(v) / MAX_ABS, 1);
  if (v > 0.05)  return lerpColour(MID_NEU, TOP_POS, t);
  if (v < -0.05) return lerpColour(MID_NEU, BOT_NEG, t);
  return 'transparent';
}}

function retCell(v, isHeat) {{
  if (v == null || isNaN(v)) return `<td class="ret-cell"><span class="neu">—</span></td>`;
  const c   = v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'neu';
  const txt = `${{v >= 0 ? '+' : ''}}${{v.toFixed(2)}}%`;
  const bg  = isHeat ? `background:${{heatBg(v)}};` : '';
  return `<td class="ret-cell" style="${{bg}}"><span class="${{c}}">${{txt}}</span></td>`;
}}

/* ── group label (full breadcrumb) ───────────────────────── */
function groupLabel(keys, depth) {{
  const parts = [];
  for (let i = 0; i < depth; i++) {{
    const k = keys[i]; if (!k) break;
    parts.push(i < depth - 1
      ? `<span class="bc-dim">${{esc(k)}}</span>`
      : `<span class="bc-cur">${{esc(k)}}</span>`);
  }}
  return parts.join('<span class="bc-sep">›</span>');
}}



/* ── controls ─────────────────────────────────────────────── */
function initControls() {{
  const gs = document.getElementById('groupSelect');
  META.group_levels.forEach(lv => {{
    const o = document.createElement('option');
    o.value = lv; o.textContent = lv;
    if (lv === state.groupLevel) o.selected = true;
    gs.appendChild(o);
  }});
  gs.onchange = e => {{ state.groupLevel = e.target.value; state.expanded.clear(); render(); }};

  const as_ = document.getElementById('assetSelect');
  ASSET_CLASSES.forEach(ac => {{
    const o = document.createElement('option');
    o.value = ac; o.textContent = ac;
    if (ac === state.assetFilter) o.selected = true;
    as_.appendChild(o);
  }});
  as_.onchange = e => {{ state.assetFilter = e.target.value; state.expanded.clear(); render(); }};

  document.querySelectorAll('#weightToggle button').forEach(btn => {{
    btn.onclick = () => {{
      document.querySelectorAll('#weightToggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); state.weightMode = btn.dataset.w; render();
    }};
  }});

  document.getElementById('searchBox').oninput = e => {{
    state.search = e.target.value.toLowerCase(); render();
  }};

  // column header sort — return columns + AUM + count + label
  const COL_SORTS = [
    ['th-label',   () => {{ state.sortPeriod = null; state.sortDir = 'asc'; }}],
    ['th-count',   () => {{ state.sortPeriod = null; state.sortDir = 'desc_count'; }}],
    ['th-aum',     () => {{ state.sortPeriod = null; state.sortDir = 'desc_aum'; }}],
    ['th-1m',      () => {{ setSortPeriod('nav_total_return.1M'); }}],
    ['th-3m',      () => {{ setSortPeriod('nav_total_return.3M'); }}],
    ['th-6m',      () => {{ setSortPeriod('nav_total_return.6M'); }}],
    ['th-1y',      () => {{ setSortPeriod('nav_total_return.1Y'); }}],
  ];
  COL_SORTS.forEach(([id, fn]) => {{
    const th = document.getElementById(id); if (th) th.onclick = () => {{ fn(); render(); }};
  }});

  document.getElementById('metaLine').textContent =
    `${{META.generated.slice(0,10)}} · ${{META.total_etfs.toLocaleString()}} ETFs`;
}}

function setSortPeriod(p) {{
  if (state.sortPeriod === p) {{
    state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
  }} else {{
    state.sortPeriod = p; state.sortDir = 'desc';
  }}
}}
/* ── update header sort indicators ───────────────────────── */
const PERIOD_TO_TH = {{
  'nav_total_return.1M': 'th-1m',
  'nav_total_return.3M': 'th-3m',
  'nav_total_return.6M': 'th-6m',
  'nav_total_return.1Y': 'th-1y',
}};
function updateSortHeaders() {{
  // clear all
  ['th-label','th-count','th-aum','th-1m','th-3m','th-6m','th-1y'].forEach(id => {{
    const th = document.getElementById(id); if (!th) return;
    th.classList.remove('sort-active');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.remove();
  }});

  // mark active return column
  if (state.sortPeriod && PERIOD_TO_TH[state.sortPeriod]) {{
    const th = document.getElementById(PERIOD_TO_TH[state.sortPeriod]);
    if (th) {{
      th.classList.add('sort-active');
      th.insertAdjacentHTML('beforeend', `<span class="sort-arrow">${{state.sortDir==='desc'?'▼':'▲'}}</span>`);
    }}
  }}

}}

/* ── sort & filter ────────────────────────────────────────── */
function sortRows(rows) {{
  return [...rows].sort((a, b) => {{
    const m = state.weightMode;
    if (state.sortDir === 'desc_count') return b.count - a.count;
    if (state.sortDir === 'desc_aum')   return (b.total_aum||0) - (a.total_aum||0);
    if (state.sortDir === 'asc') {{    // label sort
      if (!state.sortPeriod) {{
        const depth = META.group_levels.indexOf(state.groupLevel);
        return (a.keys[depth]||'').localeCompare(b.keys[depth]||'');
      }}
    }}
    if (!state.sortPeriod) return 0;
    const av = getRetVal(a, m, state.sortPeriod) ?? -Infinity;
    const bv = getRetVal(b, m, state.sortPeriod) ?? -Infinity;
    return state.sortDir === 'desc' ? bv - av : av - bv;
  }});
}}

function filterRows(rows) {{
  let r = rows;
  // asset class filter
  if (state.assetFilter !== 'All') {{
    r = r.filter(row => row.keys[0] === state.assetFilter);
  }}
  if (!state.search) return r;
  return r.filter(row => {{
    if (row.keys.some(k => k.toLowerCase().includes(state.search))) return true;
    if (row.tickers && row.tickers.some(t => t.toLowerCase().includes(state.search))) return true;
    return (row.tickers || []).some(t => {{
      const e = ETF_BY_TICKER[t];
      return e && e.description && e.description.toLowerCase().includes(state.search);
    }});
  }});
}}

/* ── stats bar ────────────────────────────────────────────── */
function renderStats(rows) {{
  const vis   = filterRows(rows);
  const n     = vis.reduce((s,r) => s + r.count, 0);
  const aum   = vis.reduce((s,r) => s + (r.total_aum||0), 0);
  const p     = state.sortPeriod || 'nav_total_return.3M';
  const vals  = vis.map(r => getRetVal(r, state.weightMode, p)).filter(v => v != null);
  const avg   = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  const best  = vals.length ? Math.max(...vals) : null;
  const worst = vals.length ? Math.min(...vals) : null;
  document.getElementById('statsBar').innerHTML = [
    `<span class="stat-chip">Groups <span>${{vis.length}}</span></span>`,
    `<span class="stat-chip">ETFs <span>${{n.toLocaleString()}}</span></span>`,
    `<span class="stat-chip">Total AUM <span>${{fmtAum(aum)}}</span></span>`,
    avg  != null ? `<span class="stat-chip">Avg ${{PERIOD_LABEL[p]}} <span class="${{avg>=0?'pos':'neg'}}">${{avg>=0?'+':''}}${{avg.toFixed(2)}}%</span></span>` : '',
    best != null ? `<span class="stat-chip">Best <span class="pos">+${{best.toFixed(2)}}%</span></span>` : '',
    worst!= null ? `<span class="stat-chip">Worst <span class="neg">${{worst.toFixed(2)}}%</span></span>` : '',
  ].join('');
}}

/* ── ETF sub-rows ─────────────────────────────────────────── */
function renderEtfRows(tickers, parentKey) {{
  let list = tickers;
  // asset class filter on individual ETFs
  if (state.assetFilter !== 'All') {{
    list = list.filter(t => {{
      const e = ETF_BY_TICKER[t]; return e && e.asset_class === state.assetFilter;
    }});
  }}
  if (state.search) list = list.filter(t => {{
    const e = ETF_BY_TICKER[t]; if (!e) return false;
    return t.toLowerCase().includes(state.search)
        || (e.description||'').toLowerCase().includes(state.search)
        || (e.name||'').toLowerCase().includes(state.search);
  }});

  const sp = state.sortPeriod || 'nav_total_return.3M';
  list = [...list].sort((a,b) => {{
    const av = (ETF_BY_TICKER[a]||{{}})[sp];
    const bv = (ETF_BY_TICKER[b]||{{}})[sp];
    if (av==null && bv==null) return 0;
    if (av==null) return 1; if (bv==null) return -1;
    return state.sortDir === 'asc' ? av - bv : bv - av;
  }});

  return list.map(ticker => {{
    const e  = ETF_BY_TICKER[ticker] || {{}};
    const v1 = e['nav_total_return.1M'], v3 = e['nav_total_return.3M'];
    const v6 = e['nav_total_return.6M'], v1y= e['nav_total_return.1Y'];
    return `<tr class="etf-row" data-parent="${{esc(parentKey)}}">
      <td><span class="ticker-sym">${{esc(e.name||ticker)}}</span><span class="etf-name" style="display:block">${{esc(e.description||'')}}</span></td>
      <td class="cnt-cell">—</td>
      ${{retCell(v1, false)}}
      ${{retCell(v3, false)}}
      ${{retCell(v6, false)}}
      ${{retCell(v1y, false)}}
      <td class="aum-cell">${{fmtAum(e.aum)}}</td>
      <td class="cls-tag">${{esc(e.strategy||'—')}}</td>
      <td class="cls-tag">${{esc(e.weighting_scheme||'—')}}</td>
    </tr>`;
  }}).join('');
}}

/* ── main render ──────────────────────────────────────────── */
function render() {{
  const rows   = AGG_DATA[state.groupLevel] || [];
  const depth  = META.group_levels.indexOf(state.groupLevel) + 1;
  const sorted = sortRows(filterRows(rows));

  computeHeat(sorted);
  renderStats(rows);
  updateSortHeaders();

  let html = '';
  sorted.forEach(row => {{
    const key   = groupKey(row);
    const isExp = state.expanded.has(key);
    const rv1m  = getRetVal(row, state.weightMode, 'nav_total_return.1M');
    const rv3m  = getRetVal(row, state.weightMode, 'nav_total_return.3M');
    const rv6m  = getRetVal(row, state.weightMode, 'nav_total_return.6M');
    const rv1y  = getRetVal(row, state.weightMode, 'nav_total_return.1Y');

    html += `<tr class="group-row d${{depth}}${{isExp?' expanded':''}}" data-key="${{esc(key)}}" onclick="toggleGroup('${{esc(key)}}')">
      <td><span class="expand-icon">▶</span>${{groupLabel(row.keys, depth)}}<span class="cnt-badge">${{row.count}}</span></td>
      <td class="cnt-cell">${{row.count}}</td>
      ${{retCell(rv1m, state.sortPeriod==='nav_total_return.1M')}}
      ${{retCell(rv3m, state.sortPeriod==='nav_total_return.3M')}}
      ${{retCell(rv6m, state.sortPeriod==='nav_total_return.6M')}}
      ${{retCell(rv1y, state.sortPeriod==='nav_total_return.1Y')}}
      <td class="aum-cell">${{fmtAum(row.total_aum)}}</td>
      <td></td><td></td>
    </tr>`;
    if (isExp) html += renderEtfRows(row.tickers, key);
  }});

  document.getElementById('tableBody').innerHTML = html;
}}

/* ── expand / collapse one group ─────────────────────────── */
function toggleGroup(key) {{
  const isNowExp = !state.expanded.has(key);
  if (isNowExp) state.expanded.add(key); else state.expanded.delete(key);

  const tr = document.querySelector(`tr.group-row[data-key="${{CSS.escape(key)}}"]`);
  if (!tr) return;
  tr.classList.toggle('expanded', isNowExp);

  let sib = tr.nextElementSibling;
  while (sib && sib.classList.contains('etf-row') && sib.dataset.parent === key) {{
    const rem = sib; sib = sib.nextElementSibling; rem.remove();
  }}
  if (isNowExp) {{
    const row = (AGG_DATA[state.groupLevel]||[]).find(r => groupKey(r) === key);
    if (row) tr.insertAdjacentHTML('afterend', renderEtfRows(row.tickers, key));
  }}
}}



/* ── boot ─────────────────────────────────────────────────── */
initControls();
render();
</script>
</body>
</html>"""
