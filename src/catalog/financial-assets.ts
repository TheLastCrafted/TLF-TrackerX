import { TRACKED_COINS } from "./coins";

export type FinancialAssetKind = "crypto" | "stock" | "etf";

export type FinancialAsset = {
  id: string;
  symbol: string;
  name: string;
  kind: FinancialAssetKind;
  coinGeckoId?: string;
  defaultPrice?: number;
};

const STOCKS: FinancialAsset[] = [
  { id: "stock_aapl", symbol: "AAPL", name: "Apple Inc.", kind: "stock", defaultPrice: 190 },
  { id: "stock_msft", symbol: "MSFT", name: "Microsoft Corp.", kind: "stock", defaultPrice: 420 },
  { id: "stock_googl", symbol: "GOOGL", name: "Alphabet Inc.", kind: "stock", defaultPrice: 180 },
  { id: "stock_amzn", symbol: "AMZN", name: "Amazon.com Inc.", kind: "stock", defaultPrice: 175 },
  { id: "stock_nvda", symbol: "NVDA", name: "NVIDIA Corp.", kind: "stock", defaultPrice: 880 },
  { id: "stock_meta", symbol: "META", name: "Meta Platforms", kind: "stock", defaultPrice: 500 },
  { id: "stock_tsla", symbol: "TSLA", name: "Tesla Inc.", kind: "stock", defaultPrice: 210 },
  { id: "stock_brkb", symbol: "BRK.B", name: "Berkshire Hathaway B", kind: "stock", defaultPrice: 420 },
  { id: "stock_jpm", symbol: "JPM", name: "JPMorgan Chase", kind: "stock", defaultPrice: 200 },
  { id: "stock_v", symbol: "V", name: "Visa Inc.", kind: "stock", defaultPrice: 280 },
  { id: "stock_ma", symbol: "MA", name: "Mastercard", kind: "stock", defaultPrice: 460 },
  { id: "stock_unh", symbol: "UNH", name: "UnitedHealth Group", kind: "stock", defaultPrice: 495 },
  { id: "stock_ko", symbol: "KO", name: "Coca-Cola Co.", kind: "stock", defaultPrice: 60 },
  { id: "stock_xom", symbol: "XOM", name: "Exxon Mobil", kind: "stock", defaultPrice: 116 },
  { id: "stock_wmt", symbol: "WMT", name: "Walmart", kind: "stock", defaultPrice: 67 },
  { id: "stock_jnj", symbol: "JNJ", name: "Johnson & Johnson", kind: "stock", defaultPrice: 150 },
  { id: "stock_pg", symbol: "PG", name: "Procter & Gamble", kind: "stock", defaultPrice: 162 },
  { id: "stock_dis", symbol: "DIS", name: "Walt Disney", kind: "stock", defaultPrice: 105 },
  { id: "stock_amd", symbol: "AMD", name: "Advanced Micro Devices", kind: "stock", defaultPrice: 180 },
  { id: "stock_bac", symbol: "BAC", name: "Bank of America", kind: "stock", defaultPrice: 40 },
  { id: "stock_orcl", symbol: "ORCL", name: "Oracle Corp.", kind: "stock", defaultPrice: 132 },
  { id: "stock_csco", symbol: "CSCO", name: "Cisco Systems", kind: "stock", defaultPrice: 50 },
  { id: "stock_intc", symbol: "INTC", name: "Intel Corp.", kind: "stock", defaultPrice: 45 },
  { id: "stock_nke", symbol: "NKE", name: "Nike Inc.", kind: "stock", defaultPrice: 93 },
  { id: "stock_mcd", symbol: "MCD", name: "McDonald's Corp.", kind: "stock", defaultPrice: 290 },
  { id: "stock_pep", symbol: "PEP", name: "PepsiCo", kind: "stock", defaultPrice: 172 },
  { id: "stock_adbe", symbol: "ADBE", name: "Adobe Inc.", kind: "stock", defaultPrice: 525 },
  { id: "stock_crm", symbol: "CRM", name: "Salesforce", kind: "stock", defaultPrice: 300 },
  { id: "stock_abnb", symbol: "ABNB", name: "Airbnb", kind: "stock", defaultPrice: 160 },
  { id: "stock_shop", symbol: "SHOP", name: "Shopify", kind: "stock", defaultPrice: 90 },
  { id: "stock_pypl", symbol: "PYPL", name: "PayPal", kind: "stock", defaultPrice: 70 },
  { id: "stock_uber", symbol: "UBER", name: "Uber", kind: "stock", defaultPrice: 75 },
  { id: "stock_lyft", symbol: "LYFT", name: "Lyft", kind: "stock", defaultPrice: 16 },
  { id: "stock_pfe", symbol: "PFE", name: "Pfizer", kind: "stock", defaultPrice: 28 },
  { id: "stock_mrk", symbol: "MRK", name: "Merck", kind: "stock", defaultPrice: 128 },
  { id: "stock_cvx", symbol: "CVX", name: "Chevron", kind: "stock", defaultPrice: 155 },
  { id: "stock_gs", symbol: "GS", name: "Goldman Sachs", kind: "stock", defaultPrice: 430 },
  { id: "stock_blk", symbol: "BLK", name: "BlackRock", kind: "stock", defaultPrice: 790 },
  { id: "stock_bmy", symbol: "BMY", name: "Bristol-Myers Squibb", kind: "stock", defaultPrice: 53 },
  { id: "stock_snow", symbol: "SNOW", name: "Snowflake", kind: "stock", defaultPrice: 160 },
  { id: "stock_panw", symbol: "PANW", name: "Palo Alto Networks", kind: "stock", defaultPrice: 315 },
  { id: "stock_net", symbol: "NET", name: "Cloudflare", kind: "stock", defaultPrice: 90 },
  { id: "stock_sofi", symbol: "SOFI", name: "SoFi Technologies", kind: "stock", defaultPrice: 9 },
  { id: "stock_pltr", symbol: "PLTR", name: "Palantir", kind: "stock", defaultPrice: 24 },
];

const ETFS: FinancialAsset[] = [
  { id: "etf_spy", symbol: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", defaultPrice: 525 },
  { id: "etf_qqq", symbol: "QQQ", name: "Invesco QQQ Trust", kind: "etf", defaultPrice: 450 },
  { id: "etf_vti", symbol: "VTI", name: "Vanguard Total Stock Market ETF", kind: "etf", defaultPrice: 265 },
  { id: "etf_voo", symbol: "VOO", name: "Vanguard S&P 500 ETF", kind: "etf", defaultPrice: 480 },
  { id: "etf_ive", symbol: "IVE", name: "iShares S&P 500 Value ETF", kind: "etf", defaultPrice: 175 },
  { id: "etf_vug", symbol: "VUG", name: "Vanguard Growth ETF", kind: "etf", defaultPrice: 385 },
  { id: "etf_iwm", symbol: "IWM", name: "iShares Russell 2000 ETF", kind: "etf", defaultPrice: 205 },
  { id: "etf_xlk", symbol: "XLK", name: "Technology Select Sector SPDR", kind: "etf", defaultPrice: 230 },
  { id: "etf_xlf", symbol: "XLF", name: "Financial Select Sector SPDR", kind: "etf", defaultPrice: 42 },
  { id: "etf_xle", symbol: "XLE", name: "Energy Select Sector SPDR", kind: "etf", defaultPrice: 95 },
  { id: "etf_tlt", symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", kind: "etf", defaultPrice: 93 },
  { id: "etf_gld", symbol: "GLD", name: "SPDR Gold Shares", kind: "etf", defaultPrice: 217 },
  { id: "etf_slv", symbol: "SLV", name: "iShares Silver Trust", kind: "etf", defaultPrice: 26 },
  { id: "etf_arkk", symbol: "ARKK", name: "ARK Innovation ETF", kind: "etf", defaultPrice: 55 },
  { id: "etf_schd", symbol: "SCHD", name: "Schwab US Dividend Equity ETF", kind: "etf", defaultPrice: 78 },
  { id: "etf_vxus", symbol: "VXUS", name: "Vanguard Total International Stock ETF", kind: "etf", defaultPrice: 62 },
  { id: "etf_bnd", symbol: "BND", name: "Vanguard Total Bond Market ETF", kind: "etf", defaultPrice: 73 },
  { id: "etf_vnq", symbol: "VNQ", name: "Vanguard Real Estate ETF", kind: "etf", defaultPrice: 84 },
  { id: "etf_xlu", symbol: "XLU", name: "Utilities Select Sector SPDR", kind: "etf", defaultPrice: 70 },
  { id: "etf_xli", symbol: "XLI", name: "Industrial Select Sector SPDR", kind: "etf", defaultPrice: 125 },
  { id: "etf_xly", symbol: "XLY", name: "Consumer Discretionary Select Sector SPDR", kind: "etf", defaultPrice: 180 },
  { id: "etf_xlp", symbol: "XLP", name: "Consumer Staples Select Sector SPDR", kind: "etf", defaultPrice: 76 },
  { id: "etf_xlv", symbol: "XLV", name: "Health Care Select Sector SPDR", kind: "etf", defaultPrice: 145 },
  { id: "etf_iemg", symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", kind: "etf", defaultPrice: 54 },
  { id: "etf_eem", symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", kind: "etf", defaultPrice: 43 },
  { id: "etf_dia", symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", kind: "etf", defaultPrice: 390 },
  { id: "etf_ita", symbol: "ITA", name: "iShares U.S. Aerospace & Defense ETF", kind: "etf", defaultPrice: 132 },
  { id: "etf_smh", symbol: "SMH", name: "VanEck Semiconductor ETF", kind: "etf", defaultPrice: 245 },
  { id: "etf_soxx", symbol: "SOXX", name: "iShares Semiconductor ETF", kind: "etf", defaultPrice: 220 },
  { id: "etf_ibit", symbol: "IBIT", name: "iShares Bitcoin Trust ETF", kind: "etf", defaultPrice: 40 },
  { id: "etf_bito", symbol: "BITO", name: "ProShares Bitcoin Strategy ETF", kind: "etf", defaultPrice: 27 },
];

const CRYPTO: FinancialAsset[] = TRACKED_COINS.map((coin) => ({
  id: `crypto_${coin.id}`,
  symbol: coin.symbol,
  name: coin.name,
  kind: "crypto" as const,
  coinGeckoId: coin.id,
}));

export const FINANCIAL_ASSETS: FinancialAsset[] = [...CRYPTO, ...STOCKS, ...ETFS];
export const FINANCIAL_ASSETS_BY_ID: Record<string, FinancialAsset> = Object.fromEntries(
  FINANCIAL_ASSETS.map((asset) => [asset.id, asset])
);
