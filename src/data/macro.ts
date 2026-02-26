import { fetchWithWebProxy } from "./web-proxy";

export type XYPoint = { x: number; y: number };

type FREDSeriesOptions = {
  seriesId: string;
  days?: number;
};

const FRED_GRAPH_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";
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

function parseFredCsv(csv: string): XYPoint[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const points: XYPoint[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const commaIndex = line.indexOf(",");
    if (commaIndex < 0) continue;

    const dateStr = line.slice(0, commaIndex).trim();
    const valueStr = line.slice(commaIndex + 1).trim();

    if (!dateStr || !valueStr || valueStr === ".") continue;

    const x = new Date(dateStr).getTime();
    const y = Number(valueStr);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  points.sort((a, b) => a.x - b.x);
  return points;
}

export async function fetchFredSeries(opts: FREDSeriesOptions): Promise<XYPoint[]> {
  const cacheKey = `${opts.seriesId}:${opts.days ?? 0}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const stale = getStale(cacheKey);
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
  try {
    const url = `${FRED_GRAPH_CSV}?id=${encodeURIComponent(opts.seriesId)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5500);
    const res = await fetchWithWebProxy(url, {
      headers: {
        Accept: "text/csv",
        "Cache-Control": "no-cache",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[macro] FRED ${opts.seriesId} unavailable (${res.status})`);
      return stale ?? getCached(cacheKey) ?? [];
    }
    const csv = await res.text();
    const all = parseFredCsv(csv);

    if (!opts.days || opts.days <= 0) {
      memoryCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60_000, data: all });
      staleCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60_000, data: all });
      return all;
    }

    const since = Date.now() - opts.days * 24 * 60 * 60 * 1000;
    const filtered = all.filter((p) => p.x >= since);
    const finalRows = filtered.length >= 2 ? filtered : all;
    memoryCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60_000, data: finalRows });
    staleCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60_000, data: finalRows });
    return finalRows;
  } catch (error) {
    console.warn(`[macro] FRED ${opts.seriesId} fetch failed`, error);
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
