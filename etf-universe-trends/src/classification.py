"""
ETF classification mapping tables for TradingView Screener fields.

Maps raw hash/integer IDs to human-readable labels:
  asset_class        – MD5 hash strings  → "Equity", "Fixed Income", etc.
  category           – integer IDs       → "Government, treasury", "Corporate, broad-based", etc.
  focus              – integer IDs       → "Large cap", "Information technology", etc.
  niche              – integer IDs       → "Semiconductors", "REITs", etc.
  strategy           – integer IDs       → "Vanilla", "Active", "ESG", etc.
  weighting_scheme   – integer IDs       → "Market cap", "Equal", "Fundamental", etc.
  selection_criteria – integer IDs       → "Committee", "Dividends", "Market cap", etc.

Reference Documentation:
- Asset Class: https://www.tradingview.com/support/solutions/43000717788/
- Categories, Focuses, Niches: https://www.tradingview.com/support/solutions/43000717928/
- Strategy: https://www.tradingview.com/support/solutions/43000716006/
- Weighting Scheme: https://www.tradingview.com/support/solutions/43000716007/
- Selection Criteria: https://www.tradingview.com/support/solutions/43000715962/

Imported by tv_gen.py.
"""

CLASSIFICATION_MAP = {
    # =========================================================================
    # ASSET CLASS (MD5 hash → label)
    # =========================================================================
    "asset_class": {
        "c05f85d35d1cd0be6ebb2af4be16e06a": "Equity",
        "b6e443a6c4a8a2e7918c5dbf3d45c796": "Fixed Income",
        "8fe80395f389e29e3ea42210337f0350": "Commodities",
        "1af0389838508d7016a9841eb6273962": "Currency",
        "b090e99b8d95f5837ec178c2d3d3fc50": "Asset Allocation",
        "4071518f1736a5a43dae51b47590322f": "Alternatives",
    },

    # =========================================================================
    # CATEGORY (integer ID → label)
    # =========================================================================
    "category": {
        # Alternatives
        1:  "Hedge fund strategies",
        35: "Tactical tools",

        # Asset Allocation
        3:  "Asset allocation",
        75: "Target outcome",

        # Commodities
        4:  "Agriculture",
        5:  "Broad market",
        6:  "Energy",
        7:  "Industrial metals",
        8:  "Precious metals",

        # Equity
        26: "Size and style",
        27: "Sector",
        44: "High dividend yield",

        # Currency
        34: "Pair",
        71: "Basket",

        # Fixed Income
        56: "Broad market, asset-backed",
        57: "Broad market, asset-backed",
        58: "Government, treasury",
        59: "Government, non-native currency",
        60: "Government, mortgage-backed",
        61: "Government, local authority/municipal",
        62: "Government, inflation-linked",
        63: "Government, broad-based",
        64: "Government, agency",
        65: "Corporate, preferred",
        66: "Corporate, convertible",
        68: "Corporate, broad-based",
        69: "Corporate, bank loans",
        70: "Broad market, broad-based",
    },

    # =========================================================================
    # FOCUS (integer ID → label)
    # =========================================================================
    "focus": {
        # Alternatives > Hedge fund strategies
        1:    "Global macro",           # DBMF, CTA - Managed Futures
        87:   "Long/short",             # FTLS, ORR
        2011: "Multi-strategy",         # RLY, QAI

        # Alternatives > Tactical tools
        6:    "Volatility",             # VXX, VIXY
        2107: "Spreads",                # RISR, PFIX

        # Asset Allocation
        9:    "Target risk",            # AOA, AOM, AOK
        94:   "Target outcome",         # CGBL, AOR
        2108: "Target date",            # ITDD, ITDC
        2195: "Target outcome",         # BUFG - Capital appreciation
        2203: "Target outcome",         # BUFR - Buffer allocation
        2204: "Target outcome",         # BOXX, KNG - Income

        # Commodities > Agriculture
        13:   "Corn",
        18:   "Sugar",
        90:   "Wheat",
        91:   "Soybeans",

        # Commodities > Broad market
        10:   "Broad market",           # PDBC, GLTR

        # Commodities > Energy
        20:   "Crude oil",
        23:   "Natural gas",
        123:  "Gasoline",
        2029: "Carbon credits",

        # Commodities > Industrial metals
        25:   "Copper",

        # Commodities > Precious metals
        29:   "Gold",
        30:   "Palladium",
        31:   "Platinum",
        32:   "Silver",

        # Commodities > Metals (for miners - actually Equity > Sector > Materials)
        115:  "Materials",              # GDX, GDXJ, COPX

        # Currency
        2034: "AUD",                    # Australian Dollar
        2040: "CAD",                    # Canadian Dollar
        2043: "CHF",                    # Swiss Franc
        2055: "EUR",                    # Euro
        2056: "Basket",                 # Emerging Currency basket
        2059: "USD",                    # USD Index Bearish
        2069: "GBP",                    # British Pound
        2071: "Basket",                 # Currency basket
        2075: "JPY",                    # Japanese Yen
        2092: "USD",                    # USD Index Bullish
        2094: "USD",                    # USD Long

        # Cryptocurrency (under Currency > Basket or Pair)
        2004: "ETH",                    # Short Ether
        2111: "BTC",                    # Bitcoin
        2113: "Basket",                 # Crypto basket
        2114: "XRP",
        2119: "DOT",                    # Polkadot
        2125: "ETH",                    # Ethereum
        2128: "SOL",                    # Solana
        2129: "BTC",                    # Short Bitcoin
        2149: "AVAX",                   # Avalanche
        2153: "LINK",                   # Chainlink
        2180: "HBAR",
        2181: "SUI",
        2186: "DOGE",                   # Dogecoin

        # Equity > High dividend yield
        64:   "High dividend yield",

        # Equity > Sector
        54:   "Financials",
        59:   "Energy",
        61:   "Industrials",
        62:   "Real estate",
        63:   "Information technology",
        68:   "Health care",
        70:   "Utilities",
        105:  "Consumer discretionary",
        106:  "Consumer staples",
        2127: "Communication services",

        # Equity > Size and style
        52:   "Total market",
        53:   "Large cap",
        55:   "Small cap",
        56:   "Mid cap",
        66:   "Extended market",
        2103: "Micro cap",

        # Equity > Theme
        58:   "Infrastructure",         # PAVE, IGF

        # Fixed Income
        73:   "Broad credit",           # BND, AGG
        78:   "High yield",             # USHY, HYG
        2025: "Investment grade",       # IUSB, FBND
    },

    # =========================================================================
    # NICHE (integer ID → label)
    # =========================================================================
    "niche": {
        # Alternatives > Hedge fund strategies > Global macro
        4:    "Managed futures",        # HFGM
        30:   "Risk premia",            # FLSP
        127:  "Managed futures",        # DBMF, CTA
        1000: "Risk parity",            # RPAR, UPAR

        # Alternatives > Hedge fund strategies > Long/short
        7:    "Merger arbitrage",       # MNA, ARB
        9:    "Market neutral",         # BTAL, MKTN
        10:   "Long/short",             # FTLS, ORR
        192:  "Event-driven",           # EVNT

        # Alternatives > Hedge fund strategies > Multi-strategy
        11:   "Multi-strategy",         # RLY, FAAR
        193:  "Multi-strategy",         # QAI, QALT

        # Alternatives > Tactical tools > Spreads
        6:    "Inflation",              # RISR, PFIX

        # Alternatives > Tactical tools > Volatility
        19:   "S&P 500 mid-term",       # VIXM, VXZ
        20:   "S&P 500 short-term",     # VXX, VIXY

        # Asset allocation > Target outcome
        12:   "Income",                 # BUFR, KNG
        14:   "Income",                 # INCM, PCEF
        18:   "Income",                 # THTA
        144:  "Income",                 # HNDL
        145:  "Income & capital appreciation",  # CGBL, AOR

        # Asset allocation > Target risk
        33:   "Aggressive",             # AOA
        34:   "Conservative",           # AOK
        35:   "Moderate",               # AOM

        # Asset allocation > Target date (year)
        1011: "2030",
        1013: "2035",
        1015: "2040",
        1016: "2045",
        1017: "2050",
        1018: "2055",
        1019: "2060",
        1020: "2065",

        # Commodities niche
        36:   "Broad maturities",       # DJP, GSG
        37:   "Laddered",            # USO
        38:   "Optimized",              # PDBC, DBC
        39:   "Physically held",        # GLD, IAU, SLV
        40:   "In specie",              # IBIT, FBTC (crypto trusts)
        42:   "Derivative",             # BITO (futures-based)
        155:  "Variable",               # FTGC
        167:  "Optimized",              # BCI, BCD

        # Equity general
        13:   "Broad-based",            # VOO, SPY, VTI

        # Equity > Sector > Communication services
        143: "Communications equipment",  # XLC, FCOM
        1094: "Media & entertainment",  # GGME, MUSQ
        9535: "Interactive Media & Services",  # GOOY, FBY

        # Equity > Sector > Consumer discretionary
        53:   "Casinos & gaming",       # BETZ, BJK
        94:   "Hotels, restaurants & leisure",  # PEJ
        9521: "Broadline retail",       # XRT, RTH
        169:  "Automobile manufacturers",  # TSLY (Tesla-focused)

        # Equity > Sector > Consumer staples
        88:   "Food, beverage & tobacco",  # FTXG
        150:  "Consumer",               # MILN (actually Equity > Theme)

        # Equity > Sector > Energy
        97:   "MLPs",                   # AMLP, EMLP
        100:  "Oil & gas equipment & services",  # IEZ
        101:  "Oil & gas exploration & production",  # IEO
        141:  "Oil, gas & consumable fuels",  # XOP, FCG
        1091: "Oil & gas equipment & services",  # OIH, XES
        1092: "Oil & gas refining & marketing",  # CRAK
        9558: "Energy equipment & services",  # USAI

        # Equity > Sector > Financials
        85:   "Banks",                  # KBWB, FTXO
        92:   "Insurance",              # KIE, IAK
        98:   "Mortgage REITs",         # REM, MORT
        1086: "Asset management & custody banks",  # BIZD, PSP
        1087: "Capital markets",        # IAI, KCE
        1088: "Property & casualty insurance",  # KBWP
        1089: "Regional banks",         # KRE, IAT
        9524: "Transaction & payment processing services",  # IPAY
        9530: "Financial Exchanges & Data",  # CONY, FDIQ

        # Equity > Sector > Health care
        86:   "Biotechnology",          # IBB, XBI
        89:   "Health care equipment",  # XHE
        90:   "Health care providers & services",  # IHF, XHS
        102:  "Pharmaceuticals",        # PPH, IHE
        1081: "Pharma, biotech & life sciences",  # PBPH
        1082: "Biotechnology",          # BBC
        1083: "Health care technology", # HTEC, GDOC
        1084: "Health care equipment",  # IHI
        1085: "Health care equipment & services",  # IHF, XHS

        # Equity > Sector > Industrials
        55:   "Construction & engineering",  # PKB
        83:   "Aerospace & defense",    # ITA, PPA
        106:  "Transportation",         # IYT, XTN
        9522: "Passenger airlines",     # JETS
        9529: "Electrical Components & Equipment",  # IAE, VIS, EXPO

        # Equity > Sector > Information technology
        93:   "Internet services & infrastructure",  # KWEB, FDN
        104:  "Semiconductors",         # SMH, SOXX
        105:  "Software",               # IGV
        1078: "Application software",   # MSTY, PLTY (software stock options)
        1079: "Software & services",    # SKYY, XSW
        9548: "Application software",   # SMCY, APLY

        # Equity > Sector > Materials
        49:   "Diversified metals & mining",  # XME, PICK
        56:   "Copper miners",          # COPX, ICOP
        58:   "Gold miners",            # GDX, GDXJ
        67:   "Silver miners",          # SIL, SILJ
        69:   "Steel producers",        # SLX
        1077: "Metals & mining",        # REMX

        # Equity > Sector > Real estate
        1072: "Industrial REITs",       # INDS
        1073: "REITs",                  # SCHH, REET
        1074: "Specialized REITs",      # SRVR

        # Equity > Sector > Utilities
        # (no specific niches found in data)

        # Equity > Size and style
        47:   "Growth",                 # VUG, IWF
        48:   "Value",                  # VTV, IWD

        # Equity > Theme
        16:   "Broad thematic",         # ARKK, KOMP
        43:   "Infrastructure",         # PAVE, IGF
        50:   "Agriculture",            # MOO, VEGI
        57:   "Environment",            # ERTH, EVX
        60:   "Natural resources",      # GUNR, GNR
        61:   "Nuclear energy",         # URA, NLR
        65:   "Renewable energy",       # ICLN, TAN
        70:   "Timber",                 # WOOD, CUT
        72:   "Water",                  # PHO, FIW
        171:  "Low carbon",             # USCA, PABU
        174:  "Cybersecurity",          # CIBR, HACK
        1033: "Video games & eSports",  # ESPO, HERO
        1034: "Robotics & AI",          # BOTZ, AIQ
        1035: "Mobility",               # LIT, DRIV
        1037: "Cannabis",               # MSOS, MJ
        1038: "Blockchain",             # BLOK, BKCH
        1040: "FinTech",                # ARKF, FINX
        1043: "Digital economy",        # TRFK, BITQ
        1044: "5G",                     # SIXG, NXTG
        1066: "Space",                  # UFO, ROKT
        1067: "Telecoms",               # IYZ, XTL
        1075: "Housing",                # ITB, XHB
        1098: "Big Tech",               # MAGS, FEPI
        1100: "Genomic advancements",   # ARKG, IDNA
        1101: "Broad technology",       # IGM, XT

        # Fixed Income niche (maturity-based)
        107:  "Broad maturities",       # BND, AGG
        108:  "Short-term",             # BSV, VCSH
        110:  "Intermediate",           # VCIT, IEF
        111:  "Long-term",              # TLT, TLH
        116:  "Ultra-short term",       # SGOV, BIL
        126:  "Floating rate",          # JAAA, USFR

        # Buffer/Target outcome strategies
        1095: "Income",                 # ABNY
        1096: "Income",                 # SNOY
        9527: "Income",                 # JPO
        9536: "Income",                 # HOOY
        9547: "Income",                 # CVNY
        9550: "Income",                 # NFLY
        9552: "Income",                 # XOMO
        9553: "Income",                 # BRKC
        9575: "Capital appreciation",   # IGLD, BGLD
        9578: "Capital appreciation",   # CBTO, CBOJ
        9580: "Capital appreciation",   # IJAN, IJUL
        9581: "Capital appreciation",   # EJAN, EJUL
        9582: "Capital appreciation",   # BUFQ, QDEC
        9583: "Capital appreciation",   # SDVD, KJAN
        9584: "Income",                 # BOXX, LQTI
        9591: "Income",                 # DOGG
    },

    # =========================================================================
    # STRATEGY (integer ID → label)
    # =========================================================================
    "strategy": {
        1:  "Active",                   # JEPI, DFAC
        2:  "Bullet maturity",          # BSCR, BSCQ
        4:  "Buy-write",                # QYLD, KNG
        5:  "Copycat",                  # TMFC, GVIP
        13: "Dividends",                # VIG, VYM
        14: "Duration hedged",          # LQDH, HYGH
        15: "Equal",                    # RSP, BUFR
        16: "ESG",                      # ESGU, ESGV
        17: "Exchange-specific",        # QQQ, QQQM
        18: "Fixed asset allocation",   # AOR, AOA
        19: "Fundamental",              # SCHD, QUAL
        20: "Growth",                   # VUG, IWF
        22: "Extended-term",            # USO, OILK
        23: "Low volatility",           # USMV, SPLV
        24: "Momentum",                 # MTUM, SPMO
        25: "Multi-factor",             # COWZ, DGRW
        26: "Optimized commodity",      # DBC, CERY
        27: "Price-weighted",           # DIA, AGMI
        28: "Target duration",          # TDTT, XHLF
        30: "Technical",                # PCY, SPHB
        31: "Time since launch",        # FPX, FPXI
        32: "Value",                    # VTV, IWD
        33: "Vanilla",                  # VOO, IVV, SPY
        34: "Trend-following",          # PTLC, PTNQ
        35: "Laddered",                 # KRBN, KCCA
        41: "Inflation hedged",         # LQDI
        48: "Long-short",               # CSM
        49: "Equal",                    # JAJL, ZFEB (defined outcome)
    },

    # =========================================================================
    # WEIGHTING SCHEME (integer ID → label)
    # =========================================================================
    "weighting_scheme": {
        1:  "Proprietary",              # JEPI, DFAC
        3:  "Momentum",                 # MTUM, SPMO
        4:  "Production",               # GSG, COMT
        5:  "Equal",                    # RSP, RDVY
        6:  "Fundamental",              # QUAL, FNDX
        7:  "Dividends",                # QYLD, KNG
        8:  "Duration",                 # TDTT, XHLF
        9:  "Single asset",             # GLD, IAU
        10: "Multi-factor",             # EMB, GSLC
        11: "Liquidity",                # KRBN, VNAM
        12: "Market cap",               # VOO, IVV, SPY
        13: "Dividends",                # VYM, DGRO (dividend-weighted)
        14: "Revenue",                  # RWL, RWJ
        15: "Earnings",                 # EPI, EPS
        16: "Price",                    # DIA, IBAT
        17: "Market value",             # BND, AGG
        18: "Tiered",                   # VUG, VTV
        19: "Volatility",               # SPLV, FDLO
        20: "Beta",                     # SPHB
        22: "Technical",                # LGLV, CERY
        25: "Principles-based",         # ESGU, ESGD
    },

    # =========================================================================
    # SELECTION CRITERIA (integer ID → label)
    # =========================================================================
    "selection_criteria": {
        1:  "AMT-free",                 # MUB, VTEB
        2:  "Beta",                     # SPHB
        3:  "Committee",                # VOO, IVV, SPY
        5:  "Credit downgrade",         # ANGL, FALN
        6:  "Credit rating",            # BHYB, QLTA
        8:  "Developed-market currencies",  # IHY
        9:  "Distributions",            # AMLP, AMJB
        10: "Dividends",                # VIG, VYM
        12: "Earnings",                 # EPI, EPS
        13: "Financials",               # EUIG
        16: "Fixed",                    # BUFR, QYLD
        17: "Fundamental",              # SCHD, IVW
        20: "Exchange-listed",          # FXI (Hong Kong-listed)
        23: "Exchange-listed",          # FTXL, FTXO (NASDAQ-listed)
        24: "Market cap",               # VTI, VEA
        25: "Market value",             # BND, AGG
        26: "Maturity",                 # BSCR, BSCQ
        27: "Momentum",                 # MTUM, SPMO
        28: "Multi-factor",             # VUG, VTV
        29: "Exchange-listed",          # QQQ, QQQM
        31: "Principles-based",         # ESGU, ESGV
        32: "Proprietary",              # JEPI, DFAC
        34: "Revenue-backed",           # RVNU
        35: "Share buybacks",           # PKW, IPKW
        36: "Single asset",             # GLD, IAU
        38: "Technical",                # LGLV, SDCI
        39: "Time since listing",       # FPX, GTIP
        40: "U.S. dollar-denominated",  # EMB, VWOB
        43: "Volatility",               # SPLV, XMLV
        45: "Liquidity",                # IFRA, PBPH
    },
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_label(dimension: str, code) -> str | None:
    """
    Get the human-readable label for a classification code.

    Args:
        dimension: One of 'asset_class', 'category', 'focus', 'niche',
                   'strategy', 'weighting_scheme', 'selection_criteria'
        code: The raw code (hash string for asset_class, int/float for others)

    Returns:
        Human-readable label or None if not found
    """
    if dimension not in CLASSIFICATION_MAP:
        return None

    mapping = CLASSIFICATION_MAP[dimension]

    # asset_class uses string hash keys
    if dimension == "asset_class":
        return mapping.get(code)

    # Other dimensions use integer keys (data may have floats)
    try:
        key = int(float(code)) if code is not None else None
        return mapping.get(key)
    except (ValueError, TypeError):
        return None


def classify_etf(row: dict) -> dict:
    """
    Classify an ETF row and return human-readable labels.

    Args:
        row: Dictionary with keys matching dimension names

    Returns:
        Dictionary with human-readable classification labels
    """
    dimensions = [
        "asset_class",
        "category",
        "focus",
        "niche",
        "strategy",
        "weighting_scheme",
        "selection_criteria",
    ]
    return {dim: get_label(dim, row.get(dim)) for dim in dimensions}


if __name__ == "__main__":
    # Example usage
    test_row = {
        "name": "VOO",
        "asset_class": "c05f85d35d1cd0be6ebb2af4be16e06a",
        "category": 26,
        "focus": 53,
        "niche": 13.0,
        "strategy": 33.0,
        "weighting_scheme": 12.0,
        "selection_criteria": 3.0,
    }

    result = classify_etf(test_row)
    print(f"ETF: {test_row['name']}")
    for key, value in result.items():
        print(f"  {key}: {value}")