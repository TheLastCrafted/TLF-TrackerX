import { FINANCIAL_ASSETS } from "../catalog/financial-assets";
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

type FmpQuoteRow = {
  symbol?: string;
  name?: string;
  price?: number | string;
  changesPercentage?: number | string;
  marketCap?: number | string;
  volume?: number | string;
  avgVolume?: number | string;
  dayHigh?: number | string;
  dayLow?: number | string;
  exchange?: string;
};

type FmpScreenerRow = {
  symbol?: string;
  companyName?: string;
  marketCap?: number | string;
  volume?: number | string;
  price?: number | string;
  isEtf?: boolean;
  exchange?: string;
};

const topStocksCache = new Map<string, { expiresAt: number; rows: StockMarketRow[] }>();
const topStocksInflight = new Map<string, Promise<StockMarketRow[]>>();
const quoteCache = new Map<string, { expiresAt: number; rows: StockMarketRow[] }>();
const quoteInflight = new Map<string, Promise<StockMarketRow[]>>();
const YAHOO_TIMEOUT_MS = 6500;
const FMP_TIMEOUT_MS = 6500;
const FMP_API_KEY =
  (typeof process !== "undefined" &&
    (process.env.EXPO_PUBLIC_FMP_API_KEY || process.env.FMP_API_KEY)) ||
  "demo";
const LOCAL_BY_SYMBOL = new Map(
  FINANCIAL_ASSETS.filter((row) => row.kind === "stock" || row.kind === "etf").map((row) => [row.symbol.toUpperCase(), row])
);

function runtimeIsWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function asNumber(v: YahooNumber | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof v.raw === "number" && Number.isFinite(v.raw)) return v.raw;
  return NaN;
}

function asLooseNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const normalized = v.replace(/[%,$\s]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
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

function localFallbackRow(symbol: string): StockMarketRow | null {
  const meta = LOCAL_BY_SYMBOL.get(symbol.toUpperCase());
  if (!meta) return null;
  return {
    symbol: meta.symbol.toUpperCase(),
    name: meta.name,
    kind: meta.kind === "etf" ? "etf" : "stock",
    price: Number(meta.defaultPrice ?? 0),
    changePct: 0,
    marketCap: 0,
    volume: 0,
    currency: "USD",
    exchange: undefined,
    lastUpdatedAt: Date.now(),
    logoUrl: stockLogoUrl(meta.symbol),
  };
}

function buildLocalFallbackRows(count: number): StockMarketRow[] {
  return FINANCIAL_ASSETS.filter((row) => row.kind === "stock" || row.kind === "etf")
    .slice(0, count)
    .map((asset) => ({
      symbol: asset.symbol.toUpperCase(),
      name: asset.name,
      kind: asset.kind === "etf" ? "etf" : "stock",
      price: Number(asset.defaultPrice ?? 0),
      changePct: 0,
      marketCap: 0,
      volume: 0,
      currency: "USD",
      exchange: undefined,
      lastUpdatedAt: Date.now(),
      logoUrl: stockLogoUrl(asset.symbol),
    }));
}

export function getLocalStockFallbackRows(count = 200): StockMarketRow[] {
  return buildLocalFallbackRows(Math.max(20, Math.min(220, Math.floor(count))));
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
    const isWeb = runtimeIsWeb();
    const limit = Math.max(220, count);
    // On web, avoid Yahoo screener endpoints entirely (frequent 429 on shared serverless IPs).
    const fmp = await fetchFmpTopUniverse(limit);
    const primary = isWeb ? [] : await fetchScreener("largest_market_cap", limit);
    const secondary = isWeb ? [] : primary.length >= 120 ? [] : await fetchScreener("most_actives", limit);
    const merged = isWeb ? [...fmp] : [...primary, ...secondary, ...fmp];
    const bySymbol = new Map<string, StockMarketRow>();
    for (const row of merged) {
      if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
    }
    if (isWeb && bySymbol.size < count) {
      const fallback = buildLocalFallbackRows(count);
      for (const row of fallback) {
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
        if (bySymbol.size >= count) break;
      }
    }
    const rows = [...bySymbol.values()]
      .sort((a, b) => {
        const capDiff = (b.marketCap || 0) - (a.marketCap || 0);
        if (Math.abs(capDiff) > 0) return capDiff;
        return (b.volume || 0) - (a.volume || 0);
      })
      .slice(0, count);
    const safeRows = rows.length ? rows : buildLocalFallbackRows(count);
    topStocksCache.set(key, { expiresAt: Date.now() + cacheTtlMs, rows: safeRows });
    return safeRows;
  })();

  topStocksInflight.set(key, run);
  try {
    return await run;
  } finally {
    topStocksInflight.delete(key);
  }
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

async function fetchFmpJson<T>(url: string, timeoutMs = FMP_TIMEOUT_MS): Promise<T | null> {
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

function toFmpRow(row: FmpQuoteRow): StockMarketRow | null {
  const symbol = String(row.symbol ?? "").trim().toUpperCase();
  const price = asLooseNumber(row.price);
  if (!symbol || !Number.isFinite(price)) return null;
  const rawName = String(row.name ?? symbol).trim();
  const name = rawName || symbol;
  const kind = /\bETF\b/i.test(name) ? "etf" : "stock";
  const changePct = asLooseNumber(row.changesPercentage);
  const marketCap = asLooseNumber(row.marketCap);
  const volume = asLooseNumber(row.volume);
  const avgVolume = asLooseNumber(row.avgVolume);
  const dayHigh = asLooseNumber(row.dayHigh);
  const dayLow = asLooseNumber(row.dayLow);
  return {
    symbol,
    name,
    kind,
    price,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    marketCap: Number.isFinite(marketCap) ? marketCap : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    averageVolume: Number.isFinite(avgVolume) ? avgVolume : undefined,
    high24h: Number.isFinite(dayHigh) ? dayHigh : undefined,
    low24h: Number.isFinite(dayLow) ? dayLow : undefined,
    currency: "USD",
    exchange: row.exchange,
    lastUpdatedAt: Date.now(),
    logoUrl: stockLogoUrl(symbol),
  };
}

async function fetchFmpQuoteBatch(symbols: string[]): Promise<StockMarketRow[]> {
  if (!symbols.length) return [];
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 40) chunks.push(uniq.slice(i, i + 40));
  const settled = await Promise.allSettled(
    chunks.map(async (batch) => {
      const joined = batch.join(",");
      const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(joined)}?apikey=${encodeURIComponent(FMP_API_KEY)}`;
      const rows = await fetchFmpJson<FmpQuoteRow[]>(url);
      if (!Array.isArray(rows)) return [];
      return rows.map(toFmpRow).filter((row): row is StockMarketRow => Boolean(row));
    })
  );
  const merged = settled.flatMap((row) => (row.status === "fulfilled" ? row.value : []));
  const bySymbol = new Map<string, StockMarketRow>();
  for (const row of merged) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
  }
  return [...bySymbol.values()];
}

function toFmpScreenerRow(row: FmpScreenerRow): StockMarketRow | null {
  const symbol = String(row.symbol ?? "").trim().toUpperCase();
  const price = asLooseNumber(row.price);
  if (!symbol || !Number.isFinite(price)) return null;
  const name = String(row.companyName ?? symbol).trim() || symbol;
  const marketCap = asLooseNumber(row.marketCap);
  const volume = asLooseNumber(row.volume);
  return {
    symbol,
    name,
    kind: row.isEtf ? "etf" : /\bETF\b/i.test(name) ? "etf" : "stock",
    price,
    changePct: 0,
    marketCap: Number.isFinite(marketCap) ? marketCap : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    currency: "USD",
    exchange: row.exchange,
    lastUpdatedAt: Date.now(),
    logoUrl: stockLogoUrl(symbol),
  };
}

async function fetchFmpTopUniverse(count: number): Promise<StockMarketRow[]> {
  const limit = Math.max(40, Math.min(250, count));
  const baseUrl = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=5000000000&limit=${limit}&exchange=NASDAQ,NYSE&apikey=${encodeURIComponent(FMP_API_KEY)}`;
  const rows = await fetchFmpJson<FmpScreenerRow[]>(baseUrl);
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map(toFmpScreenerRow).filter((row): row is StockMarketRow => Boolean(row));
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
  params?: { useCache?: boolean; cacheTtlMs?: number; enrich?: boolean }
): Promise<StockMarketRow[]> {
  const uniq = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (!uniq.length) return [];
  const isWebRuntime = runtimeIsWeb();
  const useCache = params?.useCache ?? true;
  const enrich = params?.enrich ?? true;
  const cacheTtlMs = Math.max(5_000, params?.cacheTtlMs ?? 20_000);
  const key = `${uniq.slice().sort().join(",")}:enrich:${enrich ? 1 : 0}`;
  const cached = quoteCache.get(key);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = quoteInflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const bySymbol = new Map<string, StockMarketRow>();
    // Priming with top-universe is expensive; on web it caused repeated heavy screener requests.
    const shouldPrimeWithTopUniverse = !isWebRuntime && uniq.length > 40;
    if (shouldPrimeWithTopUniverse) {
      const topUniverse = await fetchTopStocks({ count: 220, useCache: true, cacheTtlMs: 60_000 });
      const topBySymbol = new Map(topUniverse.map((row) => [row.symbol, row]));
      for (const symbol of uniq) {
        const top = topBySymbol.get(symbol);
        if (top) bySymbol.set(symbol, top);
      }
    }

    const remaining = uniq.filter((symbol) => !bySymbol.has(symbol));
    if (remaining.length) {
      const maxSymbolsFromQuoteApi = isWebRuntime ? 120 : remaining.length;
      const symbolsToFetch = remaining.slice(0, maxSymbolsFromQuoteApi);
      if (symbolsToFetch.length) {
        const primaryRows = isWebRuntime ? await fetchFmpQuoteBatch(symbolsToFetch) : await fetchYahooQuoteBatch(symbolsToFetch);
        for (const row of primaryRows) {
          const prev = bySymbol.get(row.symbol);
          if (!prev) {
            bySymbol.set(row.symbol, row);
            continue;
          }
          bySymbol.set(row.symbol, {
            ...prev,
            price: Number.isFinite(row.price) ? row.price : prev.price,
            changePct: Number.isFinite(row.changePct) ? row.changePct : prev.changePct,
            marketCap: row.marketCap > 0 ? row.marketCap : prev.marketCap,
            volume: row.volume > 0 ? row.volume : prev.volume,
            averageVolume: row.averageVolume ?? prev.averageVolume,
            high24h: row.high24h ?? prev.high24h,
            low24h: row.low24h ?? prev.low24h,
            currency: row.currency || prev.currency,
            exchange: row.exchange || prev.exchange,
            lastUpdatedAt: Date.now(),
          });
        }
      }
      const unresolvedAfterPrimary = symbolsToFetch.filter((symbol) => !bySymbol.has(symbol));
      if (unresolvedAfterPrimary.length && !isWebRuntime) {
        const secondaryTargets = isWebRuntime
          ? unresolvedAfterPrimary.slice(0, 35)
          : unresolvedAfterPrimary;
        const secondaryRows = isWebRuntime
          ? await fetchYahooQuoteBatch(secondaryTargets)
          : await fetchFmpQuoteBatch(secondaryTargets);
        for (const row of secondaryRows) {
          const prev = bySymbol.get(row.symbol);
          if (!prev) {
            bySymbol.set(row.symbol, row);
            continue;
          }
          bySymbol.set(row.symbol, {
            ...prev,
            price: Number.isFinite(row.price) ? row.price : prev.price,
            changePct: Number.isFinite(row.changePct) ? row.changePct : prev.changePct,
            marketCap: row.marketCap > 0 ? row.marketCap : prev.marketCap,
            volume: row.volume > 0 ? row.volume : prev.volume,
            averageVolume: row.averageVolume ?? prev.averageVolume,
            high24h: row.high24h ?? prev.high24h,
            low24h: row.low24h ?? prev.low24h,
            currency: row.currency || prev.currency,
            exchange: row.exchange || prev.exchange,
            lastUpdatedAt: Date.now(),
          });
        }
      }
    }

    if (enrich && !isWebRuntime) {
      const missingAfterQuotes = uniq.filter((symbol) => !bySymbol.has(symbol));
      const summaryTargets = missingAfterQuotes.slice(0, isWebRuntime ? 4 : 10);
      if (summaryTargets.length) {
        const summaryRows = await Promise.all(summaryTargets.map((symbol) => fetchYahooQuoteSummaryFallback(symbol)));
        for (const row of summaryRows) {
          if (!row) continue;
          if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
        }
      }

      const stillMissing = uniq.filter((symbol) => !bySymbol.has(symbol));
      if (stillMissing.length) {
        const fallbackRows = await Promise.all(
          stillMissing.slice(0, isWebRuntime ? 3 : 8).map((symbol) => fetchYahooChartFallback(symbol))
        );
        for (const row of fallbackRows) {
          if (!row) continue;
          if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
        }
      }
    }

    for (const symbol of uniq) {
      if (bySymbol.has(symbol)) continue;
      const local = localFallbackRow(symbol);
      if (local) bySymbol.set(symbol, local);
    }

    const finalRows = uniq.map((symbol) => bySymbol.get(symbol)).filter((row): row is StockMarketRow => Boolean(row));
    const safeRows =
      finalRows.length > 0
        ? finalRows
        : uniq
            .map((symbol) => localFallbackRow(symbol))
            .filter((row): row is StockMarketRow => Boolean(row));
    if (safeRows.length) {
      quoteCache.set(key, { expiresAt: Date.now() + cacheTtlMs, rows: safeRows });
      return safeRows;
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
