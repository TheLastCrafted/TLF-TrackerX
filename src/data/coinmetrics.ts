import { fetchWithWebProxy } from "./web-proxy";

export type XYPoint = { x: number; y: number };

type FetchMetricOptions = {
  asset: string;
  metric: string;
  days: number;
  frequency?: "1d";
};

type CoinMetricsResponse = {
  data?: Record<string, string>[];
  next_page_url?: string;
};

const BASE_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const CACHE_TTL_MS = 6 * 60_000;
const PAGE_SIZE = 10_000;
const MAX_PAGES = 16;
const memoryCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const inflight = new Map<string, Promise<XYPoint[]>>();

function trimSeriesToDays(series: XYPoint[], days: number): XYPoint[] {
  if (!series.length) return [];
  const since = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000;
  const filtered = series.filter((row) => row.x >= since);
  if (filtered.length >= 2) return filtered;
  return series;
}

function buildStartTime(days: number): string {
  const ts = Date.now() - Math.max(1, days + 40) * 24 * 60 * 60 * 1000;
  return new Date(ts).toISOString();
}

function normalizePoints(points: XYPoint[]): XYPoint[] {
  return points
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort((a, b) => a.x - b.x);
}

export async function fetchCoinMetricsAssetMetricSeries(opts: FetchMetricOptions): Promise<XYPoint[]> {
  const asset = opts.asset.trim().toLowerCase();
  const metric = opts.metric.trim();
  const days = Math.max(1, Math.floor(opts.days));
  if (!asset || !metric) return [];
  const frequency = opts.frequency ?? "1d";
  const cacheKey = `${asset}:${metric}:${frequency}:${days}`;

  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
    const out: XYPoint[] = [];
    let pageUrl =
      `${BASE_URL}?assets=${encodeURIComponent(asset)}` +
      `&metrics=${encodeURIComponent(metric)}` +
      `&frequency=${encodeURIComponent(frequency)}` +
      `&start_time=${encodeURIComponent(buildStartTime(days))}` +
      `&page_size=${PAGE_SIZE}`;

    for (let page = 0; page < MAX_PAGES && pageUrl; page += 1) {
      let res: Response;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        res = await fetchWithWebProxy(pageUrl, {
          headers: { Accept: "application/json" },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
      } catch {
        break;
      }
      if (!res.ok) break;

      let json: CoinMetricsResponse;
      try {
        json = (await res.json()) as CoinMetricsResponse;
      } catch {
        break;
      }
      const rows = Array.isArray(json?.data) ? json.data : [];
      for (const row of rows) {
        const x = Date.parse(String(row?.time ?? ""));
        const y = Number(row?.[metric]);
        if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
      }
      pageUrl = json?.next_page_url ? String(json.next_page_url) : "";
    }

    const normalized = trimSeriesToDays(normalizePoints(out), days);
    memoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: normalized });
    return normalized;
  })();

  inflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(cacheKey);
  }
}
