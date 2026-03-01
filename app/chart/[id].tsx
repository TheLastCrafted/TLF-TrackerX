import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tradingMarketCapSymbolForCoinId, tradingSymbolForCoinId } from "../../src/catalog/trading-symbols";
import { tradingSymbolForChartId } from "../../src/catalog/chart-trading-symbols";
import { CHARTS, ChartValueFormat } from "../../src/catalog/charts";
import { fetchCanonicalCryptoChartSeries } from "../../src/data/bgeometrics";
import { fetchCoinGeckoMarketChart } from "../../src/data/coingecko";
import { fetchFredSeries } from "../../src/data/macro";
import { fetchBlockchainChartSeries } from "../../src/data/onchain";
import { fetchFearGreedSeries } from "../../src/data/sentiment";
import { useI18n } from "../../src/i18n/use-i18n";
import { usePriceAlerts } from "../../src/state/price-alerts";
import { useSettings } from "../../src/state/settings";
import { useWatchlist } from "../../src/state/watchlist";
import { ActionButton } from "../../src/ui/action-button";
import { FormInput } from "../../src/ui/form-input";
import { SimpleSeriesChart } from "../../src/ui/simple-series-chart";
import { TradingViewChart } from "../../src/ui/TradingViewChart";
import { useAppColors } from "../../src/ui/use-app-colors";

type Pt = { x: number; y: number };
type TimeframeDays = 1 | 7 | 30 | 365 | 1825 | 3650 | 7300 | 18250;

const TIMEFRAMES: { days: TimeframeDays; label: string }[] = [
  { days: 1, label: "1D" },
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 365, label: "1Y" },
  { days: 1825, label: "5Y" },
  { days: 3650, label: "10Y" },
  { days: 7300, label: "20Y" },
  { days: 18250, label: "50Y" },
];

const DEFAULT_SUPPORTED_DAYS: TimeframeDays = 30;
const MAX_SUPPORTED_DAYS: TimeframeDays = 18250;
const DAY_MS = 24 * 60 * 60 * 1000;
const BTC_HALVING_DATES = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"];
const BTC_CYCLE_BOTTOM_DATES = ["2015-01-14", "2018-12-15", "2022-11-21"];
const BTC_CYCLE_PEAK_DATES = ["2013-12-04", "2017-12-17", "2021-11-10", "2024-03-14"];
const BTC_SUB_CYCLE_BOTTOM_DATES = ["2019-12-18", "2023-09-11"];

function clampToSupportedTimeframe(days: number): TimeframeDays {
  for (let i = TIMEFRAMES.length - 1; i >= 0; i -= 1) {
    if (days >= TIMEFRAMES[i].days) return TIMEFRAMES[i].days;
  }
  return TIMEFRAMES[0].days;
}

function maxSupportedDaysForChart(defId: string, visited = new Set<string>()): TimeframeDays {
  if (visited.has(defId)) return DEFAULT_SUPPORTED_DAYS;
  visited.add(defId);
  const def = CHARTS.find((row) => row.id === defId);
  if (!def) return DEFAULT_SUPPORTED_DAYS;
  if (def.type === "coingecko_market_chart") return MAX_SUPPORTED_DAYS;
  if (def.type === "fred_series") return clampToSupportedTimeframe(def.params.days);
  const left = maxSupportedDaysForChart(def.params.leftId, new Set(visited));
  const right = maxSupportedDaysForChart(def.params.rightId, new Set(visited));
  return clampToSupportedTimeframe(Math.min(left, right));
}

function formatValue(v: number, mode: ChartValueFormat, currency: "USD" | "EUR"): string {
  if (mode === "usd") {
    const symbol = currency === "EUR" ? "EUR " : "$";
    return `${symbol}${v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`;
  }
  if (mode === "percent") {
    return `${v.toFixed(2)}%`;
  }
  if (mode === "index") {
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function downsample(data: Pt[], density: "low" | "medium" | "high"): Pt[] {
  if (data.length <= 180) return data;
  const stride = density === "high" ? 1 : density === "medium" ? 2 : 4;
  if (stride <= 1) return data;

  const out: Pt[] = [];
  for (let i = 0; i < data.length; i += stride) {
    out.push(data[i]);
  }
  if (out[out.length - 1]?.x !== data[data.length - 1]?.x) {
    out.push(data[data.length - 1]);
  }
  return out;
}

function limitToTimeframe(data: Pt[], timeframeDays: number): Pt[] {
  if (!data.length) return data;
  const since = Date.now() - timeframeDays * 24 * 60 * 60 * 1000;
  const filtered = data.filter((point) => point.x >= since);
  if (filtered.length >= 2) return filtered;
  return data.slice(-Math.min(12, data.length));
}

function hasEnoughFreshPoints(data: Pt[], timeframeDays: number): boolean {
  if (data.length < 2) return false;
  const since = Date.now() - timeframeDays * DAY_MS;
  if ((data[0]?.x ?? Date.now()) > since) return false;
  let count = 0;
  for (const point of data) {
    if (point.x >= since) count += 1;
    if (count >= 2) return true;
  }
  return false;
}

function mergeSeries(left: Pt[], right: Pt[], operation: "divide" | "multiply" | "subtract" | "add"): Pt[] {
  if (!left.length || !right.length) return [];
  const sortedLeft = [...left].sort((a, b) => a.x - b.x);
  const sortedRight = right
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);
  if (!sortedRight.length) return [];

  // Carry-forward alignment: use latest available RHS value for each LHS point.
  // This keeps formula charts working when mixing daily crypto series with lower-frequency macro series.
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
    while (left + 1 < i && series[left + 1].x <= targetTs) {
      left += 1;
    }
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
  for (let i = 0; i < series.length; i += 1) {
    const v = series[i].y;
    queue.push(v);
    sum += v;
    if (queue.length > window) {
      const removed = queue.shift() ?? 0;
      sum -= removed;
    }
    if (queue.length < window) continue;
    out.push({ x: series[i].x, y: sum / queue.length });
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

const DERIVED_SPECIAL_CHART_IDS = new Set<string>([
  ...Array.from(ROI_SPECIAL_CHART_IDS),
  ...Array.from(INDICATOR_SPECIAL_CHART_IDS),
]);

function lookbackDaysForSpecialChart(defId: string, timeframeDays: number): number {
  if (defId === "historical_monthly_average_roi") return Math.max(timeframeDays, 730);
  if (defId === "monthly_average_roi") return Math.max(timeframeDays, 365);
  if (defId === "monthly_returns") return Math.max(timeframeDays + 45, 120);
  if (defId === "quarterly_returns") return Math.max(timeframeDays + 100, 240);
  if (defId === "average_daily_returns") return Math.max(timeframeDays + 7, 90);
  if (defId === "year_to_date_roi") return Math.max(timeframeDays, 730);
  if (defId === "roi_after_halving") return 1600;
  if (defId === "roi_after_cycle_bottom" || defId === "roi_after_bottom_multiple" || defId === "roi_after_bottom_pairs") {
    return 1800;
  }
  if (defId === "roi_after_cycle_peak" || defId === "roi_after_latest_cycle_peak_multi" || defId === "roi_after_latest_cycle_peak_pairs") {
    return 1800;
  }
  if (defId === "roi_after_sub_cycle_bottom") return 1200;
  if (defId === "roi_after_inception_multi" || defId === "roi_after_inception_pairs") {
    return Math.max(timeframeDays, 3650);
  }
  if (defId === "correlation_coefficients") return Math.max(timeframeDays, 1095);
  if (defId === "fear_greed_index") return Math.max(timeframeDays, 3650);
  if (defId === "transaction_fees") return Math.max(timeframeDays, 3650);
  if (defId === "logarithmic_regression" || defId === "fair_value_log_reg" || defId === "log_reg_rainbow") {
    return Math.max(timeframeDays, 3650);
  }
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
  if (defId === "monthly_average_roi") {
    return movingAverageSeries(rollingReturnSeries(baseSeries, 30), 30);
  }
  if (defId === "historical_monthly_average_roi") {
    return movingAverageSeries(rollingReturnSeries(baseSeries, 30), 180);
  }
  if (defId === "year_to_date_roi") {
    return anchorSeriesToRoi(baseSeries, yearStartTsForSeries(baseSeries));
  }
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

  const residuals = usable.map((row, i) => ys[i] - (intercept + slope * xs[i]));
  const residualMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const residualVar = residuals.reduce((a, b) => a + (b - residualMean) ** 2, 0) / residuals.length;
  const sigma = Math.sqrt(Math.max(0, residualVar));

  const trend: Pt[] = usable.map((row, i) => ({ x: row.x, y: Math.exp(intercept + slope * xs[i]) }));
  const fair: Pt[] = trend.map((row) => ({ x: row.x, y: row.y * Math.exp(-sigma) }));
  const trendByTs = seriesToMap(trend);
  const rainbow: Pt[] = usable.map((row) => {
    const base = trendByTs.get(row.x) ?? NaN;
    const y = Number.isFinite(base) && base > 0 ? ((row.y / base) - 1) * 100 : NaN;
    return { x: row.x, y };
  }).filter((row) => Number.isFinite(row.y));

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

  if (defId === "logarithmic_regression") {
    return computeLogRegressionSeries(btc).trend;
  }
  if (defId === "fair_value_log_reg") {
    return computeLogRegressionSeries(btc).fair;
  }
  if (defId === "log_reg_rainbow") {
    return computeLogRegressionSeries(btc).rainbow;
  }
  if (defId === "price_drawdown_from_ath") {
    let peak = Number.NEGATIVE_INFINITY;
    return btc.map((row) => {
      peak = Math.max(peak, row.y);
      const y = peak > 0 ? ((row.y / peak) - 1) * 100 : NaN;
      return { x: row.x, y };
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
    const aligned = alignSeriesWithCarry(btc, bandMid);
    return aligned
      .map((row) => ({ x: row.x, y: row.right === 0 ? NaN : ((row.left / row.right) - 1) * 100 }))
      .filter((row) => Number.isFinite(row.y));
  }
  if (defId === "pi_cycle_bottom_top") {
    const sma111 = movingAverageSeries(btc, 111);
    const sma350 = movingAverageSeries(btc, 350).map((row) => ({ x: row.x, y: row.y * 2 }));
    return mergeSeries(sma111, sma350, "divide").map((row) => ({ x: row.x, y: row.y * 100 }));
  }
  if (defId === "rsi") {
    return computeRsiSeries(btc, 14);
  }
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
        const topN = Number(topV);
        const botN = Number(botV);
        const midN = Number(midV);
        return { x: row.x, y: ((row.y - midN) / (topN - botN)) * 100 };
      })
      .filter((row) => Number.isFinite(row.y));
  }
  if (defId === "volatility") {
    const daily = dailyReturnSeries(btc);
    const vol = rollingStdDevSeries(daily, 30);
    return vol.map((row) => ({ x: row.x, y: row.y * Math.sqrt(365) }));
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
      if (!Number.isFinite(corr)) continue;
      out.push({ x: btcRet[i].x, y: corr });
    }
    return out;
  }

  return [];
}

function ensureRenderableSeries(series: Pt[]): Pt[] {
  if (!series.length) return [];
  if (series.length >= 2) return series;
  const row = series[0];
  return [
    { x: row.x - DAY_MS, y: row.y },
    row,
  ];
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
  if (def.type === "coingecko_market_chart") {
    const raw = await fetchCoinGeckoMarketChart({
      coinId: def.params.coinId,
      vsCurrency: currency.toLowerCase(),
      days: timeframeDays,
      metric: def.params.metric,
    });
    return limitToTimeframe(
      raw
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x),
      timeframeDays
    );
  }
  if (def.type === "fred_series") {
    const raw = await fetchFredSeries(def.params);
    return limitToTimeframe(
      raw
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x),
      timeframeDays
    );
  }
  if (def.type === "formula_chart" && DERIVED_SPECIAL_CHART_IDS.has(def.id)) {
    const specialLookbackDays = lookbackDaysForSpecialChart(def.id, timeframeDays);
    let derived: Pt[] = [];
    if (ROI_SPECIAL_CHART_IDS.has(def.id)) {
      const baseSeries = await loadSeries(def.params.leftId, currency, specialLookbackDays, depth + 1, nextVisited);
      derived = buildSpecialRoiSeries(def.id, baseSeries);
      if (derived.length < 2 && baseSeries.length) {
        derived = anchorSeriesToRoi(baseSeries, baseSeries[0].x);
      }
    } else {
      derived = await buildSpecialIndicatorSeries(def.id, currency, specialLookbackDays, depth + 1, nextVisited);
    }
    return ensureRenderableSeries(limitToTimeframe(derived, timeframeDays));
  }
  const left = await loadSeries(def.params.leftId, currency, timeframeDays, depth + 1, nextVisited);
  const right = await loadSeries(def.params.rightId, currency, timeframeDays, depth + 1, nextVisited);
  const merged = mergeSeries(left, right, def.params.operation);
  if (merged.length >= 2) return ensureRenderableSeries(merged);
  return [];
}

export default function ChartDetail() {
  const params = useLocalSearchParams();
  const id = String(params.id ?? "");
  const chartDef = useMemo(() => CHARTS.find((c) => c.id === id), [id]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isChartSaved, toggleChart } = useWatchlist();
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const { addAlert } = usePriceAlerts();
  const colors = useAppColors();

  const isCrypto = chartDef?.type === "coingecko_market_chart";
  const maxSupportedDays = useMemo<TimeframeDays>(() => {
    if (!chartDef) return DEFAULT_SUPPORTED_DAYS;
    return maxSupportedDaysForChart(chartDef.id);
  }, [chartDef]);

  const [timeframeDays, setTimeframeDays] = useState<TimeframeDays>(
    chartDef?.type === "coingecko_market_chart" ? chartDef.params.defaultDays : settings.defaultTimeframeDays
  );
  const [chartMode, setChartMode] = useState<"simple" | "pro">(settings.chartModeDefault);
  const [visual, setVisual] = useState<"line" | "bar">(settings.simpleChartTypeDefault);
  const [density, setDensity] = useState<"low" | "medium" | "high">(settings.simpleChartDensity);
  const [showPoints, setShowPoints] = useState(settings.simpleChartPoints);
  const [curved, setCurved] = useState(settings.simpleChartCurved);
  const [normalize, setNormalize] = useState(settings.simpleChartNormalize);
  const [showLabels, setShowLabels] = useState(settings.simpleChartShowLabels);
  const [showControls, setShowControls] = useState(false);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [priceAlertInput, setPriceAlertInput] = useState("");
  const [relativeAlertInput, setRelativeAlertInput] = useState("5");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<Pt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const initializedChartIdRef = useRef<string>("");
  const [timeframeAvailability, setTimeframeAvailability] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!chartDef) return;
    if (initializedChartIdRef.current === chartDef.id) return;
    initializedChartIdRef.current = chartDef.id;
    const preferred = chartDef.type === "coingecko_market_chart"
      ? chartDef.params.defaultDays
      : settings.defaultTimeframeDays;
    const clamped = clampToSupportedTimeframe(Math.min(preferred, maxSupportedDays));
    setTimeframeDays(clamped);
    setShowControls(false);
  }, [chartDef, maxSupportedDays, settings.defaultTimeframeDays]);

  useEffect(() => {
    if (!chartDef || chartDef.type === "coingecko_market_chart") return;
    const clamped = clampToSupportedTimeframe(Math.min(settings.defaultTimeframeDays, maxSupportedDays));
    setTimeframeDays(clamped);
  }, [chartDef, settings.defaultTimeframeDays, maxSupportedDays]);

  useEffect(() => {
    let active = true;
    if (!chartDef || chartMode !== "simple") return () => { active = false; };

    const baseline = Object.fromEntries(TIMEFRAMES.map((row) => [row.days, row.days <= maxSupportedDays]));
    setTimeframeAvailability(baseline);

    const probe = async () => {
      const next: Record<number, boolean> = { ...baseline };
      try {
        const probeSeries = await loadSeries(chartDef.id, settings.currency, maxSupportedDays);
        for (const tf of TIMEFRAMES) {
          if (tf.days > maxSupportedDays) {
            next[tf.days] = false;
            continue;
          }
          next[tf.days] = hasEnoughFreshPoints(probeSeries, tf.days);
        }
      } catch {
        for (const tf of TIMEFRAMES) {
          if (tf.days > maxSupportedDays) next[tf.days] = false;
        }
      }
      if (!active) return;
      setTimeframeAvailability(next);
    };

    void probe();
    return () => {
      active = false;
    };
  }, [chartDef, chartMode, maxSupportedDays, settings.currency]);

  const load = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      setErr(null);
      if (!chartDef) throw new Error("Chart not found");

      let converted = await loadSeries(chartDef.id, settings.currency, timeframeDays);
      if (converted.length < 2) {
        const retryDays = Math.max(timeframeDays, maxSupportedDaysForChart(chartDef.id));
        converted = await loadSeries(chartDef.id, settings.currency, retryDays);
      }
      if (converted.length < 2) {
        const fallbackDays = 365;
        converted = await loadSeries(chartDef.id, settings.currency, fallbackDays);
      }
      if (converted.length < 1) throw new Error("Not enough data points returned");
      if (converted.length === 1) {
        converted = ensureRenderableSeries(converted);
      }

      setData(converted);
      setSelectedIndex(converted.length - 1);
      setLastUpdatedAt(Date.now());
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chartDef, settings.currency, timeframeDays]);

  useEffect(() => {
    if (!chartDef) return;
    if (chartMode === "pro") {
      setLoading(false);
      return;
    }
    void load(false);
  }, [load, id, chartMode, chartDef, timeframeDays]);

  const availableTimeframes = useMemo(() => {
    return TIMEFRAMES.map((row) => {
      const probed = timeframeAvailability[row.days];
      const unavailable = row.days > maxSupportedDays || probed === false;
      return { ...row, unavailable };
    });
  }, [maxSupportedDays, timeframeAvailability]);

  const timeframeData = useMemo(() => limitToTimeframe(data, timeframeDays), [data, timeframeDays]);

  const viewData = useMemo(() => {
    const sampled = downsample(timeframeData, density);
    if (!normalize || sampled.length < 2) return sampled;

    const base = sampled[0].y || 1;
    return sampled.map((p) => ({ ...p, y: (p.y / base) * 100 }));
  }, [timeframeData, density, normalize]);

  useEffect(() => {
    if (!viewData.length) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex((prev) => {
      if (prev === null) return viewData.length - 1;
      return Math.max(0, Math.min(viewData.length - 1, prev));
    });
  }, [viewData.length]);

  const stats = useMemo(() => {
    if (!viewData.length) return null;
    const first = viewData[0].y;
    const last = viewData[viewData.length - 1].y;
    const min = viewData.reduce((acc, point) => Math.min(acc, point.y), Number.POSITIVE_INFINITY);
    const max = viewData.reduce((acc, point) => Math.max(acc, point.y), Number.NEGATIVE_INFINITY);
    const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
    const avg = viewData.reduce((sum, point) => sum + point.y, 0) / viewData.length;
    const startTs = viewData[0].x;
    const endTs = viewData[viewData.length - 1].x;

    return { first, last, min, max, avg, changePct, startTs, endTs, points: viewData.length };
  }, [viewData]);

  const formatXAxis = useCallback((ts: number): string => {
    if (timeframeDays <= 1) {
      return new Date(ts).toLocaleTimeString(settings.language, { hour: "2-digit", minute: "2-digit" });
    }
    if (timeframeDays <= 30) {
      return new Date(ts).toLocaleDateString(settings.language, { month: "short", day: "numeric" });
    }
    return new Date(ts).toLocaleDateString(settings.language, { month: "short", year: "2-digit" });
  }, [settings.language, timeframeDays]);
  const isUp = (stats?.changePct ?? 0) >= 0;
  const valueFormat = normalize ? "index" : chartDef?.valueFormat ?? "number";
  const chartWidth = Math.max(220, width - 14 * 2 - 8 * 2 - 2);
  const yAxisWidth = 52;
  const chartInnerWidth = Math.max(160, chartWidth - yAxisWidth);
  const selectedPoint = selectedIndex !== null ? (viewData[selectedIndex] ?? null) : null;
  const barStats = useMemo(() => {
    if (!viewData.length) return null;
    const min = Math.min(...viewData.map((p) => p.y));
    const max = Math.max(...viewData.map((p) => p.y));
    const range = Math.max(max - min, 1);
    return { min, max, range };
  }, [viewData]);
  const barWidthPx = Math.max(2, Math.floor((chartInnerWidth - 16) / Math.max(viewData.length, 30)) - 1);
  const selectedValueLabel = selectedPoint ? formatValue(selectedPoint.y, valueFormat, settings.currency) : null;
  const selectedDateLabel = selectedPoint ? new Date(selectedPoint.x).toLocaleDateString(settings.language, { year: "numeric", month: "short", day: "numeric" }) : null;
  const axisStartLabel = viewData.length ? formatXAxis(viewData[0].x) : "Start";
  const axisMidLabel = viewData.length ? formatXAxis(viewData[Math.floor((viewData.length - 1) / 2)].x) : "Mid";
  const axisEndLabel = viewData.length ? formatXAxis(viewData[viewData.length - 1].x) : "End";
  const selectedX = selectedIndex === null || viewData.length < 2 ? null : Math.round((selectedIndex / (viewData.length - 1)) * Math.max(chartInnerWidth - 1, 1));
  const yTicks = useMemo(() => {
    const max = stats?.max ?? 0;
    const min = stats?.min ?? 0;
    const range = Math.max(max - min, 1e-9);
    return Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4;
      const v = max - ratio * range;
      return { value: v, topPct: ratio * 100 };
    });
  }, [stats]);

  const selectNearestFromX = useCallback((x: number) => {
    if (!viewData.length) return;
    const clamped = Math.max(0, Math.min(chartInnerWidth, x));
    const idx = Math.round((clamped / Math.max(chartInnerWidth, 1)) * Math.max(viewData.length - 1, 0));
    setSelectedIndex(Math.max(0, Math.min(viewData.length - 1, idx)));
  }, [viewData, chartInnerWidth]);

  const tradingSymbol = useMemo(() => {
    if (!chartDef) return "";
    if (chartDef.type !== "coingecko_market_chart") return tradingSymbolForChartId(id);
    if (chartDef.params.metric === "market_caps") return tradingMarketCapSymbolForCoinId(chartDef.params.coinId);
    return tradingSymbolForCoinId(chartDef.params.coinId, settings.currency);
  }, [chartDef, id, settings.currency]);

  const alertAsset = useMemo(() => {
    if (!chartDef) return null;
    if (chartDef.type === "coingecko_market_chart") {
      return {
        assetId: chartDef.params.coinId,
        coinGeckoId: chartDef.params.coinId,
        kind: "crypto" as const,
        symbol: chartDef.params.coinId.toUpperCase(),
        name: chartDef.title,
      };
    }
    if (!tradingSymbol) return null;
    if (chartDef.category !== "Stocks") return null;
    const symbolRaw = tradingSymbol.includes(":") ? tradingSymbol.split(":")[1] : tradingSymbol;
    const symbol = symbolRaw.split(/[./]/)[0]?.replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
    if (!symbol) return null;
    return {
      assetId: symbol,
      kind: "stock" as const,
      symbol,
      name: chartDef.title,
    };
  }, [chartDef, tradingSymbol]);

  useEffect(() => {
    if (!stats?.last || !Number.isFinite(stats.last)) return;
    setPriceAlertInput((prev) => (prev.trim() ? prev : stats.last.toFixed(2)));
  }, [stats?.last]);

  useEffect(() => {
    if (chartMode === "pro" && !tradingSymbol) {
      setChartMode("simple");
      update("chartModeDefault", "simple");
    }
  }, [chartMode, tradingSymbol, update]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 26 }}>
      <LinearGradient
        colors={["#1A1334", "#0E1020", "#090A11"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderBottomLeftRadius: 24, borderBottomRightRadius: 24, padding: 16, paddingTop: insets.top + 8, paddingBottom: 18 }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900" }}>
          {chartDef?.title ?? "Chart"}
        </Text>

        {!!chartDef?.description && (
          <Text style={{ color: "#C4C8DC", marginTop: 8, lineHeight: 19 }}>
            {chartDef.description}
          </Text>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {!!lastUpdatedAt && (
            <Text style={{ color: "#9AA2C8" }}>
              Updated {new Date(lastUpdatedAt).toLocaleTimeString(settings.language)}
            </Text>
          )}

          {!!chartDef && (
            <Pressable
              onPress={() => toggleChart(chartDef.id)}
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1,
                borderColor: isChartSaved(chartDef.id) ? "#7361C9" : "#3B3E56",
                backgroundColor: pressed ? "#1A1D34" : isChartSaved(chartDef.id) ? "#221A44" : "#141628",
                paddingHorizontal: 10,
                paddingVertical: 6,
              })}
            >
              <Text style={{ color: isChartSaved(chartDef.id) ? "#C3B5FF" : "#E4E8FF", fontWeight: "700", fontSize: 12 }}>
                {isChartSaved(chartDef.id) ? "Saved" : "Save"}
              </Text>
            </Pressable>
          )}

          {!!chartDef && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([
                ["simple", "Simple"],
                ["pro", "Pro"],
              ] as const).map(([value, label]) => {
                const active = chartMode === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setChartMode(value);
                      update("chartModeDefault", value);
                    }}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? "#7361C9" : "#3B3E56",
                      backgroundColor: pressed ? "#1A1D34" : active ? "#221A44" : "#141628",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: active ? "#C3B5FF" : "#E4E8FF", fontWeight: "700", fontSize: 12 }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 14, marginTop: 14 }}>
        {chartMode === "simple" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {availableTimeframes.map((tf) => {
              const active = tf.days === timeframeDays;
              return (
                <Pressable
                  key={tf.days}
                  onPress={() => {
                    if (tf.unavailable) return;
                    setTimeframeDays(tf.days);
                    setShowTimeMenu(false);
                    if (!isCrypto) update("defaultTimeframeDays", tf.days);
                  }}
                  disabled={tf.unavailable}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    opacity: tf.unavailable ? 0.42 : 1,
                  })}
                >
                  <Text style={{ color: active ? "#B79DFF" : "#D7D7EA", fontWeight: "700", fontSize: 12 }}>
                    {tf.label}
                  </Text>
                </Pressable>
              );
            })}

            {availableTimeframes.length > 5 && (
              <Pressable
                onPress={() => setShowTimeMenu((v) => !v)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#5F43B2",
                  backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>
                  More ranges
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setShowControls((v) => !v)}
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#5F43B2",
                backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                paddingHorizontal: 10,
                paddingVertical: 6,
              })}
            >
              <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>
                {showControls ? "Hide controls" : "More controls"}
              </Text>
            </Pressable>
          </View>
        )}

        {showTimeMenu && chartMode === "simple" && (
          <View style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {availableTimeframes.map((tf) => {
              const active = tf.days === timeframeDays;
              return (
                <Pressable
                  key={`m_${tf.days}`}
                  onPress={() => {
                    if (tf.unavailable) return;
                    setTimeframeDays(tf.days);
                    setShowTimeMenu(false);
                    if (!isCrypto) update("defaultTimeframeDays", tf.days);
                  }}
                  disabled={tf.unavailable}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    opacity: tf.unavailable ? 0.42 : 1,
                  })}
                >
                  <Text style={{ color: active ? "#B79DFF" : "#D7D7EA", fontWeight: "700", fontSize: 12 }}>{tf.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {showControls && chartMode === "simple" && (
          <View style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 12,
            marginBottom: 12,
            gap: 8,
          }}>
            <Text style={{ color: "#C8CEE8", fontWeight: "700" }}>Chart controls</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {([
                ["line", "Line"],
                ["bar", "Bar"],
              ] as const).map(([v, l]) => {
                const active = visual === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => {
                      setVisual(v);
                      update("simpleChartTypeDefault", v);
                    }}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? "#5F43B2" : colors.border,
                      backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: active ? "#B79DFF" : "#D7D7EA", fontWeight: "700", fontSize: 12 }}>{l}</Text>
                  </Pressable>
                );
              })}

              {([
                ["low", "Low density"],
                ["medium", "Medium density"],
                ["high", "High density"],
              ] as const).map(([v, l]) => {
                const active = density === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => {
                      setDensity(v);
                      update("simpleChartDensity", v);
                    }}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? "#5F43B2" : colors.border,
                      backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: active ? "#B79DFF" : "#D7D7EA", fontWeight: "700", fontSize: 12 }}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {([
                ["Curved", curved, setCurved, "simpleChartCurved"],
                ["Points", showPoints, setShowPoints, "simpleChartPoints"],
                ["Normalize", normalize, setNormalize, "simpleChartNormalize"],
                ["Labels", showLabels, setShowLabels, "simpleChartShowLabels"],
              ] as const).map(([label, active, setter, settingKey]) => (
                <Pressable
                  key={label}
                  onPress={() => {
                    const next = !active;
                    setter(next);
                    update(settingKey, next);
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  })}
                >
                  <Text style={{ color: active ? "#B79DFF" : "#D7D7EA", fontWeight: "700", fontSize: 12 }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!!stats && chartMode === "simple" && (
          <View style={{ marginBottom: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "High", value: formatValue(stats.max, valueFormat, settings.currency) },
              { label: "Avg", value: formatValue(stats.avg, valueFormat, settings.currency) },
              { label: "Low", value: formatValue(stats.min, valueFormat, settings.currency) },
            ].map((row) => (
              <View key={row.label} style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{row.label}</Text>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {chartMode === "pro" ? (
          <TradingViewChart
            key={`${id}:${tradingSymbol}:${settings.chartInterval}:${settings.language}:${settings.chartTheme}`}
            symbol={tradingSymbol}
            interval={settings.chartInterval}
            locale={settings.language}
            theme={settings.chartTheme}
            showVolume={settings.showVolumeOnProChart}
            showIndicators={settings.showIndicatorsOnProChart}
          />
        ) : loading ? (
          <View style={{ minHeight: 340, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#8B5CF6" />
          </View>
        ) : err ? (
          <View style={{ borderWidth: 1, borderColor: "#472124", borderRadius: 12, backgroundColor: "#281316", padding: 14 }}>
            <Text style={{ color: "#FFB4BA" }}>{err}</Text>
          </View>
        ) : (
          <View style={{ borderRadius: 16, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingVertical: 10, paddingHorizontal: 8 }}>
            <View style={{ width: chartWidth }}>
              <View style={{ flexDirection: "row", alignItems: "stretch", gap: 6 }}>
                <View style={{ width: yAxisWidth, height: 300, justifyContent: "space-between", paddingVertical: 2 }}>
                  {yTicks.map((tick, idx) => (
                    <Text key={`yt_${idx}`} style={{ color: colors.subtext, fontSize: 11, textAlign: "right" }}>
                      {formatValue(tick.value, valueFormat, settings.currency)}
                    </Text>
                  ))}
                </View>

                <View
                  style={{
                    width: chartInnerWidth,
                    height: 300,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.dark ? "#252A3D" : "#D7E3F5",
                    backgroundColor: colors.dark ? "#0E1320" : "#F7FAFF",
                    overflow: "hidden",
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) => selectNearestFromX(e.nativeEvent.locationX)}
                  onResponderMove={(e) => selectNearestFromX(e.nativeEvent.locationX)}
                >
                  <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                    {yTicks.map((tick, idx) => (
                      <View
                        key={`grid_${idx}`}
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: `${tick.topPct}%`,
                          borderTopWidth: 1,
                          borderTopColor: colors.dark ? "rgba(130,140,170,0.22)" : "rgba(108,126,162,0.28)",
                        }}
                      />
                    ))}
                  </View>

                  {visual === "bar" ? (
                    <View style={{ height: "100%", flexDirection: "row", alignItems: "flex-end", gap: 1, paddingHorizontal: 4, paddingBottom: 4 }}>
                      {!!barStats && viewData.map((point, index) => {
                        const normalized = (point.y - barStats.min) / barStats.range;
                        const height = Math.max(2, Math.round(normalized * 286));
                        const active = selectedIndex === index;
                        return (
                          <Pressable
                            key={`bar_${index}`}
                            onPress={() => setSelectedIndex(index)}
                            style={{
                              width: barWidthPx,
                              height,
                              borderRadius: 3,
                              backgroundColor: active ? "#D2B8FF" : point.y >= 0 ? "#8B5CF6" : "#FF7389",
                              opacity: active ? 1 : 0.9,
                            }}
                          />
                        );
                      })}
                    </View>
                  ) : (
                    <SimpleSeriesChart
                      values={viewData.map((p) => p.y)}
                      width={chartInnerWidth}
                      height={300}
                      color="#8B5CF6"
                      showPoints={showPoints}
                    />
                  )}

                  {selectedX !== null && (
                    <View pointerEvents="none" style={{ position: "absolute", left: Math.max(0, Math.min(chartInnerWidth - 1, selectedX)), top: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: colors.dark ? "rgba(196,176,255,0.75)" : "rgba(95,67,178,0.7)" }} />
                  )}

                  {!!selectedPoint && selectedX !== null && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 8,
                        left: Math.max(6, Math.min(chartInnerWidth - 152, selectedX - 70)),
                        width: 146,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.dark ? "#343C59" : "#C7D6ED",
                        backgroundColor: colors.dark ? "#121726" : "#FFFFFF",
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>
                        {formatValue(selectedPoint.y, valueFormat, settings.currency)}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>
                        {new Date(selectedPoint.x).toLocaleDateString(settings.language, { year: "numeric", month: "short", day: "numeric" })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", paddingLeft: yAxisWidth + 4 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{axisStartLabel}</Text>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{showLabels ? axisMidLabel : ""}</Text>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{axisEndLabel}</Text>
              </View>
            </View>
          </View>
        )}

        {!!selectedValueLabel && !!selectedDateLabel && chartMode === "simple" && (
          <View style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Selected: {selectedValueLabel}</Text>
            <Text style={{ color: colors.subtext, marginTop: 2 }}>{selectedDateLabel}</Text>
          </View>
        )}

        {!!stats && !loading && !err && chartMode === "simple" && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
              <Text style={{ color: "#B8B8C5" }}>Current Value</Text>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", marginTop: 6 }}>
                {formatValue(stats.last, valueFormat, settings.currency)}
              </Text>
              <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", marginTop: 4, fontWeight: "700" }}>
                {isUp ? "+" : ""}{stats.changePct.toFixed(2)}%
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
                <Text style={{ color: "#B8B8C5" }}>Low</Text>
                <Text style={{ color: "#CFCFDE", fontSize: 16, fontWeight: "700", marginTop: 6 }}>{formatValue(stats.min, valueFormat, settings.currency)}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
                <Text style={{ color: "#B8B8C5" }}>High</Text>
                <Text style={{ color: "#CFCFDE", fontSize: 16, fontWeight: "700", marginTop: 6 }}>{formatValue(stats.max, valueFormat, settings.currency)}</Text>
              </View>
            </View>

            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
              <Text style={{ color: "#B8B8C5" }}>Context</Text>
              <Text style={{ color: "#CFCFDE", marginTop: 6, fontWeight: "700" }}>
                Avg {formatValue(stats.avg, valueFormat, settings.currency)} • {stats.points} points
              </Text>
              <Text style={{ color: "#9CA3C8", marginTop: 4 }}>
                {new Date(stats.startTs).toLocaleDateString()} - {new Date(stats.endTs).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}

        {(chartMode === "simple" || !isCrypto) && (
          <Pressable
            onPress={() => {
              void load(true);
            }}
            disabled={loading || refreshing}
            style={({ pressed }) => ({
              marginTop: 14,
              alignSelf: "flex-start",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : colors.surface,
              opacity: loading ? 0.7 : 1,
            })}
          >
            <Text style={{ color: "#D7D7EA", fontWeight: "600" }}>
              {refreshing ? "Refreshing..." : "Refresh chart"}
            </Text>
          </Pressable>
        )}

        {!!alertAsset && (
          <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
            <Pressable
              onPress={() => setShowAlertPanel((v) => !v)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : colors.surface,
              })}
            >
              <View>
                <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Alert Management", "Alarmverwaltung")}</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                  {alertAsset.symbol} • {alertAsset.name}
                </Text>
              </View>
              <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>
                {showAlertPanel ? t("Hide", "Ausblenden") : t("Show", "Anzeigen")}
              </Text>
            </Pressable>

            {showAlertPanel && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 10, gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {([
                    ["above", t("Above", "Oberhalb")],
                    ["below", t("Below", "Unterhalb")],
                  ] as const).map(([value, label]) => {
                    const active = alertDirection === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setAlertDirection(value)}
                        style={({ pressed }) => ({
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? "#5F43B2" : colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        })}
                      >
                        <Text style={{ color: active ? "#B79DFF" : colors.text, fontWeight: "700", fontSize: 12 }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <FormInput
                  label={t("Price Target", "Preisziel")}
                  value={priceAlertInput}
                  onChangeText={setPriceAlertInput}
                  keyboardType="decimal-pad"
                  placeholder={t("Enter target price", "Zielpreis eingeben")}
                />
                <ActionButton
                  label={t("Add price alert", "Preisalarm hinzufuegen")}
                  onPress={() => {
                    const target = Number(priceAlertInput);
                    if (!Number.isFinite(target) || target <= 0) {
                      Alert.alert(t("Invalid target", "Ungueltiges Ziel"), t("Enter a valid target price.", "Bitte gueltigen Zielpreis eingeben."));
                      return;
                    }
                    addAlert({
                      ...alertAsset,
                      mode: "price",
                      targetPrice: target,
                      direction: alertDirection,
                    });
                    Alert.alert(t("Alert added", "Alarm hinzugefuegt"), `${alertAsset.symbol} ${alertDirection === "above" ? ">" : "<"} ${target.toFixed(2)}`);
                  }}
                />

                <FormInput
                  label={t("Relative Change %", "Relative Veraenderung %")}
                  value={relativeAlertInput}
                  onChangeText={setRelativeAlertInput}
                  keyboardType="decimal-pad"
                  placeholder={t("Enter percent change", "Prozentveraenderung eingeben")}
                />
                <ActionButton
                  label={t("Add relative alert", "Relativen Alarm hinzufuegen")}
                  onPress={() => {
                    const pct = Number(relativeAlertInput);
                    const baseline = Number(stats?.last ?? selectedPoint?.y ?? 0);
                    if (!Number.isFinite(pct) || Math.abs(pct) <= 0 || !Number.isFinite(baseline) || baseline <= 0) {
                      Alert.alert(
                        t("Invalid input", "Ungueltige Eingabe"),
                        t("Enter a valid percent and ensure chart price is available.", "Bitte gueltigen Prozentwert eingeben und sicherstellen, dass Chartpreis verfuegbar ist.")
                      );
                      return;
                    }
                    addAlert({
                      ...alertAsset,
                      mode: "relative_change",
                      direction: alertDirection,
                      relativeChangePct: Math.abs(pct),
                      baselinePrice: baseline,
                    });
                    Alert.alert(
                      t("Relative alert added", "Relativer Alarm hinzugefuegt"),
                      `${alertAsset.symbol} ${alertDirection === "above" ? "+" : "-"}${Math.abs(pct).toFixed(2)}%`
                    );
                  }}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
