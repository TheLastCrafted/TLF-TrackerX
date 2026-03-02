import fs from "node:fs";

import { CHARTS } from "../src/catalog/charts";
import { fetchCanonicalCryptoChartSeries } from "../src/data/bgeometrics";
import { fetchFredSeries } from "../src/data/macro";
import { fetchBlockchainChartSeries } from "../src/data/onchain";
import { fetchFearGreedSeries } from "../src/data/sentiment";

type Pt = { x: number; y: number };
type TimeframeDays = 1 | 7 | 30 | 365;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEFRAMES: TimeframeDays[] = [1, 7, 30, 365];
const BTC_HALVING_DATES = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"];
const BTC_CYCLE_BOTTOM_DATES = ["2015-01-14", "2018-12-15", "2022-11-21"];
const BTC_CYCLE_PEAK_DATES = ["2013-12-04", "2017-12-17", "2021-11-10", "2024-03-14"];
const BTC_SUB_CYCLE_BOTTOM_DATES = ["2019-12-18", "2023-09-11"];
const REPORT_PATH = "scripts/crypto-chart-runtime-audit.json";

const ROI_SPECIAL_CHART_IDS = new Set<string>([
  "running_roi",
  "monthly_returns",
  "quarterly_returns",
  "average_daily_returns",
  "monthly_average_roi",
  "historical_monthly_average_roi",
  "year_to_date_roi",
  "roi_bands",
  "roi_after_cycle_bottom",
  "roi_after_bottom_multiple",
  "roi_after_bottom_pairs",
  "roi_after_inception_multi",
  "roi_after_inception_pairs",
  "roi_after_cycle_peak",
  "roi_after_latest_cycle_peak_multi",
  "roi_after_latest_cycle_peak_pairs",
  "roi_after_halving",
  "roi_after_sub_cycle_bottom",
]);

const INDICATOR_SPECIAL_CHART_IDS = new Set<string>([
  "logarithmic_regression",
  "fair_value_log_reg",
  "log_reg_rainbow",
  "moving_averages",
  "bull_market_support_band",
  "pi_cycle_bottom_top",
  "rsi",
  "macd",
  "golden_death_crosses",
  "bollinger_bands",
  "price_drawdown_from_ath",
  "correlation_coefficients",
  "volatility",
  "fear_greed_index",
  "transaction_fees",
]);

const CANONICAL_ONLY_CHART_IDS = new Set<string>([
  "youtube_subscribers",
  "youtube_views",
  "twitter_followers_analysts",
  "twitter_followers_exchanges",
  "twitter_followers_layer1s",
  "twitter_tweets",
]);

const CG_BASE = "https://api.coingecko.com/api/v3";
const cgCache = new Map<string, Pt[]>();

async function fetchJson(url: string, timeoutMs = 9000): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCoinGeckoMarketChartLite(opts: {
  coinId: string;
  vsCurrency: string;
  days: number;
  metric?: "prices" | "market_caps" | "total_volumes";
}): Promise<Pt[]> {
  const metric = opts.metric ?? "prices";
  const days = Math.max(1, Math.min(365, Math.floor(opts.days)));
  const cacheKey = `${opts.coinId}:${metric}:${opts.vsCurrency}:${days}`;
  const cached = cgCache.get(cacheKey);
  if (cached) return limitToTimeframe(cached, days);
  const url =
    `${CG_BASE}/coins/${encodeURIComponent(opts.coinId)}/market_chart` +
    `?vs_currency=${encodeURIComponent(opts.vsCurrency.toLowerCase())}` +
    `&days=${encodeURIComponent(String(days))}`;
  const json = await fetchJson(url);
  const rows = (Array.isArray(json?.[metric]) ? json[metric] : [])
    .map((row: any) => ({ x: Number(row?.[0]), y: Number(row?.[1]) }))
    .filter((row: Pt) => Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort((a: Pt, b: Pt) => a.x - b.x);
  cgCache.set(cacheKey, rows);
  return limitToTimeframe(rows, days);
}

function limitToTimeframe(data: Pt[], timeframeDays: number): Pt[] {
  if (!data.length) return data;
  const since = Date.now() - timeframeDays * DAY_MS;
  const filtered = data.filter((point) => point.x >= since);
  if (filtered.length >= 2) return filtered;
  return data.slice(-Math.min(12, data.length));
}

function mergeSeries(left: Pt[], right: Pt[], operation: "divide" | "multiply" | "subtract" | "add"): Pt[] {
  if (!left.length || !right.length) return [];
  const sortedLeft = [...left].sort((a, b) => a.x - b.x);
  const sortedRight = [...right]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);
  if (!sortedRight.length) return [];

  let rightIndex = 0;
  let activeRight = sortedRight[0].y;
  const out: Pt[] = [];
  for (const point of sortedLeft) {
    while (rightIndex + 1 < sortedRight.length && sortedRight[rightIndex + 1].x <= point.x) {
      rightIndex += 1;
      activeRight = sortedRight[rightIndex].y;
    }
    const rhs = activeRight;
    if (!Number.isFinite(rhs)) continue;
    let y = NaN;
    if (operation === "divide") y = rhs === 0 ? NaN : point.y / rhs;
    if (operation === "multiply") y = point.y * rhs;
    if (operation === "subtract") y = point.y - rhs;
    if (operation === "add") y = point.y + rhs;
    if (Number.isFinite(y)) out.push({ x: point.x, y });
  }
  return out;
}

function parseEventDates(dates: string[]): number[] {
  return dates
    .map((value) => Date.parse(`${value}T00:00:00Z`))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function findLatestEventInSeriesRange(series: Pt[], eventDates: string[]): number | null {
  if (!series.length) return null;
  const firstTs = series[0].x;
  const lastTs = series[series.length - 1].x;
  const timestamps = parseEventDates(eventDates);
  for (let i = timestamps.length - 1; i >= 0; i -= 1) {
    const ts = timestamps[i];
    if (ts >= firstTs && ts <= lastTs) return ts;
  }
  return null;
}

function anchorSeriesToRoi(series: Pt[], anchorTs: number): Pt[] {
  if (!series.length) return [];
  const anchorPoint = series.find((point) => point.x >= anchorTs) ?? series[0];
  if (!anchorPoint || !Number.isFinite(anchorPoint.y) || anchorPoint.y === 0) return [];
  return series
    .filter((point) => point.x >= anchorPoint.x)
    .map((point) => ({ x: point.x, y: ((point.y / anchorPoint.y) - 1) * 100 }));
}

function rollingReturnSeries(series: Pt[], lookbackDays: number): Pt[] {
  if (series.length < 2) return [];
  const out: Pt[] = [];
  let left = 0;
  for (let i = 0; i < series.length; i += 1) {
    const targetTs = series[i].x - lookbackDays * DAY_MS;
    while (left + 1 < i && series[left + 1].x <= targetTs) left += 1;
    if (series[left].x > targetTs || series[left].y === 0) continue;
    const ret = ((series[i].y / series[left].y) - 1) * 100;
    if (Number.isFinite(ret)) out.push({ x: series[i].x, y: ret });
  }
  return out;
}

function dailyReturnSeries(series: Pt[]): Pt[] {
  if (series.length < 2) return [];
  const out: Pt[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].y;
    if (!Number.isFinite(prev) || prev === 0) continue;
    const ret = ((series[i].y / prev) - 1) * 100;
    if (Number.isFinite(ret)) out.push({ x: series[i].x, y: ret });
  }
  return out;
}

function movingAverageSeries(series: Pt[], window: number): Pt[] {
  if (!series.length || window <= 1) return series;
  const out: Pt[] = [];
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

function yearStartTsForSeries(series: Pt[]): number {
  if (!series.length) return Date.now();
  const latest = new Date(series[series.length - 1].x);
  let yearStart = Date.parse(`${latest.getUTCFullYear()}-01-01T00:00:00Z`);
  if (Number.isFinite(yearStart) && yearStart <= series[series.length - 1].x) return yearStart;
  yearStart = Date.parse(`${latest.getUTCFullYear() - 1}-01-01T00:00:00Z`);
  return Number.isFinite(yearStart) ? yearStart : series[0].x;
}

function seriesToMap(series: Pt[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of series) out.set(row.x, row.y);
  return out;
}

function alignSeriesWithCarry(left: Pt[], right: Pt[]): { x: number; left: number; right: number }[] {
  if (!left.length || !right.length) return [];
  const sortedLeft = [...left].sort((a, b) => a.x - b.x);
  const sortedRight = [...right].sort((a, b) => a.x - b.x);
  let rIndex = 0;
  let activeRight = sortedRight[0].y;
  const out: { x: number; left: number; right: number }[] = [];
  for (const l of sortedLeft) {
    while (rIndex + 1 < sortedRight.length && sortedRight[rIndex + 1].x <= l.x) {
      rIndex += 1;
      activeRight = sortedRight[rIndex].y;
    }
    if (!Number.isFinite(activeRight)) continue;
    out.push({ x: l.x, left: l.y, right: activeRight });
  }
  return out;
}

function emaSeries(series: Pt[], period: number): Pt[] {
  if (!series.length || period <= 1) return series;
  const alpha = 2 / (period + 1);
  const out: Pt[] = [];
  let ema = series[0].y;
  for (const row of series) {
    ema = alpha * row.y + (1 - alpha) * ema;
    out.push({ x: row.x, y: ema });
  }
  return out;
}

function rollingStdDevSeries(series: Pt[], window: number): Pt[] {
  if (series.length < window || window <= 1) return [];
  const out: Pt[] = [];
  const values: number[] = [];
  let sum = 0;
  let sumSq = 0;
  for (const row of series) {
    values.push(row.y);
    sum += row.y;
    sumSq += row.y * row.y;
    if (values.length > window) {
      const dropped = values.shift() ?? 0;
      sum -= dropped;
      sumSq -= dropped * dropped;
    }
    if (values.length < window) continue;
    const mean = sum / window;
    const variance = Math.max(0, sumSq / window - mean * mean);
    out.push({ x: row.x, y: Math.sqrt(variance) });
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

function computeLogRegressionSeries(priceSeries: Pt[]): { trend: Pt[]; fair: Pt[]; rainbow: Pt[] } {
  const usable = priceSeries.filter((p) => p.y > 0).sort((a, b) => a.x - b.x);
  if (usable.length < 120) return { trend: [], fair: [], rainbow: [] };
  const startTs = usable[0].x;
  const xs = usable.map((row) => Math.log((row.x - startTs) / DAY_MS + 1));
  const ys = usable.map((row) => Math.log(row.y));
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || denom === 0) return { trend: [], fair: [], rainbow: [] };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const trend: Pt[] = usable.map((row, i) => ({ x: row.x, y: Math.exp(intercept + slope * xs[i]) }));
  const fair: Pt[] = trend.map((row) => ({ x: row.x, y: row.y }));
  const trendByTs = seriesToMap(trend);
  const rainbow: Pt[] = usable
    .map((row) => {
      const base = trendByTs.get(row.x) ?? NaN;
      const y = Number.isFinite(base) && base > 0 ? ((row.y / base) - 1) * 100 : NaN;
      return { x: row.x, y };
    })
    .filter((row) => Number.isFinite(row.y));

  return { trend, fair, rainbow };
}

function computeRsiSeries(priceSeries: Pt[], period = 14): Pt[] {
  if (priceSeries.length <= period) return [];
  const out: Pt[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = priceSeries[i].y - priceSeries[i - 1].y;
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < priceSeries.length; i += 1) {
    const delta = priceSeries[i].y - priceSeries[i - 1].y;
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    if (Number.isFinite(rsi)) out.push({ x: priceSeries[i].x, y: rsi });
  }
  return out;
}

function lookbackDaysForSpecialChart(defId: string, timeframeDays: number): number {
  if (defId === "historical_monthly_average_roi") return Math.max(timeframeDays, 730);
  if (defId === "monthly_average_roi") return Math.max(timeframeDays, 365);
  if (defId === "monthly_returns") return Math.max(timeframeDays + 45, 120);
  if (defId === "quarterly_returns") return Math.max(timeframeDays + 100, 240);
  if (defId === "average_daily_returns") return Math.max(timeframeDays + 7, 90);
  if (defId === "year_to_date_roi") return Math.max(timeframeDays, 730);
  if (defId === "roi_after_halving") return 1600;
  if (defId === "roi_after_cycle_bottom" || defId === "roi_after_bottom_multiple" || defId === "roi_after_bottom_pairs") return 1800;
  if (defId === "roi_after_cycle_peak" || defId === "roi_after_latest_cycle_peak_multi" || defId === "roi_after_latest_cycle_peak_pairs") return 1800;
  if (defId === "roi_after_sub_cycle_bottom") return 1200;
  if (defId === "roi_after_inception_multi" || defId === "roi_after_inception_pairs") return Math.max(timeframeDays, 3650);
  if (defId === "correlation_coefficients") return Math.max(timeframeDays, 1095);
  if (defId === "fear_greed_index") return Math.max(timeframeDays, 3650);
  if (defId === "transaction_fees") return Math.max(timeframeDays, 3650);
  if (defId === "logarithmic_regression" || defId === "fair_value_log_reg" || defId === "log_reg_rainbow") return Math.max(timeframeDays, 3650);
  if (
    defId === "moving_averages" ||
    defId === "bull_market_support_band" ||
    defId === "pi_cycle_bottom_top" ||
    defId === "rsi" ||
    defId === "macd" ||
    defId === "golden_death_crosses" ||
    defId === "bollinger_bands" ||
    defId === "price_drawdown_from_ath" ||
    defId === "volatility"
  ) {
    return Math.max(timeframeDays, 730);
  }
  return Math.max(timeframeDays, 365);
}

function buildSpecialRoiSeries(defId: string, baseSeries: Pt[]): Pt[] {
  if (!baseSeries.length) return [];
  if (defId === "running_roi" || defId === "roi_bands" || defId === "roi_after_inception_multi" || defId === "roi_after_inception_pairs") {
    return anchorSeriesToRoi(baseSeries, baseSeries[0].x);
  }
  if (defId === "monthly_returns") return rollingReturnSeries(baseSeries, 30);
  if (defId === "quarterly_returns") return rollingReturnSeries(baseSeries, 90);
  if (defId === "average_daily_returns") return dailyReturnSeries(baseSeries);
  if (defId === "monthly_average_roi") return movingAverageSeries(rollingReturnSeries(baseSeries, 30), 30);
  if (defId === "historical_monthly_average_roi") return movingAverageSeries(rollingReturnSeries(baseSeries, 30), 180);
  if (defId === "year_to_date_roi") return anchorSeriesToRoi(baseSeries, yearStartTsForSeries(baseSeries));
  if (defId === "roi_after_halving") {
    const anchor = findLatestEventInSeriesRange(baseSeries, BTC_HALVING_DATES) ?? baseSeries[0].x;
    return anchorSeriesToRoi(baseSeries, anchor);
  }
  if (defId === "roi_after_cycle_bottom" || defId === "roi_after_bottom_multiple" || defId === "roi_after_bottom_pairs") {
    const anchor = findLatestEventInSeriesRange(baseSeries, BTC_CYCLE_BOTTOM_DATES) ?? baseSeries[0].x;
    return anchorSeriesToRoi(baseSeries, anchor);
  }
  if (defId === "roi_after_cycle_peak" || defId === "roi_after_latest_cycle_peak_multi" || defId === "roi_after_latest_cycle_peak_pairs") {
    const anchor = findLatestEventInSeriesRange(baseSeries, BTC_CYCLE_PEAK_DATES) ?? baseSeries[0].x;
    return anchorSeriesToRoi(baseSeries, anchor);
  }
  if (defId === "roi_after_sub_cycle_bottom") {
    const anchor = findLatestEventInSeriesRange(baseSeries, BTC_SUB_CYCLE_BOTTOM_DATES) ?? baseSeries[0].x;
    return anchorSeriesToRoi(baseSeries, anchor);
  }
  return [];
}

function ensureRenderableSeries(series: Pt[]): Pt[] {
  if (!series.length) return [];
  if (series.length >= 2) return series;
  const row = series[0];
  return [{ x: row.x - DAY_MS, y: row.y }, row];
}

async function buildSpecialIndicatorSeries(
  defId: string,
  currency: string,
  timeframeDays: number,
  depth: number,
  visited: Set<string>
): Promise<Pt[]> {
  const lookbackDays = lookbackDaysForSpecialChart(defId, timeframeDays);
  if (defId === "fear_greed_index") {
    const rows = await fetchFearGreedSeries(lookbackDays);
    return limitToTimeframe(rows, timeframeDays);
  }
  if (defId === "transaction_fees") {
    const rows = await fetchBlockchainChartSeries({ key: "transaction-fees-usd", days: lookbackDays });
    return limitToTimeframe(rows, timeframeDays);
  }
  const btc = await loadSeries("btc_price_usd", currency, lookbackDays, depth + 1, visited);
  if (!btc.length) return [];

  if (defId === "logarithmic_regression") return computeLogRegressionSeries(btc).trend;
  if (defId === "fair_value_log_reg") return computeLogRegressionSeries(btc).fair;
  if (defId === "log_reg_rainbow") return computeLogRegressionSeries(btc).rainbow;
  if (defId === "price_drawdown_from_ath") {
    let peak = Number.NEGATIVE_INFINITY;
    return btc.map((row) => {
      peak = Math.max(peak, row.y);
      return { x: row.x, y: peak > 0 ? ((row.y / peak) - 1) * 100 : NaN };
    }).filter((row) => Number.isFinite(row.y));
  }
  if (defId === "moving_averages" || defId === "golden_death_crosses") {
    const sma50 = movingAverageSeries(btc, 50);
    const sma200 = movingAverageSeries(btc, 200);
    return mergeSeries(sma50, sma200, "divide").map((row) => ({ x: row.x, y: (row.y - 1) * 100 }));
  }
  if (defId === "bull_market_support_band") {
    const sma20w = movingAverageSeries(btc, 140);
    const ema21w = emaSeries(btc, 147);
    const bandMid = mergeSeries(sma20w, ema21w, "add").map((row) => ({ x: row.x, y: row.y / 2 }));
    return alignSeriesWithCarry(btc, bandMid)
      .map((row) => ({ x: row.x, y: row.right === 0 ? NaN : ((row.left / row.right) - 1) * 100 }))
      .filter((row) => Number.isFinite(row.y));
  }
  if (defId === "pi_cycle_bottom_top") {
    const sma111 = movingAverageSeries(btc, 111);
    const sma350 = movingAverageSeries(btc, 350).map((row) => ({ x: row.x, y: row.y * 2 }));
    return mergeSeries(sma111, sma350, "divide").map((row) => ({ x: row.x, y: row.y * 100 }));
  }
  if (defId === "rsi") return computeRsiSeries(btc, 14);
  if (defId === "macd") {
    const ema12 = emaSeries(btc, 12);
    const ema26 = emaSeries(btc, 26);
    const macd = mergeSeries(ema12, ema26, "subtract");
    const signal = emaSeries(macd, 9);
    return mergeSeries(macd, signal, "subtract");
  }
  if (defId === "bollinger_bands") {
    const sma20 = movingAverageSeries(btc, 20);
    const std20 = rollingStdDevSeries(btc, 20).map((row) => ({ x: row.x, y: row.y * 2 }));
    const top = mergeSeries(sma20, std20, "add");
    const bottom = mergeSeries(sma20, std20, "subtract");
    const topByTs = seriesToMap(top);
    const bottomByTs = seriesToMap(bottom);
    const midByTs = seriesToMap(sma20);
    return btc
      .map((row) => {
        const topV = topByTs.get(row.x);
        const botV = bottomByTs.get(row.x);
        const midV = midByTs.get(row.x);
        if (!Number.isFinite(topV) || !Number.isFinite(botV) || !Number.isFinite(midV) || topV === botV) return { x: row.x, y: NaN };
        return { x: row.x, y: ((row.y - Number(midV)) / (Number(topV) - Number(botV))) * 100 };
      })
      .filter((row) => Number.isFinite(row.y));
  }
  if (defId === "volatility") {
    return rollingStdDevSeries(dailyReturnSeries(btc), 30).map((row) => ({ x: row.x, y: row.y * Math.sqrt(365) }));
  }
  if (defId === "correlation_coefficients") {
    const dxy = await loadSeries("dollar_index", currency, lookbackDays, depth + 1, visited);
    const aligned = alignSeriesWithCarry(btc, dxy);
    if (aligned.length < 120) return [];
    const btcRet: { x: number; y: number }[] = [];
    const dxyRet: { x: number; y: number }[] = [];
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
    const out: Pt[] = [];
    for (let i = 89; i < btcRet.length; i += 1) {
      const left = btcRet.slice(i - 89, i + 1).map((row) => row.y);
      const right = dxyRet.slice(i - 89, i + 1).map((row) => row.y);
      const corr = pearson(left, right);
      if (Number.isFinite(corr)) out.push({ x: btcRet[i].x, y: corr });
    }
    return out;
  }
  return [];
}

async function loadSeries(
  defId: string,
  currency: string,
  timeframeDays: number,
  depth = 0,
  visited?: Set<string>
): Promise<Pt[]> {
  if (depth > 10) return [];
  if (visited?.has(defId)) return [];
  const nextVisited = new Set(visited ?? []);
  nextVisited.add(defId);
  const def = CHARTS.find((row) => row.id === defId);
  if (!def) return [];

  const canonical = await fetchCanonicalCryptoChartSeries(def.id, timeframeDays);
  if (canonical !== undefined) {
    return limitToTimeframe(
      canonical
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .sort((a, b) => a.x - b.x),
      timeframeDays
    );
  }
  if (CANONICAL_ONLY_CHART_IDS.has(def.id)) return [];

  if (def.type === "coingecko_market_chart") {
    const raw = await fetchCoinGeckoMarketChartLite({
      coinId: def.params.coinId,
      vsCurrency: currency.toLowerCase(),
      days: timeframeDays,
      metric: def.params.metric,
    });
    return limitToTimeframe(raw.map((p) => ({ x: Number(p.x), y: Number(p.y) })), timeframeDays);
  }
  if (def.type === "fred_series") {
    const raw = await fetchFredSeries(def.params);
    return limitToTimeframe(raw.map((p) => ({ x: Number(p.x), y: Number(p.y) })), timeframeDays);
  }
  if (def.type === "formula_chart" && ROI_SPECIAL_CHART_IDS.has(def.id)) {
    const baseSeries = await loadSeries(def.params.leftId, currency, lookbackDaysForSpecialChart(def.id, timeframeDays), depth + 1, nextVisited);
    let derived = buildSpecialRoiSeries(def.id, baseSeries);
    if (derived.length < 2 && baseSeries.length) derived = anchorSeriesToRoi(baseSeries, baseSeries[0].x);
    return ensureRenderableSeries(limitToTimeframe(derived, timeframeDays));
  }
  if (def.type === "formula_chart" && INDICATOR_SPECIAL_CHART_IDS.has(def.id)) {
    const derived = await buildSpecialIndicatorSeries(def.id, currency, timeframeDays, depth + 1, nextVisited);
    return ensureRenderableSeries(limitToTimeframe(derived, timeframeDays));
  }
  if (def.type === "formula_chart" && def.category === "Crypto") return [];
  const left = await loadSeries(def.params.leftId, currency, timeframeDays, depth + 1, nextVisited);
  const right = await loadSeries(def.params.rightId, currency, timeframeDays, depth + 1, nextVisited);
  const merged = mergeSeries(left, right, def.params.operation);
  return merged.length >= 2 ? ensureRenderableSeries(merged) : [];
}

function range(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: NaN, max: NaN };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function sanityReason(id: string, series: Pt[]): string | null {
  const values = series.map((row) => row.y).filter((v) => Number.isFinite(v));
  if (values.length < 2) return "not_enough_points";
  const { min, max } = range(values);
  if (id === "rsi" && (min < -0.1 || max > 100.1)) return `rsi_out_of_range_${min.toFixed(2)}_${max.toFixed(2)}`;
  if (id === "fear_greed_index" && (min < -0.1 || max > 100.1)) return `fear_greed_out_of_range_${min.toFixed(2)}_${max.toFixed(2)}`;
  if ((id === "historical_risk_levels" || id === "current_risk_levels" || id === "price_color_coded_by_risk") && (min < -0.1 || max > 100.1)) {
    return `risk_out_of_range_${min.toFixed(2)}_${max.toFixed(2)}`;
  }
  if (id === "correlation_coefficients" && (min < -1.05 || max > 1.05)) return `correlation_out_of_range_${min.toFixed(3)}_${max.toFixed(3)}`;
  if (id === "price_drawdown_from_ath" && max > 0.001) return `drawdown_positive_${max.toFixed(3)}`;
  return null;
}

async function main() {
  const cryptoFormulaIds = CHARTS
    .filter((row) => row.type === "formula_chart" && row.category === "Crypto")
    .map((row) => row.id);
  const failures: { id: string; timeframeDays: number; reason: string }[] = [];
  const passesByChart = new Map<string, boolean>();

  for (const id of cryptoFormulaIds) {
    passesByChart.set(id, true);
    for (const timeframeDays of TIMEFRAMES) {
      try {
        const rows = await loadSeries(id, "usd", timeframeDays);
        const reason = sanityReason(id, rows);
        if (reason) {
          failures.push({ id, timeframeDays, reason });
          passesByChart.set(id, false);
        }
      } catch (err: any) {
        failures.push({
          id,
          timeframeDays,
          reason: `exception_${String(err?.message ?? err ?? "unknown")}`,
        });
        passesByChart.set(id, false);
      }
    }
  }

  const yesCharts = cryptoFormulaIds.filter((id) => passesByChart.get(id));
  const noCharts = cryptoFormulaIds.filter((id) => !passesByChart.get(id));
  const report = {
    at: new Date().toISOString(),
    totalCharts: cryptoFormulaIds.length,
    totalChecks: cryptoFormulaIds.length * TIMEFRAMES.length,
    yesCharts,
    noCharts,
    failures,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`Crypto chart runtime audit complete: ${yesCharts.length}/${cryptoFormulaIds.length} charts passed all timeframes.`);
  if (noCharts.length) {
    console.log("NO charts:");
    for (const id of noCharts) console.log(`- ${id}`);
    console.log("Top failure details:");
    for (const row of failures.slice(0, 40)) {
      console.log(`- ${row.id} @ ${row.timeframeDays}D -> ${row.reason}`);
    }
  }
  console.log(`Report written to ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
