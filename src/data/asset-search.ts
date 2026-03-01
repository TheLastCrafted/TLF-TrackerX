import { FINANCIAL_ASSETS } from "../catalog/financial-assets";
import { getLastKnownStockQuotes } from "./stocks-live";
import { fetchWithWebProxy } from "./web-proxy";

export type SearchAssetKind = "stock" | "etf" | "crypto";

export type UniversalAsset = {
  id: string;
  symbol: string;
  name: string;
  kind: SearchAssetKind;
  source: "coingecko" | "yahoo" | "fmp" | "local";
  exchange?: string;
  currency?: string;
  coinGeckoId?: string;
  lastPrice?: number;
};

type YahooSearchResponse = {
  quotes?: {
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
    exchDisp?: string;
    exchange?: string;
    currency?: string;
    regularMarketPrice?: number;
    isYahooFinance?: boolean;
  }[];
};

type CoinGeckoSearchResponse = {
  coins?: {
    id: string;
    symbol: string;
    name: string;
  }[];
};

type FmpSearchRow = {
  symbol?: string;
  name?: string;
  stockExchange?: string;
  exchangeShortName?: string;
  currency?: string;
};

const cgSearchCache = new Map<string, { expiresAt: number; rows: UniversalAsset[] }>();
let lastCoinGeckoSearchAt = 0;
const FMP_API_KEY =
  (typeof process !== "undefined" &&
    (process.env.EXPO_PUBLIC_FMP_API_KEY || process.env.FMP_API_KEY)) ||
  "demo";
const HAS_USABLE_FMP_KEY = typeof FMP_API_KEY === "string" && FMP_API_KEY.trim().toLowerCase() !== "demo";

function normalizeYahooType(quoteType?: string, nameHint?: string): SearchAssetKind | null {
  const name = (nameHint ?? "").toUpperCase();
  if (!quoteType) return null;
  const type = quoteType.toUpperCase();
  if (type === "ETF") return "etf";
  if (type === "MUTUALFUND") return "etf";
  if (type === "EQUITY") {
    if (
      name.includes(" ETF") ||
      name.startsWith("ETF ") ||
      name.includes(" EXCHANGE TRADED FUND") ||
      name.includes(" TRUST")
    ) {
      return "etf";
    }
    return "stock";
  }
  return null;
}

async function searchYahoo(query: string, limit: number): Promise<UniversalAsset[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${Math.max(
    10,
    limit
  )}&newsCount=0&enableFuzzyQuery=false`;
  const res = await fetchWithWebProxy(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as YahooSearchResponse;
  const quotes = data.quotes ?? [];
  const rows: UniversalAsset[] = [];
  for (const quote of quotes) {
    const nameHint = (quote.shortname || quote.longname || quote.symbol || "").trim();
    const kind = normalizeYahooType(quote.quoteType, nameHint);
    if (!kind) continue;
    const symbol = quote.symbol?.trim();
    if (!symbol) continue;
    rows.push({
      id: `yf:${symbol}:${quote.exchange ?? ""}`,
      symbol,
      name: nameHint || symbol,
      kind,
      source: "yahoo",
      exchange: quote.exchDisp || quote.exchange || undefined,
      currency: quote.currency || undefined,
      lastPrice: Number.isFinite(quote.regularMarketPrice) ? Number(quote.regularMarketPrice) : undefined,
    });
  }
  return rows.slice(0, limit);
}

async function searchCoinGecko(query: string, limit: number): Promise<UniversalAsset[]> {
  const cacheKey = `${query.toLowerCase()}:${limit}`;
  const cached = cgSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const sinceLast = Date.now() - lastCoinGeckoSearchAt;
  if (sinceLast < 800) {
    const recentRows = [...cgSearchCache.values()].filter((row) => row.expiresAt > Date.now());
    const recent = recentRows.length ? recentRows[recentRows.length - 1] : undefined;
    if (recent) return recent.rows.slice(0, limit);
  }

  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
  const res = await fetchWithWebProxy(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  lastCoinGeckoSearchAt = Date.now();
  const data = (await res.json()) as CoinGeckoSearchResponse;
  const coins = data.coins ?? [];
  const rows: UniversalAsset[] = coins.slice(0, limit).map((coin) => ({
    id: `cg:${coin.id}`,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    kind: "crypto",
    source: "coingecko",
    coinGeckoId: coin.id,
  }));
  cgSearchCache.set(cacheKey, { expiresAt: Date.now() + 30_000, rows });
  return rows;
}

function normalizeFmpKind(nameHint?: string): SearchAssetKind {
  const up = String(nameHint ?? "").toUpperCase();
  if (up.includes(" ETF") || up.includes("EXCHANGE TRADED FUND") || up.includes(" TRUST")) return "etf";
  return "stock";
}

async function searchFmp(query: string, limit: number): Promise<UniversalAsset[]> {
  const url = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=${Math.max(10, limit)}&apikey=${encodeURIComponent(FMP_API_KEY)}`;
  const res = await fetchWithWebProxy(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as FmpSearchRow[];
  if (!Array.isArray(data)) return [];
  const rows: UniversalAsset[] = [];
  for (const row of data) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const name = String(row.name ?? symbol).trim() || symbol;
    rows.push({
      id: `fmp:${symbol}:${row.exchangeShortName ?? ""}`,
      symbol,
      name,
      kind: normalizeFmpKind(name),
      source: "fmp",
      exchange: row.stockExchange || row.exchangeShortName || undefined,
      currency: row.currency || undefined,
    });
  }
  return rows.slice(0, limit);
}

export async function searchUniversalAssets(query: string, limit = 24): Promise<UniversalAsset[]> {
  const q = query.trim();
  if (!q) return [];

  const normalizedQ = q.toLowerCase();
  const localRows: UniversalAsset[] = FINANCIAL_ASSETS
    .filter((asset) => {
      const symbol = asset.symbol.toLowerCase();
      const name = asset.name.toLowerCase();
      return symbol.includes(normalizedQ) || name.includes(normalizedQ);
    })
    .slice(0, limit)
    .map((asset) => ({
      id: `local:${asset.id}`,
      symbol: asset.symbol,
      name: asset.name,
      kind: asset.kind,
      source: "local",
      coinGeckoId: asset.coinGeckoId,
    }));

  const fmpTask = HAS_USABLE_FMP_KEY ? searchFmp(q, limit) : Promise.resolve([] as UniversalAsset[]);
  const [yahooRows, cryptoRows, fmpRows] = await Promise.allSettled([searchYahoo(q, limit), searchCoinGecko(q, limit), fmpTask]);
  const merged = [
    ...localRows,
    ...(yahooRows.status === "fulfilled" ? yahooRows.value : []),
    ...(fmpRows.status === "fulfilled" ? fmpRows.value : []),
    ...(cryptoRows.status === "fulfilled" ? cryptoRows.value : []),
  ];

  const seen = new Set<string>();
  const deduped: UniversalAsset[] = [];
  for (const item of merged) {
    const key = `${item.kind}:${item.symbol.toUpperCase()}:${item.exchange ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  const symbolsNeedingLastPrice = deduped
    .filter((row) => row.kind !== "crypto" && !Number.isFinite(Number(row.lastPrice)))
    .map((row) => row.symbol.toUpperCase())
    .filter(Boolean);
  if (symbolsNeedingLastPrice.length) {
    try {
      const known = await getLastKnownStockQuotes(symbolsNeedingLastPrice);
      const bySymbol = new Map(known.map((row) => [row.symbol.toUpperCase(), row]));
      for (const row of deduped) {
        if (row.kind === "crypto" && !row.coinGeckoId) continue;
        if (row.kind === "crypto") continue;
        if (Number.isFinite(Number(row.lastPrice))) continue;
        const hit = bySymbol.get(row.symbol.toUpperCase());
        if (!hit || !Number.isFinite(hit.price)) continue;
        row.lastPrice = hit.price;
        if (!row.currency && hit.currency) row.currency = hit.currency;
        if (!row.exchange && hit.exchange) row.exchange = hit.exchange;
      }
    } catch {
      // Best effort enrichment only.
    }
  }

  return deduped.slice(0, limit);
}
