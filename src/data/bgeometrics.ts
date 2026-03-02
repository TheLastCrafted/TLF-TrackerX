import { fetchWithWebProxy } from "./web-proxy";
import { fetchCoinMetricsAssetMetricSeries } from "./coinmetrics";

export type XYPoint = { x: number; y: number };

const FILE_BASE = "https://charts.bgeometrics.com/files";
const CACHE_TTL_MS = 8 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MVRV_GRAPHICS_URL = "https://charts.bgeometrics.com/graphics/mvrv_dark.html";
const MVRV_RISK_LOW_Z = -0.7;
const MVRV_RISK_HIGH_Z = 6;
const RISK_BAND_SCORE_BREAKS = [20, 40, 60, 80];

const fileCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const fileInflight = new Map<string, Promise<XYPoint[]>>();
const fredCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const fredInflight = new Map<string, Promise<XYPoint[]>>();
const inlineArrayCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const inlineArrayInflight = new Map<string, Promise<XYPoint[]>>();

function limitToTimeframe(series: XYPoint[], timeframeDays: number): XYPoint[] {
  if (!series.length) return [];
  const since = Date.now() - Math.max(1, timeframeDays) * 24 * 60 * 60 * 1000;
  const filtered = series.filter((row) => row.x >= since);
  if (filtered.length >= 2) return filtered;
  return series;
}

function normalizeJsonSeries(payload: unknown, yIndex = 1): XYPoint[] {
  if (!Array.isArray(payload)) return [];
  const out: XYPoint[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < Math.max(2, yIndex + 1)) continue;
    const x = Number(row[0]);
    const y = Number(row[yIndex]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x, y });
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripFuturePoints(series: XYPoint[], allowedFutureMs = ONE_DAY_MS): XYPoint[] {
  if (!series.length) return [];
  const cutoff = Date.now() + Math.max(0, allowedFutureMs);
  const rows = series.filter((row) => row.x <= cutoff);
  return rows.length >= 2 ? rows : series;
}

async function fetchInlineArraySeries(
  url: string,
  variableName: string,
  yIndex = 1
): Promise<XYPoint[]> {
  const key = `${url}::${variableName}::${yIndex}`;
  const cached = inlineArrayCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const inflight = inlineArrayInflight.get(key);
  if (inflight) return inflight;

  const run = (async () => {
    try {
      const res = await fetchWithWebProxy(url, {
        headers: { Accept: "text/html" },
      });
      if (!res.ok) return [];
      const html = await res.text();
      const re = new RegExp(
        `const\\s+${escapeRegExp(variableName)}\\s*=\\s*(\\[[\\s\\S]*?\\]);`
      );
      const match = html.match(re);
      if (!match?.[1]) return [];
      const payload = JSON.parse(match[1]);
      const series = stripFuturePoints(normalizeJsonSeries(payload, yIndex));
      inlineArrayCache.set(key, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: series,
      });
      return series;
    } catch {
      return [];
    }
  })();

  inlineArrayInflight.set(key, run);
  try {
    return await run;
  } finally {
    inlineArrayInflight.delete(key);
  }
}

async function fetchBgeometricsFileSeries(fileName: string, yIndex = 1): Promise<XYPoint[]> {
  const key = fileName.trim();
  if (!key) return [];
  const cacheKey = `${key}@${yIndex}`;
  const cached = fileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const inflight = fileInflight.get(cacheKey);
  if (inflight) return inflight;

  const run = (async () => {
    const url = `${FILE_BASE}/${encodeURIComponent(key)}`;
    try {
      const res = await fetchWithWebProxy(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const series = normalizeJsonSeries(json, yIndex);
      fileCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: series });
      return series;
    } catch {
      return [];
    }
  })();

  fileInflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    fileInflight.delete(cacheKey);
  }
}

async function fetchFredSeriesById(seriesId: string): Promise<XYPoint[]> {
  const key = seriesId.trim().toUpperCase();
  if (!key) return [];
  const cached = fredCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const inflight = fredInflight.get(key);
  if (inflight) return inflight;

  const run = (async () => {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(key)}`;
    try {
      const res = await fetchWithWebProxy(url, {
        headers: { Accept: "text/csv" },
      });
      if (!res.ok) return [];
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const out: XYPoint[] = [];
      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        const comma = line.indexOf(",");
        if (comma < 0) continue;
        const date = line.slice(0, comma).trim();
        const value = line.slice(comma + 1).trim();
        if (!date || !value || value === ".") continue;
        const x = Date.parse(`${date}T00:00:00Z`);
        const y = Number(value);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        out.push({ x, y });
      }
      out.sort((a, b) => a.x - b.x);
      fredCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data: out });
      return out;
    } catch {
      return [];
    }
  })();

  fredInflight.set(key, run);
  try {
    return await run;
  } finally {
    fredInflight.delete(key);
  }
}

async function fetchFirstAvailableSeries(fileNames: string[]): Promise<XYPoint[]> {
  let fallback: XYPoint[] = [];
  for (const fileName of fileNames) {
    const rows = await fetchBgeometricsFileSeries(fileName);
    if (rows.length >= 2) return rows;
    if (!fallback.length && rows.length) fallback = rows;
  }
  return fallback;
}

export const PORTFOLIO_VALUE_RANGE_OPTIONS = [
  { id: "all", label: "All ranges" },
  { id: "btc_0_0_1", label: "0-0.1 BTC" },
  { id: "btc_0_1_1", label: "0.1-1 BTC" },
  { id: "btc_1_10", label: "1-10 BTC" },
  { id: "btc_10_100", label: "10-100 BTC" },
  { id: "btc_100_1k", label: "100-1K BTC" },
  { id: "btc_1k_10k", label: "1K-10K BTC" },
  { id: "btc_10k_100k", label: "10K-100K BTC" },
  { id: "btc_100k_1m", label: "100K-1M BTC" },
] as const;

export type PortfolioValueRangeId = (typeof PORTFOLIO_VALUE_RANGE_OPTIONS)[number]["id"];

const PORTFOLIO_RANGE_EMPTY: Record<PortfolioValueRangeId, number> = {
  all: 0,
  btc_0_0_1: 0,
  btc_0_1_1: 0,
  btc_1_10: 0,
  btc_10_100: 0,
  btc_100_1k: 0,
  btc_1k_10k: 0,
  btc_10k_100k: 0,
  btc_100k_1m: 0,
};

type PortfolioDistributionSnapshot = {
  x: number;
  values: Record<PortfolioValueRangeId, number>;
};

const PORTFOLIO_SOURCE_URL = "https://www.bitinfocharts.com/bitcoin-distribution-history.html";
const PORTFOLIO_CACHE_TTL_MS = 30 * 60_000;
let portfolioSnapshotsCache: { expiresAt: number; rows: PortfolioDistributionSnapshot[] } | null = null;
let portfolioSnapshotsInflight: Promise<PortfolioDistributionSnapshot[]> | null = null;

function parseBalanceRangeLabel(label: string): { lower: number; upper: number } | null {
  const normalized = label.replace(/[\[\]\(\),]/g, "").trim();
  const match = normalized.match(/^([0-9.]+)\s*-\s*([0-9.]+)$/);
  if (!match) return null;
  const lower = Number(match[1]);
  const upper = Number(match[2]);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return null;
  return { lower, upper };
}

function bucketForBalanceRange(bounds: { lower: number; upper: number }): PortfolioValueRangeId | null {
  const { lower, upper } = bounds;
  if (upper <= 0.1) return "btc_0_0_1";
  if (lower >= 0.1 && upper <= 1) return "btc_0_1_1";
  if (lower >= 1 && upper <= 10) return "btc_1_10";
  if (lower >= 10 && upper <= 100) return "btc_10_100";
  if (lower >= 100 && upper <= 1_000) return "btc_100_1k";
  if (lower >= 1_000 && upper <= 10_000) return "btc_1k_10k";
  if (lower >= 10_000 && upper <= 100_000) return "btc_10k_100k";
  if (lower >= 100_000 && upper <= 1_000_000) return "btc_100k_1m";
  return null;
}

async function fetchPortfolioDistributionSnapshots(): Promise<PortfolioDistributionSnapshot[]> {
  if (portfolioSnapshotsCache && portfolioSnapshotsCache.expiresAt > Date.now()) {
    return portfolioSnapshotsCache.rows;
  }
  if (portfolioSnapshotsInflight) return portfolioSnapshotsInflight;

  const run = (async () => {
    const res = await fetchWithWebProxy(PORTFOLIO_SOURCE_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const tableRegex = /<table[^>]*class=\"table table-condensed bb\"[^>]*>([\s\S]*?)<\/table>/g;
    const snapshots: PortfolioDistributionSnapshot[] = [];
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1] ?? "";
      const captionMatch = tableHtml.match(/<caption>(\d{4}-\d{2}-\d{2})<\/caption>/);
      if (!captionMatch) continue;
      const x = Date.parse(`${captionMatch[1]}T00:00:00Z`);
      if (!Number.isFinite(x)) continue;

      const values: Record<PortfolioValueRangeId, number> = { ...PORTFOLIO_RANGE_EMPTY };
      const rowRegex = /<tr><td>([^<]+)<\/td><td[^>]*data-val='([^']+)'/g;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rangeLabel = String(rowMatch[1] ?? "").trim();
        const count = Number(String(rowMatch[2] ?? "").replace(/,/g, ""));
        if (!Number.isFinite(count) || count < 0) continue;
        values.all += count;
        const bounds = parseBalanceRangeLabel(rangeLabel);
        if (!bounds) continue;
        const bucket = bucketForBalanceRange(bounds);
        if (!bucket) continue;
        values[bucket] += count;
      }

      if (values.all > 0) snapshots.push({ x, values });
    }

    snapshots.sort((a, b) => a.x - b.x);
    portfolioSnapshotsCache = {
      expiresAt: Date.now() + PORTFOLIO_CACHE_TTL_MS,
      rows: snapshots,
    };
    return snapshots;
  })();

  portfolioSnapshotsInflight = run;
  try {
    return await run;
  } finally {
    portfolioSnapshotsInflight = null;
  }
}

export async function fetchPortfolioValueRangeSeries(
  rangeId: PortfolioValueRangeId,
  timeframeDays: number
): Promise<XYPoint[]> {
  const normalizedRange: PortfolioValueRangeId =
    PORTFOLIO_VALUE_RANGE_OPTIONS.find((row) => row.id === rangeId)?.id ?? "all";
  const snapshots = await fetchPortfolioDistributionSnapshots();
  const rows = snapshots
    .map((row) => ({ x: row.x, y: row.values[normalizedRange] ?? 0 }))
    .filter((row) => Number.isFinite(row.y) && row.y >= 0);
  return limitToTimeframe(rows, timeframeDays);
}

function alignSeriesWithCarry(left: XYPoint[], right: XYPoint[]): { x: number; left: number; right: number }[] {
  if (!left.length || !right.length) return [];
  const sortedLeft = [...left].sort((a, b) => a.x - b.x);
  const sortedRight = [...right].sort((a, b) => a.x - b.x);
  let rightIndex = 0;
  let activeRight = sortedRight[0].y;
  const out: { x: number; left: number; right: number }[] = [];
  for (const row of sortedLeft) {
    while (rightIndex + 1 < sortedRight.length && sortedRight[rightIndex + 1].x <= row.x) {
      rightIndex += 1;
      activeRight = sortedRight[rightIndex].y;
    }
    if (!Number.isFinite(activeRight)) continue;
    out.push({ x: row.x, left: row.y, right: activeRight });
  }
  return out;
}

function safeDivide(left: XYPoint[], right: XYPoint[]): XYPoint[] {
  return alignSeriesWithCarry(left, right)
    .map((row) => ({ x: row.x, y: row.right === 0 ? NaN : row.left / row.right }))
    .filter((row) => Number.isFinite(row.y));
}

function safeAdd(left: XYPoint[], right: XYPoint[]): XYPoint[] {
  return alignSeriesWithCarry(left, right)
    .map((row) => ({ x: row.x, y: row.left + row.right }))
    .filter((row) => Number.isFinite(row.y));
}

function safeSubtract(left: XYPoint[], right: XYPoint[]): XYPoint[] {
  return alignSeriesWithCarry(left, right)
    .map((row) => ({ x: row.x, y: row.left - row.right }))
    .filter((row) => Number.isFinite(row.y));
}

function safeMultiplyByScalar(series: XYPoint[], scalar: number): XYPoint[] {
  return series
    .map((row) => ({ x: row.x, y: row.y * scalar }))
    .filter((row) => Number.isFinite(row.y));
}

function inverse(series: XYPoint[]): XYPoint[] {
  return series
    .map((row) => ({ x: row.x, y: row.y === 0 ? NaN : 1 / row.y }))
    .filter((row) => Number.isFinite(row.y));
}

function cumulative(series: XYPoint[]): XYPoint[] {
  let running = 0;
  return series
    .map((row) => {
      running += row.y;
      return { x: row.x, y: running };
    })
    .filter((row) => Number.isFinite(row.y));
}

function dailyReturns(series: XYPoint[]): XYPoint[] {
  if (series.length < 2) return [];
  const out: XYPoint[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].y;
    if (!Number.isFinite(prev) || prev === 0) continue;
    const y = ((series[i].y / prev) - 1) * 100;
    if (!Number.isFinite(y)) continue;
    out.push({ x: series[i].x, y });
  }
  return out;
}

function daysSinceThresholdMove(returns: XYPoint[], kind: "gain" | "decline", thresholdPct: number): XYPoint[] {
  if (!returns.length) return [];
  const out: XYPoint[] = [];
  let days = 0;
  let lastTs = returns[0].x;
  for (const row of returns) {
    const deltaDays = Math.max(1, Math.round((row.x - lastTs) / (24 * 60 * 60 * 1000)));
    lastTs = row.x;
    const hit = kind === "gain" ? row.y >= thresholdPct : row.y <= -Math.abs(thresholdPct);
    days = hit ? 0 : days + deltaDays;
    out.push({ x: row.x, y: days });
  }
  return out;
}

function benfordDeviation(series: XYPoint[], window = 120): XYPoint[] {
  if (series.length < window) return [];
  const expected = [0, 0.3010, 0.1761, 0.1249, 0.0969, 0.0792, 0.0669, 0.0580, 0.0512, 0.0458];
  const digits: number[] = [];
  for (const row of series) {
    const n = Math.abs(Math.trunc(row.y));
    if (!Number.isFinite(n) || n <= 0) {
      digits.push(0);
      continue;
    }
    const leading = Number(String(n)[0] ?? "0");
    digits.push(Number.isFinite(leading) ? leading : 0);
  }

  const out: XYPoint[] = [];
  for (let i = window - 1; i < series.length; i += 1) {
    const counts = Array(10).fill(0) as number[];
    for (let j = i - window + 1; j <= i; j += 1) {
      const d = digits[j];
      if (d >= 1 && d <= 9) counts[d] += 1;
    }
    const n = counts.slice(1).reduce((sum, c) => sum + c, 0);
    if (n < 10) continue;
    let chi = 0;
    for (let d = 1; d <= 9; d += 1) {
      const exp = expected[d] * n;
      if (exp <= 0) continue;
      const diff = counts[d] - exp;
      chi += (diff * diff) / exp;
    }
    if (Number.isFinite(chi)) out.push({ x: series[i].x, y: chi });
  }
  return out;
}

function milestoneCrossings(priceSeries: XYPoint[]): XYPoint[] {
  if (priceSeries.length < 2) return [];
  const thresholds = [1_000, 5_000, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000];
  const out: XYPoint[] = [];
  let cumulativeCrossings = 0;
  for (let i = 1; i < priceSeries.length; i += 1) {
    const prev = priceSeries[i - 1].y;
    const cur = priceSeries[i].y;
    let crossings = 0;
    for (const level of thresholds) {
      if ((prev < level && cur >= level) || (prev >= level && cur < level)) crossings += 1;
    }
    cumulativeCrossings += crossings;
    out.push({ x: priceSeries[i].x, y: cumulativeCrossings });
  }
  return out;
}

function toWikiDate(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}00`;
}

async function fetchWikipediaPageviews(article: string, timeframeDays: number): Promise<XYPoint[]> {
  const now = Date.now();
  const from = now - Math.max(120, timeframeDays + 30) * 24 * 60 * 60 * 1000;
  const start = toWikiDate(from);
  const end = toWikiDate(now);
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `en.wikipedia/all-access/all-agents/${encodeURIComponent(article)}/daily/${start}/${end}`;
  try {
    const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    const rows: XYPoint[] = items
      .map((row: any) => {
        const tsRaw = String(row?.timestamp ?? "");
        const x = Date.parse(`${tsRaw.slice(0, 4)}-${tsRaw.slice(4, 6)}-${tsRaw.slice(6, 8)}T00:00:00Z`);
        const y = Number(row?.views);
        return { x, y };
      })
      .filter((row: XYPoint) => Number.isFinite(row.x) && Number.isFinite(row.y))
      .sort((a: XYPoint, b: XYPoint) => a.x - b.x);
    return rows;
  } catch {
    return [];
  }
}

function movingAverage(series: XYPoint[], window: number): XYPoint[] {
  if (!series.length || window <= 1) return series;
  const out: XYPoint[] = [];
  const queue: number[] = [];
  let sum = 0;
  for (const row of series) {
    queue.push(row.y);
    sum += row.y;
    if (queue.length > window) sum -= queue.shift() ?? 0;
    if (queue.length < window) continue;
    out.push({ x: row.x, y: sum / queue.length });
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rollingReturn(series: XYPoint[], lookbackDays: number): XYPoint[] {
  if (series.length < 2) return [];
  const out: XYPoint[] = [];
  let left = 0;
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
  for (let i = 0; i < series.length; i += 1) {
    const target = series[i].x - lookbackMs;
    while (left + 1 < i && series[left + 1].x <= target) left += 1;
    if (series[left].x > target || series[left].y === 0) continue;
    const ret = ((series[i].y / series[left].y) - 1) * 100;
    if (Number.isFinite(ret)) out.push({ x: series[i].x, y: ret });
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (!Number.isFinite(den) || den === 0) return NaN;
  return num / den;
}

const BREADTH_ASSETS = ["btc", "eth", "bnb", "xrp", "ada", "doge", "dot", "link", "ltc", "uni", "bch", "xlm"];

async function fetchBreadthMetricSeries(metric: string, timeframeDays: number, minPoints = 60): Promise<Record<string, XYPoint[]>> {
  const lookback = Math.max(420, timeframeDays + 320);
  const entries = await Promise.all(
    BREADTH_ASSETS.map(async (asset) => {
      const rows = await fetchCoinMetricsAssetMetricSeries({
        asset,
        metric,
        days: lookback,
      });
      return [asset, rows] as const;
    })
  );
  const out: Record<string, XYPoint[]> = {};
  for (const [asset, rows] of entries) {
    if (rows.length >= minPoints) out[asset] = rows;
  }
  return out;
}

async function fetchBreadthPriceSeries(timeframeDays: number): Promise<Record<string, XYPoint[]>> {
  return fetchBreadthMetricSeries("PriceUSD", timeframeDays, 60);
}

function sumSeries(rows: XYPoint[][]): XYPoint[] {
  const valid = rows.filter((series) => series.length >= 2).sort((a, b) => b.length - a.length);
  if (!valid.length) return [];
  let acc = valid[0];
  for (let i = 1; i < valid.length; i += 1) {
    acc = safeAdd(acc, valid[i]);
  }
  return acc;
}

async function fetchMvrvZScoreSeries(): Promise<XYPoint[]> {
  const rows = await fetchInlineArraySeries(MVRV_GRAPHICS_URL, "data_mvrv_zscore");
  if (rows.length >= 2) return rows;
  return [];
}

async function fetchMvrvSeries(): Promise<XYPoint[]> {
  const rows = await fetchInlineArraySeries(MVRV_GRAPHICS_URL, "data_mvrv");
  if (rows.length >= 2) return rows;
  return fetchFirstAvailableSeries(["mvrv_365dma.json"]);
}

function mvrvZToRiskScore(z: number): number {
  return clamp(((z - MVRV_RISK_LOW_Z) / (MVRV_RISK_HIGH_Z - MVRV_RISK_LOW_Z)) * 100, 0, 100);
}

function buildMvrvRiskScoreSeries(zscoreSeries: XYPoint[]): XYPoint[] {
  return zscoreSeries
    .map((row) => ({ x: row.x, y: mvrvZToRiskScore(row.y) }))
    .filter((row) => Number.isFinite(row.y));
}

function riskBandFromScore(score: number): number {
  if (score < RISK_BAND_SCORE_BREAKS[0]) return 0;
  if (score < RISK_BAND_SCORE_BREAKS[1]) return 1;
  if (score < RISK_BAND_SCORE_BREAKS[2]) return 2;
  if (score < RISK_BAND_SCORE_BREAKS[3]) return 3;
  return 4;
}

function buildDaysInCurrentRiskBandSeries(riskScoreSeries: XYPoint[]): XYPoint[] {
  if (!riskScoreSeries.length) return [];
  const rows = [...riskScoreSeries].sort((a, b) => a.x - b.x);
  const out: XYPoint[] = [];
  let lastBand = riskBandFromScore(rows[0].y);
  let lastTs = rows[0].x;
  let daysInBand = 0;
  out.push({ x: rows[0].x, y: 0 });

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const band = riskBandFromScore(row.y);
    const deltaDays = Math.max(1, Math.round((row.x - lastTs) / ONE_DAY_MS));
    lastTs = row.x;
    if (band !== lastBand) {
      daysInBand = 0;
      lastBand = band;
    } else {
      daysInBand += deltaDays;
    }
    out.push({ x: row.x, y: daysInBand });
  }

  return out.filter((row) => Number.isFinite(row.y));
}

const DIRECT_FILES_BY_CHART_ID: Record<string, string[]> = {
  fear_greed_index: ["fear_greed.json"],
  short_term_bubble_risk: ["fear_greed.json"],
  best_day_to_dca: ["realized_price.json", "realized_price_btc_price.json"],
  address_activity: ["addresses_active.json"],
  transfer_count_statistics: ["addresses_active.json"],
  sopr: ["sopr_7sma.json"],
  mvrv: ["mvrv_365dma.json"],
  mvrv_zscore: ["mvrv_365dma.json"],
  nupl: ["nupl_7dma.json"],
  nvt: ["nvts_bg.json"],
  rvts: ["nvts_730dma_bg.json"],
  supply_in_profit_or_loss: ["profit_loss.json"],
  hodl_waves: ["hw_age_supply_10.json"],
  rhodl_waves: ["rhodl_1m.json"],
  rhodl_ratio: ["rhodl.json"],
  puell_multiple: ["puell_multiple_7dma.json"],
  coin_days_destroyed: ["cdd.json"],
  coin_days_destroyed_90d: ["cdd_terminal_ajusted_90dma.json"],
  value_days_destroyed_multiple: ["vdd_multiple.json"],
  terminal_price: ["terminal_price.json"],
  dormancy: ["cdd_terminal_ajusted.json"],
  hash_rate: ["hashrate.json"],
  open_interest_crypto_futures: ["oi_total.json"],
  logarithmic_regression: ["power_law.json"],
  fair_value_log_reg: ["power_law.json"],
};

export async function fetchCanonicalCryptoChartSeries(
  chartId: string,
  timeframeDays: number
): Promise<XYPoint[] | undefined> {
  const cm = (asset: string, metric: string) =>
    fetchCoinMetricsAssetMetricSeries({
      asset,
      metric,
      days: timeframeDays,
    });

  if (chartId === "dominance") {
    const basket = await fetchBreadthMetricSeries("CapMrktEstUSD", timeframeDays);
    const btcCap = basket.btc ?? await cm("btc", "CapMrktEstUSD");
    const total = sumSeries(Object.values(basket));
    const rows = safeDivide(btcCap, total).map((row) => ({ x: row.x, y: row.y * 100 }));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "total_crypto_market_cap_proxy") {
    const basket = await fetchBreadthMetricSeries("CapMrktEstUSD", timeframeDays);
    const rows = sumSeries(Object.values(basket));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "total_crypto_valuation_trendline") {
    const lookbackDays = Math.max(timeframeDays, 730);
    const totalCap = await fetchCanonicalCryptoChartSeries("total_crypto_market_cap_proxy", lookbackDays);
    const trend = totalCap ? movingAverage(totalCap, 365) : [];
    const rows = totalCap ? safeDivide(totalCap, trend).map((row) => ({ x: row.x, y: (row.y - 1) * 100 })) : [];
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "altcoin_market_caps") {
    const basket = await fetchBreadthMetricSeries("CapMrktEstUSD", timeframeDays);
    const total = sumSeries(Object.values(basket));
    const btcCap = basket.btc ?? await cm("btc", "CapMrktEstUSD");
    const rows = safeSubtract(total, btcCap);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "transfer_volume") {
    const flowIn = await cm("btc", "FlowInExUSD");
    const flowOut = await cm("btc", "FlowOutExUSD");
    const rows = safeAdd(flowIn, flowOut);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "transfer_count_statistics") {
    const rows = await cm("btc", "TxCnt");
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "block_statistics") {
    const rows = await cm("btc", "BlkCnt");
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "miner_revenue") {
    const issuanceUsd = await cm("btc", "IssTotUSD");
    const feesBtc = await cm("btc", "FeeTotNtv");
    const btcPrice = await cm("btc", "PriceUSD");
    const feesUsd = alignSeriesWithCarry(feesBtc, btcPrice)
      .map((row) => ({ x: row.x, y: row.left * row.right }))
      .filter((row) => Number.isFinite(row.y));
    const rows = safeAdd(issuanceUsd, feesUsd);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "momr") {
    const minerRevenue = await fetchCanonicalCryptoChartSeries("miner_revenue", timeframeDays);
    const exchangeOut = await cm("btc", "FlowOutExUSD");
    const rows = minerRevenue ? safeDivide(exchangeOut, minerRevenue) : [];
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "mctc_miner") {
    const minerRevenue = await fetchCanonicalCryptoChartSeries("miner_revenue", timeframeDays);
    const thermoCap = await fetchFirstAvailableSeries(["thermo_cap.json"]);
    const rows = minerRevenue ? safeDivide(minerRevenue, thermoCap) : [];
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "supply_held_by_exchanges") {
    const rows = await cm("btc", "SplyExNtv");
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "supply_flow_to_exchanges") {
    const rows = await cm("btc", "FlowInExNtv");
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "transfer_flow_to_exchanges") {
    const rows = await cm("btc", "FlowInExUSD");
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "supply_issued_inflation") {
    const dailyIssuance = await cm("btc", "IssTotNtv");
    const currentSupply = await cm("btc", "SplyCur");
    const annualIssuance = safeMultiplyByScalar(dailyIssuance, 365);
    const rows = safeDivide(annualIssuance, currentSupply).map((row) => ({ x: row.x, y: row.y * 100 }));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "stock_to_flow_s2f") {
    const stock = await cm("btc", "SplyCur");
    const issuanceDaily = await cm("btc", "IssTotNtv");
    const annualFlow = safeMultiplyByScalar(issuanceDaily, 365);
    const rows = safeDivide(stock, annualFlow);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "eth_supply_dynamics_vs_bitcoin") {
    const ethSupply = await cm("eth", "SplyCur");
    const btcSupply = await cm("btc", "SplyCur");
    const rows = safeDivide(ethSupply, btcSupply);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "ethereum_supply_burnt") {
    const burnedDaily = await cm("eth", "FeeTotNtv");
    const rows = cumulative(burnedDaily);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "gas_statistics") {
    const rows = await cm("eth", "FeeTotNtv");
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "utxo_supply_distribution") {
    const rows = await fetchFirstAvailableSeries(["profit_loss.json"]);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "utxo_age_distribution") {
    const rows = await fetchFirstAvailableSeries(["hw_age_supply_10.json"]);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "portfolios_weighted_by_market_cap") {
    const rows = await fetchPortfolioValueRangeSeries("all", timeframeDays);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "crypto_heatmap") {
    const basket = await fetchBreadthPriceSeries(timeframeDays);
    const dailyByAsset = Object.values(basket).map((rows) => dailyReturns(rows));
    const aggregate = new Map<number, { sum: number; count: number }>();
    for (const rows of dailyByAsset) {
      for (const row of rows) {
        const bucket = aggregate.get(row.x) ?? { sum: 0, count: 0 };
        bucket.sum += row.y;
        bucket.count += 1;
        aggregate.set(row.x, bucket);
      }
    }
    const rows = Array.from(aggregate.entries())
      .map(([x, v]) => ({ x, y: v.count > 0 ? v.sum / v.count : NaN }))
      .filter((row) => Number.isFinite(row.y))
      .sort((a, b) => a.x - b.x);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "altcoin_season_index") {
    const basket = await fetchBreadthPriceSeries(timeframeDays + 120);
    const btc = basket.btc;
    if (btc?.length) {
      const btcRet = new Map(rollingReturn(btc, 90).map((row) => [row.x, row.y] as const));
      const alts = Object.entries(basket).filter(([asset]) => asset !== "btc");
      const scoreByTs = new Map<number, { out: number; total: number }>();
      for (const [, series] of alts) {
        for (const row of rollingReturn(series, 90)) {
          const btcR = btcRet.get(row.x);
          if (!Number.isFinite(btcR)) continue;
          const bucket = scoreByTs.get(row.x) ?? { out: 0, total: 0 };
          if (row.y > Number(btcR)) bucket.out += 1;
          bucket.total += 1;
          scoreByTs.set(row.x, bucket);
        }
      }
      const rows = Array.from(scoreByTs.entries())
        .map(([x, v]) => ({ x, y: v.total > 0 ? (v.out / v.total) * 100 : NaN }))
        .filter((row) => Number.isFinite(row.y))
        .sort((a, b) => a.x - b.x);
      if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
    }
  }

  if (
    chartId === "advance_decline_ratios" ||
    chartId === "advance_decline_index_adi" ||
    chartId === "absolute_breadth_index_abi"
  ) {
    const basket = await fetchBreadthPriceSeries(timeframeDays + 30);
    const dailyByAsset = Object.values(basket).map((rows) => dailyReturns(rows));
    const statsByTs = new Map<number, { adv: number; dec: number }>();
    for (const rows of dailyByAsset) {
      for (const row of rows) {
        const bucket = statsByTs.get(row.x) ?? { adv: 0, dec: 0 };
        if (row.y > 0) bucket.adv += 1;
        else if (row.y < 0) bucket.dec += 1;
        statsByTs.set(row.x, bucket);
      }
    }
    const ordered = Array.from(statsByTs.entries())
      .map(([x, v]) => ({ x, adv: v.adv, dec: v.dec }))
      .filter((row) => row.adv + row.dec >= 4)
      .sort((a, b) => a.x - b.x);

    if (ordered.length >= 2) {
      if (chartId === "advance_decline_ratios") {
        const rows = ordered
          .map((row) => ({ x: row.x, y: row.dec === 0 ? row.adv : row.adv / row.dec }))
          .filter((row) => Number.isFinite(row.y));
        if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
      }
      if (chartId === "absolute_breadth_index_abi") {
        const rows = ordered
          .map((row) => ({ x: row.x, y: ((Math.abs(row.adv - row.dec)) / Math.max(1, row.adv + row.dec)) * 100 }))
          .filter((row) => Number.isFinite(row.y));
        if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
      }
      if (chartId === "advance_decline_index_adi") {
        let adi = 0;
        const rows = ordered.map((row) => {
          adi += row.adv - row.dec;
          return { x: row.x, y: adi };
        });
        if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
      }
    }
  }

  if (chartId === "coins_above_below_moving_average") {
    const basket = await fetchBreadthPriceSeries(timeframeDays);
    const maByAsset = new Map<string, Map<number, number>>();
    const priceByAsset = new Map<string, Map<number, number>>();
    for (const [asset, series] of Object.entries(basket)) {
      maByAsset.set(asset, new Map(movingAverage(series, 200).map((row) => [row.x, row.y] as const)));
      priceByAsset.set(asset, new Map(series.map((row) => [row.x, row.y] as const)));
    }
    const allTs = new Set<number>();
    for (const map of maByAsset.values()) {
      for (const ts of map.keys()) allTs.add(ts);
    }
    const rows = Array.from(allTs)
      .sort((a, b) => a - b)
      .map((ts) => {
        let above = 0;
        let total = 0;
        for (const asset of Object.keys(basket)) {
          const ma = maByAsset.get(asset)?.get(ts);
          const price = priceByAsset.get(asset)?.get(ts);
          if (!Number.isFinite(ma) || !Number.isFinite(price)) continue;
          total += 1;
          if (Number(price) > Number(ma)) above += 1;
        }
        return { x: ts, y: total > 0 ? (above / total) * 100 : NaN };
      })
      .filter((row) => Number.isFinite(row.y));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "cowen_corridor") {
    const price = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    const ma200w = movingAverage(price, 1400);
    const rows = safeDivide(price, ma200w).map((row) => ({ x: row.x, y: row.y * 100 }));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "supertrend") {
    const price = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    const ema = movingAverage(price, 21);
    const rows = safeDivide(price, ema).map((row) => ({ x: row.x, y: (row.y - 1) * 100 }));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "market_cap_hypotheticals") {
    const marketCap = await fetchFirstAvailableSeries(["market_cap.json"]);
    const trend = movingAverage(marketCap, 365);
    const rows = safeDivide(marketCap, trend).map((row) => ({ x: row.x, y: row.y * 100 }));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "cycles_deviation" || chartId === "sma_cycle_top_breakout") {
    const price = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    const fair = await fetchFirstAvailableSeries(["power_law_floor.json"]);
    const rows = safeDivide(price, fair).map((row) => ({ x: row.x, y: (row.y - 1) * 100 }));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "color_coded_moving_average_strength") {
    const rows = await fetchCanonicalCryptoChartSeries("moving_averages", timeframeDays);
    if (rows && rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "days_since_pct_decline" || chartId === "days_since_pct_gain") {
    const price = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    const returns = dailyReturns(price);
    const rows = chartId === "days_since_pct_decline"
      ? daysSinceThresholdMove(returns, "decline", 10)
      : daysSinceThresholdMove(returns, "gain", 10);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "mvrv_zscore") {
    const rows = await fetchMvrvZScoreSeries();
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
    return [];
  }

  if (chartId === "mvrv") {
    const rows = await fetchMvrvSeries();
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (
    chartId === "historical_risk_levels" ||
    chartId === "current_risk_levels" ||
    chartId === "price_color_coded_by_risk" ||
    chartId === "time_in_risk_bands"
  ) {
    const zscoreSeries = await fetchMvrvZScoreSeries();
    const riskScoreSeries = buildMvrvRiskScoreSeries(zscoreSeries);
    if (riskScoreSeries.length >= 2) {
      if (chartId === "time_in_risk_bands") {
        const rows = buildDaysInCurrentRiskBandSeries(riskScoreSeries);
        if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
      }
      if (chartId === "current_risk_levels") {
        const smoothed = movingAverage(riskScoreSeries, 7);
        const rows = smoothed.length >= 2 ? smoothed : riskScoreSeries;
        return limitToTimeframe(rows, timeframeDays);
      }
      return limitToTimeframe(riskScoreSeries, timeframeDays);
    }

    return [];
  }

  if (chartId === "does_it_bleed") {
    const rows = await fetchFirstAvailableSeries(["nrpl_usd.json"]);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "btc_vs_dxy") {
    const btc = await cm("btc", "PriceUSD");
    const dxy = await fetchFredSeriesById("DTWEXBGS");
    const rows = safeDivide(btc, dxy);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "correlation_coefficients") {
    const lookbackDays = Math.max(1095, timeframeDays + 120);
    const btc = await fetchCoinMetricsAssetMetricSeries({
      asset: "btc",
      metric: "PriceUSD",
      days: lookbackDays,
    });
    const dxy = await fetchFredSeriesById("DTWEXBGS");
    const aligned = alignSeriesWithCarry(btc, dxy);
    if (aligned.length >= 120) {
      const btcRet: XYPoint[] = [];
      const dxyRet: XYPoint[] = [];
      for (let i = 1; i < aligned.length; i += 1) {
        const prev = aligned[i - 1];
        const cur = aligned[i];
        if (prev.left === 0 || prev.right === 0) continue;
        const l = (cur.left / prev.left) - 1;
        const r = (cur.right / prev.right) - 1;
        if (!Number.isFinite(l) || !Number.isFinite(r)) continue;
        btcRet.push({ x: cur.x, y: l });
        dxyRet.push({ x: cur.x, y: r });
      }
      const rows: XYPoint[] = [];
      for (let i = 89; i < btcRet.length; i += 1) {
        const left = btcRet.slice(i - 89, i + 1).map((row) => row.y);
        const right = dxyRet.slice(i - 89, i + 1).map((row) => row.y);
        const corr = pearson(left, right);
        if (!Number.isFinite(corr)) continue;
        rows.push({ x: btcRet[i].x, y: corr });
      }
      if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
    }
  }

  if (chartId === "qt_ending_bear_markets") {
    const btc = await cm("btc", "PriceUSD");
    const fedBalanceSheet = await fetchFredSeriesById("WALCL");
    const rows = safeDivide(btc, fedBalanceSheet)
      .map((row) => ({ x: row.x, y: row.y * 1_000_000 }))
      .filter((row) => Number.isFinite(row.y));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "benfords_law") {
    const txCount = await cm("btc", "TxCnt");
    const rows = benfordDeviation(txCount);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "price_milestone_crossings") {
    const price = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    const rows = milestoneCrossings(price);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "supply_revived") {
    const rows = await fetchFirstAvailableSeries(["vocdd.json"]);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "liveliness") {
    const cdd = await fetchFirstAvailableSeries(["cdd.json"]);
    const supply = await cm("btc", "SplyCur");
    const aligned = alignSeriesWithCarry(cdd, supply);
    if (aligned.length >= 2) {
      let cddCum = 0;
      let supplyCum = 0;
      const rows = aligned
        .map((row) => {
          cddCum += row.left;
          supplyCum += row.right;
          return { x: row.x, y: supplyCum === 0 ? NaN : cddCum / supplyCum };
        })
        .filter((row) => Number.isFinite(row.y));
      if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
    }
  }

  if (chartId === "transaction_fees") {
    const feesBtc = await cm("btc", "FeeTotNtv");
    const price = await cm("btc", "PriceUSD");
    const rows = alignSeriesWithCarry(feesBtc, price)
      .map((row) => ({ x: row.x, y: row.left * row.right }))
      .filter((row) => Number.isFinite(row.y));
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "wikipedia_page_views") {
    const rows = await fetchWikipediaPageviews("Bitcoin", timeframeDays);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "stablecoin_supply_ratio_ssr") {
    const marketCap = await fetchFirstAvailableSeries(["market_cap.json"]);
    const stablecoinSupply = await fetchBgeometricsFileSeries("stablecoin_supply.json", 2);
    const rows = safeDivide(marketCap, stablecoinSupply);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "btc_price_usd" && timeframeDays > 365) {
    const rows = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
    return undefined;
  }
  if (chartId === "btc_market_cap_usd" && timeframeDays > 365) {
    const rows = await fetchFirstAvailableSeries(["market_cap.json"]);
    if (rows.length >= 2) return limitToTimeframe(rows, timeframeDays);
    return undefined;
  }

  const direct = DIRECT_FILES_BY_CHART_ID[chartId];
  if (direct) {
    const rows = await fetchFirstAvailableSeries(direct);
    return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "log_reg_rainbow") {
    const price = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    const trend = await fetchFirstAvailableSeries(["power_law.json"]);
    const rows = safeDivide(price, trend)
      .map((row) => ({ x: row.x, y: (row.y - 1) * 100 }))
      .filter((row) => Number.isFinite(row.y));
    return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "hash_ribbons") {
    const short = await fetchFirstAvailableSeries(["hashribbons_sma_30.json"]);
    const long = await fetchFirstAvailableSeries(["hashribbons_sma_60.json"]);
    const rows = safeDivide(short, long)
      .map((row) => ({ x: row.x, y: (row.y - 1) * 100 }))
      .filter((row) => Number.isFinite(row.y));
    return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "hash_rate_divided_by_price") {
    const hash = await fetchFirstAvailableSeries(["hashrate.json"]);
    const price = await fetchFirstAvailableSeries(["hashrate_btc_price.json", "realized_price_btc_price.json"]);
    return limitToTimeframe(safeDivide(hash, price), timeframeDays);
  }

  if (chartId === "mctc") {
    const marketCap = await fetchFirstAvailableSeries(["market_cap.json"]);
    const thermoCap = await fetchFirstAvailableSeries(["thermo_cap.json"]);
    return limitToTimeframe(safeDivide(marketCap, thermoCap), timeframeDays);
  }

  if (chartId === "rctc") {
    const realizedCap = await fetchFirstAvailableSeries(["realized_cap.json"]);
    const thermoCap = await fetchFirstAvailableSeries(["thermo_cap.json"]);
    return limitToTimeframe(safeDivide(realizedCap, thermoCap), timeframeDays);
  }

  if (chartId === "moving_averages" || chartId === "golden_death_crosses") {
    const sma50 = await fetchFirstAvailableSeries(["50dma.json"]);
    const sma200 = await fetchFirstAvailableSeries(["200dma.json"]);
    const rows = safeDivide(sma50, sma200)
      .map((row) => ({ x: row.x, y: (row.y - 1) * 100 }))
      .filter((row) => Number.isFinite(row.y));
    return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "pi_cycle_bottom_top") {
    const fast = await fetchFirstAvailableSeries(["111dma.json"]);
    const slow = await fetchFirstAvailableSeries(["350dma_x2.json"]);
    const rows = safeDivide(fast, slow)
      .map((row) => ({ x: row.x, y: row.y * 100 }))
      .filter((row) => Number.isFinite(row.y));
    return limitToTimeframe(rows, timeframeDays);
  }

  if (chartId === "velocity") {
    const nvt = await fetchFirstAvailableSeries(["nvts_bg.json"]);
    return limitToTimeframe(inverse(nvt), timeframeDays);
  }

  return undefined;
}
