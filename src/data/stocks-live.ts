import { fetchWithWebProxy } from "./web-proxy";

export type StockKind = "stock" | "etf";

export type StockMarketRow = {
  symbol: string;
  name: string;
  kind: StockKind;
  price: number;
  changePct: number;
  marketCap: number;
  volume: number;
  averageVolume?: number;
  high24h?: number;
  low24h?: number;
  currency?: string;
  exchange?: string;
  lastUpdatedAt: number;
  logoUrl: string;
};

type YahooNumber = number | { raw?: number };
type YahooScreenerQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  quoteType?: string;
  regularMarketPrice?: YahooNumber;
  regularMarketChangePercent?: YahooNumber;
  marketCap?: YahooNumber;
  regularMarketVolume?: YahooNumber;
  averageDailyVolume3Month?: YahooNumber;
  regularMarketDayHigh?: YahooNumber;
  regularMarketDayLow?: YahooNumber;
  currency?: string;
  fullExchangeName?: string;
  exchange?: string;
};

type YahooScreenerResponse = {
  finance?: {
    result?: {
      quotes?: YahooScreenerQuote[];
    }[];
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: YahooScreenerQuote[];
  };
};

type YahooChartResponse = {
  chart?: {
    result?: {
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        regularMarketVolume?: number;
        marketCap?: number;
        currency?: string;
        exchangeName?: string;
      };
    }[];
  };
};

type YahooQuoteSummaryResponse = {
  quoteSummary?: {
    result?: {
      price?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        quoteType?: string;
        currency?: string;
        exchangeName?: string;
        regularMarketPrice?: YahooNumber;
        regularMarketChangePercent?: YahooNumber;
        regularMarketVolume?: YahooNumber;
        marketCap?: YahooNumber;
        regularMarketDayHigh?: YahooNumber;
        regularMarketDayLow?: YahooNumber;
      };
      summaryDetail?: {
        marketCap?: YahooNumber;
        volume?: YahooNumber;
        averageVolume?: YahooNumber;
        regularMarketVolume?: YahooNumber;
        dayHigh?: YahooNumber;
        dayLow?: YahooNumber;
      };
      defaultKeyStatistics?: {
        marketCap?: YahooNumber;
      };
    }[];
  };
};

const topStocksCache = new Map<string, { expiresAt: number; rows: StockMarketRow[] }>();
const topStocksInflight = new Map<string, Promise<StockMarketRow[]>>();
const quoteCache = new Map<string, { expiresAt: number; rows: StockMarketRow[] }>();
const quoteInflight = new Map<string, Promise<StockMarketRow[]>>();
const YAHOO_TIMEOUT_MS = 6500;

function asNumber(v: YahooNumber | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof v.raw === "number" && Number.isFinite(v.raw)) return v.raw;
  return NaN;
}

function firstFinite(...values: (number | undefined)[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return NaN;
}

function parseKind(input: string | undefined): StockKind | null {
  const t = String(input ?? "").toUpperCase();
  if (t === "EQUITY") return "stock";
  if (t === "ETF" || t === "MUTUALFUND") return "etf";
  return null;
}

export function stockLogoUrl(symbol: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.toUpperCase())}.png`;
}

function toRow(quote: YahooScreenerQuote): StockMarketRow | null {
  const symbol = String(quote.symbol ?? "").trim().toUpperCase();
  const kind = parseKind(quote.quoteType) ?? "stock";
  const price = asNumber(quote.regularMarketPrice);
  if (!symbol || !Number.isFinite(price)) return null;

  const nameRaw = String(quote.shortName ?? quote.longName ?? symbol).trim();
  const name = nameRaw || symbol;
  const changePct = asNumber(quote.regularMarketChangePercent);
  const marketCap = asNumber(quote.marketCap);
  const volume = asNumber(quote.regularMarketVolume);
  const averageVolume = asNumber(quote.averageDailyVolume3Month);
  const high24h = asNumber(quote.regularMarketDayHigh);
  const low24h = asNumber(quote.regularMarketDayLow);

  return {
    symbol,
    name,
    kind,
    price,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    marketCap: Number.isFinite(marketCap) ? marketCap : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    averageVolume: Number.isFinite(averageVolume) ? averageVolume : undefined,
    high24h: Number.isFinite(high24h) ? high24h : undefined,
    low24h: Number.isFinite(low24h) ? low24h : undefined,
    currency: quote.currency,
    exchange: quote.fullExchangeName || quote.exchange,
    lastUpdatedAt: Date.now(),
    logoUrl: stockLogoUrl(symbol),
  };
}

async function fetchScreener(scrId: string, count: number): Promise<StockMarketRow[]> {
  const query =
    `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved` +
    `?formatted=false&scrIds=${encodeURIComponent(scrId)}&count=${Math.max(20, Math.min(250, count))}&start=0`;
  const fallbackQuery =
    `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved` +
    `?formatted=false&scrIds=${encodeURIComponent(scrId)}&count=${Math.max(20, Math.min(250, count))}&start=0`;
  const json =
    (await fetchYahooJson<YahooScreenerResponse>(query)) ??
    (await fetchYahooJson<YahooScreenerResponse>(fallbackQuery));
  if (!json) return [];
  const quotes = json.finance?.result?.[0]?.quotes ?? [];
  return quotes.map(toRow).filter((row): row is StockMarketRow => Boolean(row));
}

export async function fetchTopStocks(params?: {
  count?: number;
  useCache?: boolean;
  cacheTtlMs?: number;
}): Promise<StockMarketRow[]> {
  const count = Math.max(20, Math.min(220, Math.floor(params?.count ?? 200)));
  const useCache = params?.useCache ?? true;
  const cacheTtlMs = Math.max(10_000, params?.cacheTtlMs ?? 30_000);
  const key = `top:${count}`;
  const cached = topStocksCache.get(key);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = topStocksInflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    // Prefer large-cap universe; fall back to most-active if provider blocks that screener id.
    const primary = await fetchScreener("largest_market_cap", Math.max(220, count));
    const secondary = primary.length >= 120 ? [] : await fetchScreener("most_actives", Math.max(220, count));
    const merged = [...primary, ...secondary];
    const bySymbol = new Map<string, StockMarketRow>();
    for (const row of merged) {
      if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
    }
    const rows = [...bySymbol.values()]
      .sort((a, b) => {
        const capDiff = (b.marketCap || 0) - (a.marketCap || 0);
        if (Math.abs(capDiff) > 0) return capDiff;
        return (b.volume || 0) - (a.volume || 0);
      })
      .slice(0, count);
    topStocksCache.set(key, { expiresAt: Date.now() + cacheTtlMs, rows });
    return rows;
  })();

  topStocksInflight.set(key, run);
  try {
    return await run;
  } finally {
    topStocksInflight.delete(key);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchYahooJson<T>(url: string, timeoutMs = YAHOO_TIMEOUT_MS): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchYahooQuoteBatch(symbols: string[]): Promise<StockMarketRow[]> {
  if (!symbols.length) return [];
  const joined = encodeURIComponent(symbols.join(","));
  const primaryUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}`;
  const secondaryUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${joined}`;
  const primary = await fetchYahooJson<YahooQuoteResponse>(primaryUrl);
  const secondary = primary ? null : await fetchYahooJson<YahooQuoteResponse>(secondaryUrl);
  const rows = (primary ?? secondary)?.quoteResponse?.result ?? [];
  return rows.map(toRow).filter((row): row is StockMarketRow => Boolean(row));
}

async function fetchYahooChartFallback(symbol: string): Promise<StockMarketRow | null> {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?interval=1d&range=5d";
  const json = await fetchYahooJson<YahooChartResponse>(url, 7000);
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price)) return null;
  const previousClose = Number(meta?.previousClose);
  const changePct =
    Number.isFinite(previousClose) && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : 0;
  const volume = Number(meta?.regularMarketVolume);
  const marketCap = Number(meta?.marketCap);
  return {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase(),
    kind: "stock",
    price,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    marketCap: Number.isFinite(marketCap) ? marketCap : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    currency: meta?.currency,
    exchange: meta?.exchangeName,
    lastUpdatedAt: Date.now(),
    logoUrl: stockLogoUrl(symbol),
  };
}

async function fetchYahooQuoteSummaryFallback(symbol: string): Promise<StockMarketRow | null> {
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    "?modules=price,summaryDetail,defaultKeyStatistics";
  const json = await fetchYahooJson<YahooQuoteSummaryResponse>(url, 6500);
  const summary = json?.quoteSummary?.result?.[0];
  const price = summary?.price;
  const detail = summary?.summaryDetail;
  const stats = summary?.defaultKeyStatistics;
  const p = asNumber(price?.regularMarketPrice);
  if (!Number.isFinite(p)) return null;
  const marketCap = firstFinite(
    asNumber(price?.marketCap),
    asNumber(detail?.marketCap),
    asNumber(stats?.marketCap)
  );
  const volume = firstFinite(
    asNumber(price?.regularMarketVolume),
    asNumber(detail?.regularMarketVolume),
    asNumber(detail?.volume)
  );
  const averageVolume = asNumber(detail?.averageVolume);
  const high24h = firstFinite(asNumber(price?.regularMarketDayHigh), asNumber(detail?.dayHigh));
  const low24h = firstFinite(asNumber(price?.regularMarketDayLow), asNumber(detail?.dayLow));

  return {
    symbol: String(price?.symbol ?? symbol).toUpperCase(),
    name: String(price?.shortName ?? price?.longName ?? symbol).trim() || symbol,
    kind: parseKind(price?.quoteType) ?? "stock",
    price: p,
    changePct: Number.isFinite(asNumber(price?.regularMarketChangePercent))
      ? asNumber(price?.regularMarketChangePercent)
      : 0,
    marketCap: Number.isFinite(marketCap) ? marketCap : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    averageVolume: Number.isFinite(averageVolume) ? averageVolume : undefined,
    high24h: Number.isFinite(high24h) ? high24h : undefined,
    low24h: Number.isFinite(low24h) ? low24h : undefined,
    currency: price?.currency,
    exchange: price?.exchangeName,
    lastUpdatedAt: Date.now(),
    logoUrl: stockLogoUrl(symbol),
  };
}

export async function fetchStockQuoteSnapshot(
  symbols: string[],
  params?: { useCache?: boolean; cacheTtlMs?: number }
): Promise<StockMarketRow[]> {
  const uniq = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (!uniq.length) return [];
  const useCache = params?.useCache ?? true;
  const cacheTtlMs = Math.max(5_000, params?.cacheTtlMs ?? 20_000);
  const key = uniq.slice().sort().join(",");
  const cached = quoteCache.get(key);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = quoteInflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const batches = chunk(uniq, 40);
    const results = await Promise.all(
      batches.map(async (batch) => fetchYahooQuoteBatch(batch))
    );
    const merged = results.flat();
    const bySymbol = new Map<string, StockMarketRow>(merged.map((row) => [row.symbol, row]));
    const missing = uniq.filter((symbol) => !bySymbol.has(symbol));
    const incomplete = uniq.filter((symbol) => {
      const row = bySymbol.get(symbol);
      if (!row) return false;
      return (row.marketCap || 0) <= 0 || (row.volume || 0) <= 0 || (row.changePct || 0) === 0;
    });
    const needsEnrichment = Array.from(new Set([...missing, ...incomplete])).slice(0, 24);
    if (needsEnrichment.length) {
      const summaryRows = await Promise.all(needsEnrichment.map((symbol) => fetchYahooQuoteSummaryFallback(symbol)));
      for (const row of summaryRows) {
        if (!row) continue;
        const prev = bySymbol.get(row.symbol);
        if (!prev) {
          bySymbol.set(row.symbol, row);
          continue;
        }
        bySymbol.set(row.symbol, {
          ...prev,
          price: Number.isFinite(row.price) ? row.price : prev.price,
          changePct: (row.changePct || 0) !== 0 ? row.changePct : prev.changePct,
          marketCap: row.marketCap > 0 ? row.marketCap : prev.marketCap,
          volume: row.volume > 0 ? row.volume : prev.volume,
          exchange: row.exchange || prev.exchange,
          currency: row.currency || prev.currency,
          lastUpdatedAt: Date.now(),
        });
      }
    }

    if (missing.length) {
      const fallbackRows = await Promise.all(missing.slice(0, 12).map((symbol) => fetchYahooChartFallback(symbol)));
      for (const row of fallbackRows) {
        if (!row) continue;
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
      }
    }

    // Final enrichment pass: fill missing market cap / volume / change from the large-cap screener universe.
    const stillIncomplete = uniq.filter((symbol) => {
      const row = bySymbol.get(symbol);
      if (!row) return true;
      return (row.marketCap || 0) <= 0 || (row.volume || 0) <= 0 || Math.abs(row.changePct || 0) < 0.0001;
    });
    if (stillIncomplete.length) {
      const topUniverse = await fetchTopStocks({ count: 220, useCache: true, cacheTtlMs: 60_000 });
      const topBySymbol = new Map(topUniverse.map((row) => [row.symbol, row]));
      for (const symbol of stillIncomplete) {
        const enrich = topBySymbol.get(symbol);
        if (!enrich) continue;
        const prev = bySymbol.get(symbol);
        if (!prev) {
          bySymbol.set(symbol, { ...enrich, lastUpdatedAt: Date.now() });
          continue;
        }
        bySymbol.set(symbol, {
          ...prev,
          name: prev.name || enrich.name,
          kind: prev.kind || enrich.kind,
          changePct: Math.abs(prev.changePct || 0) < 0.0001 ? enrich.changePct : prev.changePct,
          marketCap: prev.marketCap > 0 ? prev.marketCap : enrich.marketCap,
          volume: prev.volume > 0 ? prev.volume : enrich.volume,
          averageVolume: prev.averageVolume ?? enrich.averageVolume,
          high24h: prev.high24h ?? enrich.high24h,
          low24h: prev.low24h ?? enrich.low24h,
          currency: prev.currency || enrich.currency,
          exchange: prev.exchange || enrich.exchange,
          lastUpdatedAt: Date.now(),
        });
      }
    }
    const finalRows = [...bySymbol.values()];
    if (finalRows.length) {
      quoteCache.set(key, { expiresAt: Date.now() + cacheTtlMs, rows: finalRows });
      return finalRows;
    }
    return cached?.rows ?? [];
  })();

  quoteInflight.set(key, run);
  try {
    return await run;
  } catch {
    return cached?.rows ?? [];
  } finally {
    quoteInflight.delete(key);
  }
}
