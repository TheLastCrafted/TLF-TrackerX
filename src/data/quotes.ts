import { fetchWithWebProxy } from "./web-proxy";
import { fetchStockQuoteSnapshot } from "./stocks-live";

export type QuoteRow = {
  symbol: string;
  price: number;
  previousClose?: number;
  changePct?: number;
  currency?: string;
  exchange?: string;
};
export type QuoteSeriesPoint = { x: number; y: number };

type YahooChartResponse = {
  chart?: {
    result?: {
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        currency?: string;
        exchangeName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: {
          close?: (number | null)[];
        }[];
      };
    }[];
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: {
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      regularMarketChangePercent?: number;
      currency?: string;
      fullExchangeName?: string;
      exchange?: string;
    }[];
  };
};

type FmpHistoricalResponse = {
  symbol?: string;
  historical?: { date?: string; close?: number | string }[];
};

const quoteCache = new Map<string, { expiresAt: number; data: QuoteRow[] }>();
const quoteInflight = new Map<string, Promise<QuoteRow[]>>();
const seriesCache = new Map<string, { expiresAt: number; data: QuoteSeriesPoint[] }>();
const seriesInflight = new Map<string, Promise<QuoteSeriesPoint[]>>();
const FMP_API_KEY =
  (typeof process !== "undefined" &&
    (process.env.EXPO_PUBLIC_FMP_API_KEY || process.env.FMP_API_KEY)) ||
  "demo";
const HAS_USABLE_FMP_KEY = typeof FMP_API_KEY === "string" && FMP_API_KEY.trim().toLowerCase() !== "demo";

function runtimeIsWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toYahooSymbol(symbol: string): string {
  const up = symbol.trim().toUpperCase();
  if (!up) return up;
  // Class-share symbols like BRK.B and BF.B are dash-separated on Yahoo.
  if (/^[A-Z]+\.[A-Z]$/.test(up)) return up.replace(".", "-");
  return up;
}

async function fetchYahooChunk(mappedSymbols: string[]): Promise<QuoteRow[]> {
  if (!mappedSymbols.length) return [];
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(mappedSymbols.join(","))}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" }, signal: ctrl.signal }).finally(() =>
    clearTimeout(timer)
  );
  if (!res.ok) return [];
  const json = (await res.json()) as YahooQuoteResponse;
  const rows = json.quoteResponse?.result ?? [];
  return rows
    .map((row) => ({
      symbol: String(row.symbol ?? "").toUpperCase(),
      price: Number(row.regularMarketPrice),
      previousClose: Number(row.regularMarketPreviousClose),
      changePct: Number(row.regularMarketChangePercent),
      currency: row.currency,
      exchange: row.fullExchangeName ?? row.exchange,
    }))
    .filter((row) => row.symbol && Number.isFinite(row.price));
}

async function fetchYahooChartPoint(symbol: string): Promise<QuoteRow | null> {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?interval=1d&range=5d";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const meta = json.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price)) return null;
    return {
      symbol,
      price,
      previousClose: Number(meta?.previousClose),
      currency: meta?.currency,
      exchange: meta?.exchangeName,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFmpSeries(symbol: string, days: number): Promise<QuoteSeriesPoint[]> {
  if (!HAS_USABLE_FMP_KEY) return [];
  const key = toYahooSymbol(symbol).replace("-", ".");
  if (!key) return [];
  const timeseries = Math.max(40, Math.min(5000, Math.ceil(days * 1.4)));
  const url =
    `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(key)}` +
    `?timeseries=${timeseries}&apikey=${encodeURIComponent(FMP_API_KEY)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as FmpHistoricalResponse;
    const rows = Array.isArray(json.historical) ? json.historical : [];
    const out: QuoteSeriesPoint[] = rows
      .map((row) => {
        const ts = row.date ? Date.parse(`${row.date}T00:00:00Z`) : NaN;
        const price = typeof row.close === "number" ? row.close : Number(row.close);
        return { x: ts, y: price };
      })
      .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
      .sort((a, b) => a.x - b.x);
    if (!out.length) return [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = out.filter((p) => p.x >= cutoff);
    return filtered.length >= 2 ? filtered : out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooChartSeries(
  symbol: string,
  days: number,
  fallback: QuoteSeriesPoint[] = []
): Promise<QuoteSeriesPoint[]> {
  const range =
    days <= 30 ? "1mo" :
    days <= 90 ? "3mo" :
    days <= 180 ? "6mo" :
    days <= 365 ? "1y" :
    days <= 1825 ? "5y" :
    "10y";
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=${encodeURIComponent(range)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return fallback;
    const json = (await res.json()) as YahooChartResponse;
    const result = json.chart?.result?.[0];
    const ts = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const out: QuoteSeriesPoint[] = [];
    const n = Math.min(ts.length, closes.length);
    for (let i = 0; i < n; i += 1) {
      const t = Number(ts[i]);
      const c = Number(closes[i]);
      if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
      out.push({ x: t * 1000, y: c });
    }
    if (!out.length) return fallback;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = out.filter((p) => p.x >= cutoff);
    return filtered.length >= 2 ? filtered : out;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYahooSeries(symbol: string, days = 365): Promise<QuoteSeriesPoint[]> {
  const s = toYahooSymbol(symbol);
  if (!s) return [];
  const cacheKey = `${s}:${days}`;
  const cached = seriesCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) return cached.data;
  const pending = seriesInflight.get(cacheKey);
  if (pending) return pending;
  const run = (async () => {
    if (runtimeIsWeb() && HAS_USABLE_FMP_KEY) {
      const fmpSeries = await fetchFmpSeries(s, days);
      if (fmpSeries.length) {
        seriesCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, data: fmpSeries });
        return fmpSeries;
      }
    }
    const yahooSeries = await fetchYahooChartSeries(s, days, cached?.data ?? []);
    if (yahooSeries.length) {
      seriesCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, data: yahooSeries });
      return yahooSeries;
    }
    return cached?.data ?? [];
  })();
  seriesInflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    seriesInflight.delete(cacheKey);
  }
}

export async function fetchYahooQuotes(symbols: string[]): Promise<QuoteRow[]> {
  const originals = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (!originals.length) return [];
  const cacheKey = originals.sort().join(",");
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) return cached.data;
  const pending = quoteInflight.get(cacheKey);
  if (pending) return pending;
  if (runtimeIsWeb()) {
    const runWeb = (async () => {
      const rows = await fetchStockQuoteSnapshot(originals, { useCache: true, cacheTtlMs: 30_000, enrich: false });
      const mapped: QuoteRow[] = rows
        .filter((row) => Number.isFinite(row.price))
        .map((row) => ({
          symbol: row.symbol,
          price: row.price,
          previousClose: undefined,
          changePct: Number.isFinite(row.changePct) ? row.changePct : undefined,
          currency: row.currency,
          exchange: row.exchange,
        }));
      quoteCache.set(cacheKey, { expiresAt: Date.now() + 30_000, data: mapped });
      return mapped;
    })();
    quoteInflight.set(cacheKey, runWeb);
    try {
      return await runWeb;
    } finally {
      quoteInflight.delete(cacheKey);
    }
  }

  const normalizedToOriginal = new Map<string, string>();
  const requestSymbols = Array.from(
    new Set(
      originals.map((s) => {
        const n = toYahooSymbol(s);
        if (!normalizedToOriginal.has(n)) normalizedToOriginal.set(n, s);
        return n;
      })
    )
  );

  const run = (async () => {
    const batches = chunk(requestSymbols, 40);
    const results = await Promise.allSettled(batches.map((batch) => fetchYahooChunk(batch)));
    const mergedBase = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const seenSymbols = new Set(mergedBase.map((row) => row.symbol.toUpperCase()));
    const missing = requestSymbols.filter((symbol) => !seenSymbols.has((normalizedToOriginal.get(symbol) ?? symbol).toUpperCase()));

    const fallbackResults = await Promise.allSettled(missing.map((symbol) => fetchYahooChartPoint(symbol)));
    const merged = [
      ...mergedBase,
      ...fallbackResults
        .filter((r): r is PromiseFulfilledResult<QuoteRow | null> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((row): row is QuoteRow => Boolean(row)),
    ];

    // Map response symbols back to the originally requested symbols when possible.
    const remapped = merged.map((row) => {
      const maybeNormalized = toYahooSymbol(row.symbol);
      const original = normalizedToOriginal.get(maybeNormalized) ?? normalizedToOriginal.get(row.symbol) ?? row.symbol;
      return { ...row, symbol: original };
    });

    const uniqueBySymbol = new Map<string, QuoteRow>();
    for (const row of remapped) uniqueBySymbol.set(row.symbol.toUpperCase(), row);
    let finalRows = Array.from(uniqueBySymbol.values());
    if (finalRows.length < originals.length) {
      try {
        const fallbackRows = await fetchStockQuoteSnapshot(originals, { useCache: true, enrich: false });
        if (fallbackRows.length) {
          for (const row of fallbackRows) {
            const key = row.symbol.toUpperCase();
            if (uniqueBySymbol.has(key)) continue;
            uniqueBySymbol.set(key, {
              symbol: row.symbol,
              price: row.price,
              previousClose: undefined,
              changePct: row.changePct,
              currency: row.currency,
              exchange: row.exchange,
            });
          }
          finalRows = Array.from(uniqueBySymbol.values());
        }
      } catch {
        // keep primary rows
      }
    }
    quoteCache.set(cacheKey, { expiresAt: Date.now() + 30_000, data: finalRows });
    return finalRows;
  })();
  quoteInflight.set(cacheKey, run);
  try {
    return await run;
  } catch {
    return cached?.data ?? [];
  } finally {
    quoteInflight.delete(cacheKey);
  }
}
