import { fetchWithWebProxy } from "./web-proxy";

export type XYPoint = { x: number; y: number };

type BlockchainChartOptions = {
  key: "transaction-fees" | "transaction-fees-usd";
  days?: number;
  useCache?: boolean;
  cacheTtlMs?: number;
};

type BlockchainChartResponse = {
  status?: string;
  unit?: string;
  values?: { x?: number; y?: number }[];
};

const BASE = "https://api.blockchain.info/charts";
const memoryCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const staleCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const inflight = new Map<string, Promise<XYPoint[]>>();

function getCached(key: string): XYPoint[] | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return hit.data;
}

function getStale(key: string): XYPoint[] | null {
  const hit = staleCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    staleCache.delete(key);
    return null;
  }
  return hit.data;
}

function limitDays(points: XYPoint[], days: number | undefined): XYPoint[] {
  if (!days || days <= 0) return points;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = points.filter((point) => point.x >= since);
  return filtered.length >= 2 ? filtered : points;
}

function parseChartResponse(json: BlockchainChartResponse): XYPoint[] {
  const rows = Array.isArray(json?.values) ? json.values : [];
  const points = rows
    .map((row) => ({ x: Number(row?.x) * 1000, y: Number(row?.y) }))
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort((a, b) => a.x - b.x);
  return points;
}

export async function fetchBlockchainChartSeries(opts: BlockchainChartOptions): Promise<XYPoint[]> {
  const cacheKey = `${opts.key}:${opts.days ?? 0}`;
  const shouldUseCache = opts.useCache !== false;
  const cached = shouldUseCache ? getCached(cacheKey) : null;
  if (cached) return cached;
  const stale = getStale(cacheKey);
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const ttlMs = Math.max(20_000, opts.cacheTtlMs ?? 6 * 60_000);

  const run = (async () => {
    try {
      const url = `${BASE}/${opts.key}?timespan=all&sampled=false&metadata=false&format=json`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6500);
      const res = await fetchWithWebProxy(url, {
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        return stale ?? getCached(cacheKey) ?? [];
      }
      const json = (await res.json()) as BlockchainChartResponse;
      const all = parseChartResponse(json);
      const finalRows = limitDays(all, opts.days);
      memoryCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, data: finalRows });
      staleCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60_000, data: finalRows });
      return finalRows;
    } catch {
      return stale ?? getCached(cacheKey) ?? [];
    }
  })();

  inflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(cacheKey);
  }
}

