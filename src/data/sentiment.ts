import { fetchWithWebProxy } from "./web-proxy";

export type XYPoint = { x: number; y: number };

type FearGreedResponse = {
  data?: {
    value?: string;
    timestamp?: string;
  }[];
};

const URL = "https://api.alternative.me/fng/?limit=0&format=json";
const memoryCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const staleCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();

function limitDays(points: XYPoint[], days: number): XYPoint[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = points.filter((point) => point.x >= since);
  return filtered.length >= 2 ? filtered : points;
}

export async function fetchFearGreedSeries(days: number): Promise<XYPoint[]> {
  const cacheKey = `fear_greed:${days}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const stale = staleCache.get(cacheKey);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5500);
    const res = await fetchWithWebProxy(URL, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return stale?.data ?? [];
    const json = (await res.json()) as FearGreedResponse;
    const rows = Array.isArray(json?.data) ? json.data : [];
    const points = rows
      .map((row) => ({ x: Number(row?.timestamp) * 1000, y: Number(row?.value) }))
      .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
      .sort((a, b) => a.x - b.x);
    const finalRows = limitDays(points, days);
    memoryCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, data: finalRows });
    staleCache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60_000, data: finalRows });
    return finalRows;
  } catch {
    return stale?.data ?? [];
  }
}

