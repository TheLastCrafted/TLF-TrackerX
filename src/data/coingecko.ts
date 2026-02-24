export type XYPoint = { x: number; y: number };

type RequestJsonOptions = {
  retries?: number;
  timeoutMs?: number;
  staleKey?: string;
  staleTtlMs?: number;
};

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const DEFAULT_TIMEOUT_MS = 9000;
const COINGECKO_MIN_REQUEST_GAP_MS = 1200;

const memoryCache = new Map<string, { expiresAt: number; data: unknown }>();
const staleCache = new Map<string, { expiresAt: number; data: unknown }>();
const inflight = new Map<string, Promise<any>>();
let lastCoinGeckoRequestAt = 0;
let coinGeckoGate: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCached<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached(key: string, data: unknown, ttlMs: number): void {
  memoryCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

function getStale<T>(key: string): T | null {
  const hit = staleCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    staleCache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setStale(key: string, data: unknown, ttlMs: number): void {
  staleCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

function normalizeDays(days: number): number {
  if (days <= 90) return days;
  if (days <= 365) return 365;
  if (days <= 1825) return 1825;
  if (days <= 3650) return 3650;
  if (days <= 7300) return 7300;
  return 18250;
}

function trimSeriesToDays(series: XYPoint[], days: number): XYPoint[] {
  if (!series.length) return series;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = series.filter((p) => p.x >= since);
  return filtered.length >= 2 ? filtered : series;
}

async function requestJson(url: string, opts: RequestJsonOptions = {}): Promise<any> {
  const inflightHit = inflight.get(url);
  if (inflightHit) return inflightHit;

  async function waitForCoinGeckoSlot(): Promise<void> {
    coinGeckoGate = coinGeckoGate.then(async () => {
      const elapsed = Date.now() - lastCoinGeckoRequestAt;
      const waitMs = Math.max(0, COINGECKO_MIN_REQUEST_GAP_MS - elapsed);
      if (waitMs > 0) await sleep(waitMs);
      lastCoinGeckoRequestAt = Date.now();
    });
    await coinGeckoGate;
  }

  const run = (async () => {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      await waitForCoinGeckoSlot();
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });

      if (res.ok) {
        const json = await res.json();
        if (opts.staleKey) {
          setStale(opts.staleKey, json, opts.staleTtlMs ?? 10 * 60_000);
        }
        return json;
      }

      const retryAfterSeconds = Number(res.headers.get("retry-after") ?? "0") || 0;
      const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < retries;

      if (!shouldRetry) {
        if (opts.staleKey) {
          const stale = getStale<any>(opts.staleKey);
          if (stale) return stale;
        }
        throw new Error(`CoinGecko error: ${res.status}`);
      }

      const backoffMs = retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await sleep(backoffMs);
    } catch (err) {
      const shouldRetry = attempt < retries;
      if (!shouldRetry) {
        if (opts.staleKey) {
          const stale = getStale<any>(opts.staleKey);
          if (stale) return stale;
        }
        throw err instanceof Error ? err : new Error("Unknown network error");
      }
      await sleep(500 * Math.pow(2, attempt));
    } finally {
      clearTimeout(t);
    }
  }

  throw new Error("CoinGecko request exhausted retries");
  })();

  inflight.set(url, run);
  try {
    return await run;
  } finally {
    inflight.delete(url);
  }
}

export async function fetchCoinGeckoMarketChart(opts: {
  coinId: string;
  vsCurrency: string;
  days: number;
  metric?: "prices" | "market_caps" | "total_volumes";
}): Promise<XYPoint[]> {
  const bucketDays = normalizeDays(opts.days);
  const url =
    `${COINGECKO_BASE}/coins/${encodeURIComponent(opts.coinId)}/market_chart` +
    `?vs_currency=${encodeURIComponent(opts.vsCurrency)}` +
    `&days=${encodeURIComponent(String(bucketDays))}`;

  const cacheKey = `market_chart:${opts.coinId}:${opts.vsCurrency}:${bucketDays}`;
  const fresh = getCached<any>(cacheKey);
  const stale = getStale<any>(cacheKey);
  const json =
    fresh ??
    (await requestJson(url, {
      retries: 2,
      timeoutMs: 12000,
      staleKey: cacheKey,
      staleTtlMs: 15 * 60_000,
    }).catch(() => stale));

  if (!json) throw new Error("CoinGecko data unavailable");
  setCached(cacheKey, json, 3 * 60_000);
  const seriesKey = opts.metric ?? "prices";
  const mapped = (json[seriesKey] ?? [])
    .map((p: any) => ({ x: Number(p[0]), y: Number(p[1]) }))
    .filter((p: XYPoint) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a: XYPoint, b: XYPoint) => a.x - b.x);
  return trimSeriesToDays(mapped, opts.days);
}

export type CoinMarket = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap_rank: number | null;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency: number | null;
  last_updated: string;
};

export async function fetchCoinGeckoMarkets(opts: {
  ids: string[];
  vsCurrency: "usd" | "eur";
  useCache?: boolean;
  cacheTtlMs?: number;
}): Promise<CoinMarket[]> {
  const ids = opts.ids.map((id) => id.trim()).filter(Boolean);
  const cacheKey = `markets:${opts.vsCurrency}:${ids.join(",")}`;
  const cacheTtlMs = opts.cacheTtlMs ?? 60_000;

  if (opts.useCache !== false) {
    const cached = getCached<CoinMarket[]>(cacheKey);
    if (cached) return cached;
  }

  const url =
    `${COINGECKO_BASE}/coins/markets?vs_currency=${opts.vsCurrency}` +
    `&ids=${encodeURIComponent(ids.join(","))}` +
    "&order=market_cap_desc&sparkline=false" +
    "&price_change_percentage=1h,24h,7d";

  const json = await requestJson(url, {
    retries: 2,
    timeoutMs: 12000,
    staleKey: cacheKey,
    staleTtlMs: 15 * 60_000,
  });
  const rows = Array.isArray(json) ? (json as CoinMarket[]) : [];

  if (opts.useCache !== false) {
    setCached(cacheKey, rows, cacheTtlMs);
  }

  return rows;
}

export async function fetchCoinGeckoTopMarkets(opts: {
  vsCurrency: "usd" | "eur";
  page?: number;
  perPage?: number;
  useCache?: boolean;
  cacheTtlMs?: number;
}): Promise<CoinMarket[]> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(250, Math.max(1, opts.perPage ?? 100));
  const cacheKey = `top_markets:${opts.vsCurrency}:${page}:${perPage}`;
  const cacheTtlMs = opts.cacheTtlMs ?? 90_000;

  if (opts.useCache !== false) {
    const cached = getCached<CoinMarket[]>(cacheKey);
    if (cached) return cached;
  }

  const url =
    `${COINGECKO_BASE}/coins/markets?vs_currency=${opts.vsCurrency}` +
    `&order=market_cap_desc&per_page=${perPage}&page=${page}` +
    "&sparkline=false&price_change_percentage=1h,24h,7d";

  const json = await requestJson(url, {
    retries: 2,
    timeoutMs: 12000,
    staleKey: cacheKey,
    staleTtlMs: 20 * 60_000,
  });
  const rows = Array.isArray(json) ? (json as CoinMarket[]) : [];
  if (opts.useCache !== false) setCached(cacheKey, rows, cacheTtlMs);
  return rows;
}
