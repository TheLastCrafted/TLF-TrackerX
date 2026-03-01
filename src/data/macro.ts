import { fetchWithWebProxy } from "./web-proxy";

export type XYPoint = { x: number; y: number };

type FREDSeriesOptions = {
  seriesId: string;
  days?: number;
  useCache?: boolean;
  cacheTtlMs?: number;
};

const FRED_GRAPH_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const STOOQ_DAILY_CSV = "https://stooq.com/q/d/l/";
const memoryCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const staleCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const inflight = new Map<string, Promise<XYPoint[]>>();

type SeriesFallbackRule = {
  seriesId?: string;
  stooqSymbol?: string;
  transform?: (point: XYPoint) => XYPoint | null;
};

const FRED_SERIES_FALLBACKS: Record<string, SeriesFallbackRule> = {
  SLUEM1524QEZS: { seriesId: "LRUN24TTEZA156S" },
  PRINTO01EZM661N: { seriesId: "EA19PRINTO01IXOBSAM" },
  PRCNTO01EZM661N: { seriesId: "EA19PRCNTO01IXOBSAM" },
  SBOITOTLUSQ163N: { seriesId: "BSCICP03USM665S" },
  JTU480099UPL: { seriesId: "JTSLDL" },
  NAPM: { seriesId: "IPMAN" },
  NAPMS: { seriesId: "CSCICP03USM665S" },
  SP500DY: { seriesId: "M1346AUSM156NNBR" },
  SP500PE: {
    seriesId: "A13049USA156NNBR",
    // A13049... is earnings yield (%); convert to PE multiple.
    transform: (point) => (point.y === 0 ? null : { ...point, y: 100 / point.y }),
  },
  WILL5000INDFC: { seriesId: "NASDAQNQUS500LCT" },
  WILLMIDCAP: { seriesId: "NASDAQNQUSS" },
  GOLDAMGBD228NLBM: { stooqSymbol: "xauusd" },
  SLVPRUSD: { stooqSymbol: "xagusd" },
};

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

function parseStooqCsv(csv: string): XYPoint[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const points: XYPoint[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    const dateStr = cols[0]?.trim();
    const closeStr = cols[4]?.trim();
    if (!dateStr || !closeStr || closeStr.toLowerCase() === "no data") continue;
    const x = new Date(dateStr).getTime();
    const y = Number(closeStr);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  points.sort((a, b) => a.x - b.x);
  return points;
}

function applySeriesFallbackTransform(points: XYPoint[], rule: SeriesFallbackRule | undefined): XYPoint[] {
  if (!rule?.transform) return points;
  return points
    .map((point) => rule.transform?.(point) ?? null)
    .filter((point): point is XYPoint => !!point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

export async function fetchFredSeries(opts: FREDSeriesOptions): Promise<XYPoint[]> {
  const fallbackRule = FRED_SERIES_FALLBACKS[opts.seriesId];
  const resolvedKey = fallbackRule?.stooqSymbol
    ? `stooq:${fallbackRule.stooqSymbol}`
    : `fred:${fallbackRule?.seriesId ?? opts.seriesId}`;
  const cacheKey = `${opts.seriesId}:${resolvedKey}:${opts.days ?? 0}`;
  const shouldUseCache = opts.useCache !== false;
  const cached = shouldUseCache ? getCached(cacheKey) : null;
  if (cached) return cached;
  const stale = getStale(cacheKey);
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const ttlMs = Math.max(15_000, opts.cacheTtlMs ?? 6 * 60_000);

  const run = (async () => {
  try {
    const resolvedSeriesId = fallbackRule?.seriesId ?? opts.seriesId;
    let all: XYPoint[] = [];

    if (fallbackRule?.stooqSymbol) {
      const url = `${STOOQ_DAILY_CSV}?s=${encodeURIComponent(fallbackRule.stooqSymbol)}&i=d`;
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
        console.warn(`[macro] Stooq ${fallbackRule.stooqSymbol} unavailable (${res.status})`);
        return stale ?? getCached(cacheKey) ?? [];
      }

      const csv = await res.text();
      all = parseStooqCsv(csv);
    } else {
      const url = `${FRED_GRAPH_CSV}?id=${encodeURIComponent(resolvedSeriesId)}`;
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
      all = parseFredCsv(csv);
    }
    const transformed = applySeriesFallbackTransform(all, fallbackRule);

    if (!opts.days || opts.days <= 0) {
      memoryCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, data: transformed });
      staleCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60_000, data: transformed });
      return transformed;
    }

    const since = Date.now() - opts.days * 24 * 60 * 60 * 1000;
    const filtered = transformed.filter((p) => p.x >= since);
    const finalRows = filtered.length >= 2 ? filtered : transformed;
    memoryCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, data: finalRows });
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
