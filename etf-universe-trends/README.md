# ETF Universe Trend Dashboard

A standalone tool that fetches the full US ETF universe from TradingView and generates an interactive trend dashboard.

## Usage

```bash
# Fetch live data from TradingView and build the dashboard
python run.py

# Rebuild the dashboard from the last saved data (no network call)
python run.py --skip-fetch
```

## Output

| File | Description |
|---|---|
| `output/universe_trends.html` | Interactive dashboard — open in any browser |
| `output/full_universe.xlsx` | Raw ETF universe data |

## Features

- Group ETFs by Asset Class / Category / Focus / Niche
- Compare returns using Simple Average, AUM-Weighted, or Volume-Weighted
- Expand any group to see individual ETF performance
- Sort by return, AUM, name, or count
- Search by ticker or name

## Requirements

```bash
pip install -r requirements.txt
```
