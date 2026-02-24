import { FINANCIAL_ASSETS } from "../catalog/financial-assets";

export type SearchAssetKind = "stock" | "etf" | "crypto";

export type UniversalAsset = {
  id: string;
  symbol: string;
  name: string;
  kind: SearchAssetKind;
  source: "coingecko" | "yahoo" | "local";
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

const cgSearchCache = new Map<string, { expiresAt: number; rows: UniversalAsset[] }>();
let lastCoinGeckoSearchAt = 0;

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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
      lastPrice: asset.defaultPrice,
    }));

  const [yahooRows, cryptoRows] = await Promise.allSettled([searchYahoo(q, limit), searchCoinGecko(q, limit)]);
  const merged = [
    ...localRows,
    ...(yahooRows.status === "fulfilled" ? yahooRows.value : []),
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

  return deduped.slice(0, limit);
}
