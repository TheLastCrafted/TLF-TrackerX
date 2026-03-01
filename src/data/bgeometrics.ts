import { fetchWithWebProxy } from "./web-proxy";

export type XYPoint = { x: number; y: number };

const FILE_BASE = "https://charts.bgeometrics.com/files";
const CACHE_TTL_MS = 8 * 60_000;

const fileCache = new Map<string, { expiresAt: number; data: XYPoint[] }>();
const fileInflight = new Map<string, Promise<XYPoint[]>>();

function limitToTimeframe(series: XYPoint[], timeframeDays: number): XYPoint[] {
  if (!series.length) return [];
  const since = Date.now() - Math.max(1, timeframeDays) * 24 * 60 * 60 * 1000;
  const filtered = series.filter((row) => row.x >= since);
  if (filtered.length >= 2) return filtered;
  return series;
}

function normalizeJsonSeries(payload: unknown): XYPoint[] {
  if (!Array.isArray(payload)) return [];
  const out: XYPoint[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const x = Number(row[0]);
    const y = Number(row[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x, y });
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

async function fetchBgeometricsFileSeries(fileName: string): Promise<XYPoint[]> {
  const key = fileName.trim();
  if (!key) return [];
  const cached = fileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const inflight = fileInflight.get(key);
  if (inflight) return inflight;

  const run = (async () => {
    const url = `${FILE_BASE}/${encodeURIComponent(key)}`;
    try {
      const res = await fetchWithWebProxy(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const series = normalizeJsonSeries(json);
      fileCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data: series });
      return series;
    } catch {
      return [];
    }
  })();

  fileInflight.set(key, run);
  try {
    return await run;
  } finally {
    fileInflight.delete(key);
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

function inverse(series: XYPoint[]): XYPoint[] {
  return series
    .map((row) => ({ x: row.x, y: row.y === 0 ? NaN : 1 / row.y }))
    .filter((row) => Number.isFinite(row.y));
}

const DIRECT_FILES_BY_CHART_ID: Record<string, string[]> = {
  current_risk_levels: ["fear_greed.json"],
  fear_greed_index: ["fear_greed.json"],
  short_term_bubble_risk: ["fear_greed.json"],
  time_in_risk_bands: ["fear_greed.json"],
  historical_risk_levels: ["mvrv_365dma.json", "lth_mvrv.json"],
  price_color_coded_by_risk: ["mvrv_365dma.json", "lth_mvrv.json"],
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
  open_interest_crypto_options: ["oi_total.json"],
  logarithmic_regression: ["power_law.json"],
  fair_value_log_reg: ["power_law_floor.json"],
};

export async function fetchCanonicalCryptoChartSeries(
  chartId: string,
  timeframeDays: number
): Promise<XYPoint[] | undefined> {
  if (chartId === "btc_price_usd" && timeframeDays > 365) {
    const rows = await fetchFirstAvailableSeries(["realized_price_btc_price.json", "moving_average_price.json"]);
    return limitToTimeframe(rows, timeframeDays);
  }
  if (chartId === "btc_market_cap_usd" && timeframeDays > 365) {
    const rows = await fetchFirstAvailableSeries(["market_cap.json"]);
    return limitToTimeframe(rows, timeframeDays);
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
