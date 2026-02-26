import { TRACKED_COINS } from "../catalog/coins";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { fetchWithWebProxy } from "./web-proxy";
export type XYPoint = { x: number; y: number };

type RequestJsonOptions = {
  retries?: number;
  timeoutMs?: number;
  staleKey?: string;
  staleTtlMs?: number;
};

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const DEFAULT_TIMEOUT_MS = 4500;
const COINGECKO_MIN_REQUEST_GAP_MS = 250;

const memoryCache = new Map<string, { expiresAt: number; data: unknown }>();
const staleCache = new Map<string, { expiresAt: number; data: unknown }>();
const inflight = new Map<string, Promise<any>>();
let lastCoinGeckoRequestAt = 0;
let coinGeckoGate: Promise<void> = Promise.resolve();
const knownBySymbol = new Map<string, string>(TRACKED_COINS.map((coin) => [coin.symbol.toUpperCase(), coin.id]));
const knownMetaById: Record<string, { symbol: string; name: string }> = Object.fromEntries(
  TRACKED_COINS.map((coin) => [coin.id, { symbol: coin.symbol, name: coin.name }])
);
let coinsListLoaded = false;
const COINGECKO_STALE_PERSIST_KEY = "coingecko_stale_cache_v1";
let staleHydrated = false;
let staleHydrating: Promise<void> | null = null;
let stalePersistTimer: ReturnType<typeof setTimeout> | null = null;

type CoinListRow = { id: string; symbol: string; name: string };

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
  schedulePersistStale();
}

function shouldPersistStaleKey(key: string): boolean {
  return (
    key.startsWith("markets:") ||
    key.startsWith("top_markets:") ||
    key.startsWith("simple_prices:") ||
    key.startsWith("market_chart:")
  );
}

async function hydratePersistedStale(): Promise<void> {
  if (staleHydrated) return;
  if (staleHydrating) return staleHydrating;
  staleHydrating = (async () => {
    const persisted = await loadPersistedJson<{ key: string; expiresAt: number; data: unknown }[]>(
      COINGECKO_STALE_PERSIST_KEY,
      []
    );
    const now = Date.now();
    for (const row of persisted) {
      if (!row?.key || typeof row.expiresAt !== "number" || row.expiresAt <= now) continue;
      staleCache.set(row.key, { expiresAt: row.expiresAt, data: row.data });
    }
    staleHydrated = true;
    staleHydrating = null;
  })();
  return staleHydrating;
}

function schedulePersistStale(): void {
  if (stalePersistTimer) return;
  stalePersistTimer = setTimeout(() => {
    stalePersistTimer = null;
    const now = Date.now();
    const payload: { key: string; expiresAt: number; data: unknown }[] = [];
    for (const [key, value] of staleCache.entries()) {
      if (value.expiresAt <= now) continue;
      if (!shouldPersistStaleKey(key)) continue;
      payload.push({ key, expiresAt: value.expiresAt, data: value.data });
      if (payload.length >= 90) break;
    }
    void savePersistedJson(COINGECKO_STALE_PERSIST_KEY, payload);
  }, 300);
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

async function requestJson(url: string, opts: RequestJsonOptions = {}): Promise<any | null> {
  await hydratePersistedStale();
  const inflightHit = inflight.get(url);
  if (inflightHit) return inflightHit;
  const stale = opts.staleKey ? getStale<any>(opts.staleKey) : null;

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
  const retries = opts.retries ?? 1;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      await waitForCoinGeckoSlot();
      const res = await fetchWithWebProxy(url, {
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
        if (stale) return stale;
        console.warn(`[coingecko] request failed (${res.status}) for ${url}`);
        return null;
      }

      // Fast-path for rate limits/transient outages:
      // return stale immediately so UI stays responsive.
      if (stale) return stale;

      const backoffMs = retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await sleep(backoffMs);
    } catch (err) {
      const shouldRetry = attempt < retries;
      if (stale) return stale;
      if (!shouldRetry) {
        console.warn("[coingecko] request exception", err);
        return null;
      }
      await sleep(500 * Math.pow(2, attempt));
    } finally {
      clearTimeout(t);
    }
  }

  if (stale) return stale;
  console.warn(`[coingecko] request exhausted retries for ${url}`);
  return null;
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
    })) ??
    stale;

  if (!json) return [];
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

export type CoinSimplePrice = {
  current_price?: number;
  market_cap?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
};

function buildFallbackMarketsFromSimple(
  ids: string[],
  simple: Record<string, CoinSimplePrice>,
  metaById: Record<string, { symbol: string; name: string }>
): CoinMarket[] {
  const nowIso = new Date().toISOString();
  const mapped: (CoinMarket | null)[] = ids.map((id, idx) => {
    const row = simple[id];
    if (!row) return null;
    const meta = metaById[id] ?? { symbol: id.slice(0, 8).toUpperCase(), name: id };
    return {
      id,
      symbol: meta.symbol.toLowerCase(),
      name: meta.name,
      current_price: Number(row.current_price ?? NaN),
      market_cap_rank: idx + 1,
      market_cap: Number(row.market_cap ?? 0),
      total_volume: Number(row.total_volume ?? 0),
      high_24h: Number(row.current_price ?? NaN),
      low_24h: Number(row.current_price ?? NaN),
      price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h: Number.isFinite(Number(row.price_change_percentage_24h))
        ? Number(row.price_change_percentage_24h)
        : null,
      price_change_percentage_7d_in_currency: null,
      last_updated: nowIso,
    };
  });
  return mapped.filter((row): row is CoinMarket => !!row && Number.isFinite(row.current_price));
}

async function fetchBinanceSimpleFallback(ids: string[]): Promise<Record<string, CoinSimplePrice>> {
  const pairToId = new Map<string, string>();
  const pairs: string[] = [];
  for (const id of ids) {
    const meta = knownMetaById[id];
    const symbol = String(meta?.symbol ?? "").toUpperCase();
    if (!symbol) continue;
    const pair = `${symbol}USDT`;
    if (!pairToId.has(pair)) {
      pairToId.set(pair, id);
      pairs.push(pair);
    }
  }
  if (!pairs.length) return {};

  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return {};
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [];
    const out: Record<string, CoinSimplePrice> = {};
    for (const row of rows) {
      const pair = String(row?.symbol ?? "");
      const id = pairToId.get(pair);
      if (!id) continue;
      const price = Number(row?.lastPrice);
      const change = Number(row?.priceChangePercent);
      const volume = Number(row?.quoteVolume);
      out[id] = {
        current_price: Number.isFinite(price) ? price : undefined,
        total_volume: Number.isFinite(volume) ? volume : undefined,
        price_change_percentage_24h: Number.isFinite(change) ? change : undefined,
      };
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCoinGeckoMarkets(opts: {
  ids: string[];
  vsCurrency: "usd" | "eur";
  useCache?: boolean;
  cacheTtlMs?: number;
}): Promise<CoinMarket[]> {
  const ids = opts.ids.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return [];
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
  if (rows.length) return rows;

  const simple = await fetchCoinGeckoSimplePrices({
    ids,
    vsCurrency: opts.vsCurrency,
    useCache: true,
    cacheTtlMs: Math.min(cacheTtlMs, 20_000),
  });
  const fallbackRows = buildFallbackMarketsFromSimple(ids, simple, knownMetaById);
  if (fallbackRows.length) {
    setCached(cacheKey, fallbackRows, Math.min(cacheTtlMs, 20_000));
    return fallbackRows;
  }

  const binanceSimple = await fetchBinanceSimpleFallback(ids);
  const binanceRows = buildFallbackMarketsFromSimple(ids, binanceSimple, knownMetaById);
  if (binanceRows.length) {
    setCached(cacheKey, binanceRows, Math.min(cacheTtlMs, 12_000));
    return binanceRows;
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
  if (rows.length) {
    if (opts.useCache !== false) setCached(cacheKey, rows, cacheTtlMs);
    return rows;
  }

  const fallbackIds = TRACKED_COINS.slice(0, perPage).map((coin) => coin.id);
  const fallback = await fetchCoinGeckoMarkets({
    ids: fallbackIds,
    vsCurrency: opts.vsCurrency,
    useCache: true,
    cacheTtlMs: Math.min(cacheTtlMs, 20_000),
  });
  if (fallback.length && opts.useCache !== false) setCached(cacheKey, fallback, Math.min(cacheTtlMs, 20_000));
  return fallback;
}

export async function fetchCoinGeckoSimplePrices(opts: {
  ids: string[];
  vsCurrency: "usd" | "eur";
  useCache?: boolean;
  cacheTtlMs?: number;
}): Promise<Record<string, CoinSimplePrice>> {
  const ids = opts.ids.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return {};
  const cacheKey = `simple_prices:${opts.vsCurrency}:${ids.join(",")}`;
  const cacheTtlMs = opts.cacheTtlMs ?? 12_000;

  if (opts.useCache !== false) {
    const cached = getCached<Record<string, CoinSimplePrice>>(cacheKey);
    if (cached) return cached;
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
  const merged: Record<string, CoinSimplePrice> = {};

  await Promise.all(
    chunks.map(async (chunkIds) => {
      const url =
        `${COINGECKO_BASE}/simple/price?vs_currencies=${encodeURIComponent(opts.vsCurrency)}` +
        `&ids=${encodeURIComponent(chunkIds.join(","))}` +
        "&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
      const json = await requestJson(url, {
        retries: 1,
        timeoutMs: 6000,
        staleKey: `${cacheKey}:${chunkIds.join(",")}`,
        staleTtlMs: 10 * 60_000,
      });
      if (!json || typeof json !== "object") return;
      for (const id of chunkIds) {
        const row = (json as any)[id];
        if (!row || typeof row !== "object") continue;
        const p = Number(row[opts.vsCurrency]);
        const mc = Number(row[`${opts.vsCurrency}_market_cap`]);
        const vol = Number(row[`${opts.vsCurrency}_24h_vol`]);
        const ch24 = Number(row[`${opts.vsCurrency}_24h_change`]);
        merged[id] = {
          current_price: Number.isFinite(p) ? p : undefined,
          market_cap: Number.isFinite(mc) ? mc : undefined,
          total_volume: Number.isFinite(vol) ? vol : undefined,
          price_change_percentage_24h: Number.isFinite(ch24) ? ch24 : undefined,
        };
      }
    })
  );

  if (!Object.keys(merged).length) {
    const fallback = await fetchBinanceSimpleFallback(ids);
    for (const [id, row] of Object.entries(fallback)) merged[id] = row;
  }

  if (opts.useCache !== false) setCached(cacheKey, merged, cacheTtlMs);
  return merged;
}

async function ensureCoinsList(): Promise<void> {
  if (coinsListLoaded) return;
  const cacheKey = "coins:list";
  const cached = getCached<CoinListRow[]>(cacheKey) ?? getStale<CoinListRow[]>(cacheKey);
  if (cached?.length) {
    for (const row of cached) {
      const symbol = String(row.symbol ?? "").toUpperCase();
      const id = String(row.id ?? "");
      if (symbol && id && !knownBySymbol.has(symbol)) knownBySymbol.set(symbol, id);
    }
    coinsListLoaded = true;
    return;
  }

  const url = `${COINGECKO_BASE}/coins/list?include_platform=false`;
  const json = await requestJson(url, { retries: 1, timeoutMs: 12000, staleKey: cacheKey, staleTtlMs: 24 * 60 * 60_000 });
  if (!Array.isArray(json)) return;
  const rows = (json as CoinListRow[]).filter((row) => row?.id && row?.symbol);
  setCached(cacheKey, rows, 24 * 60 * 60_000);
  for (const row of rows) {
    const symbol = String(row.symbol ?? "").toUpperCase();
    const id = String(row.id ?? "");
    if (symbol && id && !knownBySymbol.has(symbol)) knownBySymbol.set(symbol, id);
  }
  coinsListLoaded = true;
}

export async function resolveCoinGeckoIdBySymbol(
  symbol: string,
  nameHint?: string,
  opts?: { allowListFallback?: boolean }
): Promise<string | null> {
  const s = symbol.trim().toUpperCase();
  if (!s) return null;
  const direct = knownBySymbol.get(s);
  if (direct) return direct;

  const q = `${s} ${nameHint ?? ""}`.trim();
  const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(q)}`;
  const json = await requestJson(url, { retries: 1, timeoutMs: 9000 });
  const coins = Array.isArray(json?.coins) ? (json.coins as any[]) : [];
  const exact = coins.find((row) => String(row?.symbol ?? "").toUpperCase() === s);
  const first = exact ?? coins[0];
  const id = String(first?.id ?? "");
  if (id) {
    knownBySymbol.set(s, id);
    return id;
  }

  if (opts?.allowListFallback) {
    await ensureCoinsList();
    const listed = knownBySymbol.get(s);
    if (listed) return listed;
  }
  return null;
}
