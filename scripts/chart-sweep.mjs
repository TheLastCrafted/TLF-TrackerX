#!/usr/bin/env node

import fs from "node:fs";

const APP_BASE = process.env.CHART_SWEEP_BASE_URL || "https://tlf-trackerx.vercel.app";
const TIMEFRAMES = [1, 7, 30, 365, 1825, 3650, 7300, 18250];
const PASS_COUNT = Math.max(1, Number(process.env.CHART_SWEEP_PASSES || "2"));
const DAY_MS = 24 * 60 * 60 * 1000;
const COINGECKO_MIN_GAP_MS = 500;
const COINGECKO_MAX_GAP_MS = 2200;
let adaptiveCoinGeckoGapMs = COINGECKO_MIN_GAP_MS;
let nextCoinGeckoAt = 0;

const BTC_HALVING_DATES = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"];
const BTC_CYCLE_BOTTOM_DATES = ["2015-01-14", "2018-12-15", "2022-11-21"];
const BTC_CYCLE_PEAK_DATES = ["2013-12-04", "2017-12-17", "2021-11-10", "2024-03-14"];
const BTC_SUB_CYCLE_BOTTOM_DATES = ["2019-12-18", "2023-09-11"];

const ROI_SPECIAL_IDS = new Set([
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

const INDICATOR_SPECIAL_IDS = new Set([
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

function parseTrackedCoins() {
  const src = fs.readFileSync("src/catalog/coins.ts", "utf8");
  const coins = [...src.matchAll(/\{\s*id:\s*"([^"]+)",\s*symbol:\s*"([^"]+)"/g)].map((m) => ({
    id: m[1],
    symbol: m[2],
  }));
  return coins;
}

function parseFredDefs() {
  const src = fs.readFileSync("src/catalog/charts.ts", "utf8");
  const rows = [...src.matchAll(/fred\(\{\s*id:\s*"([^"]+)"[\s\S]*?seriesId:\s*"([^"]+)"(?:[\s\S]*?days:\s*([^,\n}]+))?[\s\S]*?\}\)/g)];
  return rows.map((m) => ({
    id: m[1],
    type: "fred",
    seriesId: m[2],
    days: Number(m[3]?.replace(/[^0-9]/g, "") || "3650") || 3650,
  }));
}

function parseFormulaDefs() {
  const src = fs.readFileSync("src/catalog/charts.ts", "utf8");
  const rows = [...src.matchAll(/formula\(\{\s*id:\s*"([^"]+)"[\s\S]*?leftId:\s*"([^"]+)"[\s\S]*?rightId:\s*"([^"]+)"[\s\S]*?operation:\s*"([^"]+)"[\s\S]*?\}\)/g)];
  return rows.map((m) => ({
    id: m[1],
    type: "formula",
    leftId: m[2],
    rightId: m[3],
    op: m[4],
  }));
}

function buildCoinDefs() {
  const coins = parseTrackedCoins();
  const out = [];
  for (const c of coins) {
    const sym = c.symbol.toLowerCase();
    out.push({ id: `${sym}_price_usd`, type: "coingecko", coinId: c.id, metric: "prices" });
    out.push({ id: `${sym}_market_cap_usd`, type: "coingecko", coinId: c.id, metric: "market_caps" });
    out.push({ id: `${sym}_volume_usd`, type: "coingecko", coinId: c.id, metric: "total_volumes" });
  }
  return out;
}

const chartDefs = [...parseFredDefs(), ...parseFormulaDefs(), ...buildCoinDefs()];
const chartById = new Map(chartDefs.map((row) => [row.id, row]));

const FRED_SERIES_FALLBACKS = {
  SLUEM1524QEZS: { seriesId: "LRUN24TTEZA156S" },
  PRINTO01EZM661N: { seriesId: "EA19PRINTO01IXOBSAM" },
  PRCNTO01EZM661N: { seriesId: "EA19PRCNTO01IXOBSAM" },
  SBOITOTLUSQ163N: { seriesId: "BSCICP03USM665S" },
  JTU480099UPL: { seriesId: "JTSLDL" },
  NAPM: { seriesId: "IPMAN" },
  NAPMS: { seriesId: "CSCICP03USM665S" },
  SP500DY: { seriesId: "M1346AUSM156NNBR" },
  SP500PE: { seriesId: "A13049USA156NNBR", transform: (y) => (y === 0 ? NaN : 100 / y) },
  WILL5000INDFC: { seriesId: "NASDAQNQUS500LCT" },
  WILLMIDCAP: { seriesId: "NASDAQNQUSS" },
  GOLDAMGBD228NLBM: { stooqSymbol: "xauusd" },
  SLVPRUSD: { stooqSymbol: "xagusd" },
};

const httpCache = new Map();
async function fetchViaProxy(url) {
  const key = `proxy:${url}`;
  if (httpCache.has(key)) return httpCache.get(key);
  const proxyUrl = `${APP_BASE}/api/http?url=${encodeURIComponent(url)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  const res = await fetch(proxyUrl, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`proxy_${res.status}`);
  const text = await res.text();
  httpCache.set(key, text);
  return text;
}

const fearGreedCache = new Map();
async function fetchFearGreedSeries(timeframeDays) {
  const key = `fng:${timeframeDays}`;
  if (fearGreedCache.has(key)) return fearGreedCache.get(key);
  const raw = await fetchViaProxy("https://api.alternative.me/fng/?limit=0&format=json");
  const json = JSON.parse(raw);
  const rows = Array.isArray(json?.data) ? json.data : [];
  const out = rows
    .map((row) => ({ x: Number(row?.timestamp) * 1000, y: Number(row?.value) }))
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort((a, b) => a.x - b.x);
  const limited = limitToTimeframe(out, timeframeDays);
  fearGreedCache.set(key, limited);
  return limited;
}

const btcFeesCache = new Map();
async function fetchBtcFeesSeries(timeframeDays) {
  const key = `fees:${timeframeDays}`;
  if (btcFeesCache.has(key)) return btcFeesCache.get(key);
  const raw = await fetchViaProxy("https://api.blockchain.info/charts/transaction-fees-usd?timespan=all&sampled=false&metadata=false&format=json");
  const json = JSON.parse(raw);
  const rows = Array.isArray(json?.values) ? json.values : [];
  const out = rows
    .map((row) => ({ x: Number(row?.x) * 1000, y: Number(row?.y) }))
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort((a, b) => a.x - b.x);
  const limited = limitToTimeframe(out, timeframeDays);
  btcFeesCache.set(key, limited);
  return limited;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitCoinGeckoSlot() {
  const waitMs = Math.max(0, nextCoinGeckoAt - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  nextCoinGeckoAt = Date.now() + adaptiveCoinGeckoGapMs;
}

function parseFredCsv(csv, timeframeDays) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const points = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const dateStr = line.slice(0, comma).trim();
    const valStr = line.slice(comma + 1).trim();
    if (!dateStr || !valStr || valStr === ".") continue;
    const x = new Date(dateStr).getTime();
    const y = Number(valStr);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  points.sort((a, b) => a.x - b.x);
  return limitToTimeframe(points, timeframeDays);
}

function parseStooqCsv(csv, timeframeDays) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const points = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    const x = Date.parse(`${cols[0]}T00:00:00Z`);
    const y = Number(cols[4]);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  points.sort((a, b) => a.x - b.x);
  return limitToTimeframe(points, timeframeDays);
}

const cgCache = new Map();
const cgSimpleSnapshotCache = new Map();

async function fetchCoinGeckoSimpleSnapshot(coinId) {
  if (cgSimpleSnapshotCache.has(coinId)) return cgSimpleSnapshotCache.get(coinId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await waitCoinGeckoSlot();
      const raw = await fetchViaProxy(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`
      );
      const json = JSON.parse(raw);
      if (json?.status?.error_code === 429) {
        adaptiveCoinGeckoGapMs = Math.min(COINGECKO_MAX_GAP_MS, Math.max(1200, Math.floor(adaptiveCoinGeckoGapMs * 1.5)));
        await sleep(450 + attempt * 180);
        continue;
      }
      const row = json?.[coinId] || {};
      const out = {
        price: Number(row?.usd) || 0,
        marketCap: Number(row?.usd_market_cap) || 0,
        volume24h: Number(row?.usd_24h_vol) || 0,
      };
      cgSimpleSnapshotCache.set(coinId, out);
      return out;
    } catch {
      adaptiveCoinGeckoGapMs = Math.min(COINGECKO_MAX_GAP_MS, Math.floor(adaptiveCoinGeckoGapMs * 1.2));
      await sleep(280 + attempt * 150);
    }
  }
  const empty = { price: 0, marketCap: 0, volume24h: 0 };
  cgSimpleSnapshotCache.set(coinId, empty);
  return empty;
}

async function fetchCoinGeckoSeries(coinId, metric, timeframeDays) {
  const key = `${coinId}:${metric}`;
  if (!cgCache.has(key)) {
    let json = null;
    for (const days of [3650, 365]) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await waitCoinGeckoSlot();
          const raw = await fetchViaProxy(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`);
          json = JSON.parse(raw);
          if (json?.status?.error_code === 429) {
            adaptiveCoinGeckoGapMs = Math.min(COINGECKO_MAX_GAP_MS, Math.max(1200, Math.floor(adaptiveCoinGeckoGapMs * 1.5)));
            await sleep(420 + attempt * 220);
            continue;
          }
          adaptiveCoinGeckoGapMs = Math.max(COINGECKO_MIN_GAP_MS, Math.floor(adaptiveCoinGeckoGapMs * 0.9));
          if (json && Array.isArray(json[metric]) && json[metric].length) break;
        } catch {
          adaptiveCoinGeckoGapMs = Math.min(COINGECKO_MAX_GAP_MS, Math.floor(adaptiveCoinGeckoGapMs * 1.2));
          await sleep(260 + attempt * 170);
        }
      }
      if (json && Array.isArray(json[metric]) && json[metric].length) break;
    }
    cgCache.set(key, json || {});
  }
  const json = cgCache.get(key) || {};
  const rows = Array.isArray(json[metric]) ? json[metric] : [];
  const points = rows
    .map((row) => ({ x: Number(row?.[0]), y: Number(row?.[1]) }))
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
    .sort((a, b) => a.x - b.x);
  if (points.length >= 2) return limitToTimeframe(points, timeframeDays);

  const snapshot = await fetchCoinGeckoSimpleSnapshot(coinId);
  const value = metric === "prices"
    ? snapshot.price
    : metric === "market_caps"
      ? snapshot.marketCap
      : snapshot.volume24h;
  if (Number.isFinite(value) && value > 0) {
    const now = Date.now();
    const earlier = now - Math.max(1, timeframeDays) * DAY_MS;
    return [{ x: earlier, y: value }, { x: now, y: value }];
  }
  return [];
}

function limitToTimeframe(data, timeframeDays) {
  if (!data.length) return [];
  const since = Date.now() - timeframeDays * DAY_MS;
  const filtered = data.filter((point) => point.x >= since);
  if (filtered.length >= 2) return filtered;
  return data.slice(-Math.min(12, data.length));
}

function mergeSeries(left, right, op) {
  if (!left.length || !right.length) return [];
  const sortedLeft = [...left].sort((a, b) => a.x - b.x);
  const sortedRight = [...right].sort((a, b) => a.x - b.x);
  let rIndex = 0;
  let activeRight = sortedRight[0].y;
  const out = [];
  for (const l of sortedLeft) {
    while (rIndex + 1 < sortedRight.length && sortedRight[rIndex + 1].x <= l.x) {
      rIndex += 1;
      activeRight = sortedRight[rIndex].y;
    }
    const rhs = activeRight;
    if (!Number.isFinite(rhs)) continue;
    let y = NaN;
    if (op === "divide") y = rhs === 0 ? NaN : l.y / rhs;
    if (op === "multiply") y = l.y * rhs;
    if (op === "subtract") y = l.y - rhs;
    if (op === "add") y = l.y + rhs;
    if (Number.isFinite(y)) out.push({ x: l.x, y });
  }
  return out;
}

function parseEventDates(dates) {
  return dates
    .map((d) => Date.parse(`${d}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function findLatestEventInRange(series, dates) {
  if (!series.length) return null;
  const first = series[0].x;
  const last = series[series.length - 1].x;
  const ts = parseEventDates(dates);
  for (let i = ts.length - 1; i >= 0; i -= 1) {
    if (ts[i] >= first && ts[i] <= last) return ts[i];
  }
  return null;
}

function anchorToRoi(series, anchorTs) {
  if (!series.length) return [];
  const anchor = series.find((p) => p.x >= anchorTs) || series[0];
  if (!anchor || !Number.isFinite(anchor.y) || anchor.y === 0) return [];
  return series
    .filter((p) => p.x >= anchor.x)
    .map((p) => ({ x: p.x, y: ((p.y / anchor.y) - 1) * 100 }));
}

function rollingReturn(series, lookbackDays) {
  if (series.length < 2) return [];
  const out = [];
  let left = 0;
  for (let i = 0; i < series.length; i += 1) {
    const target = series[i].x - lookbackDays * DAY_MS;
    while (left + 1 < i && series[left + 1].x <= target) left += 1;
    if (series[left].x > target || series[left].y === 0) continue;
    const y = ((series[i].y / series[left].y) - 1) * 100;
    if (Number.isFinite(y)) out.push({ x: series[i].x, y });
  }
  return out;
}

function dailyReturns(series) {
  if (series.length < 2) return [];
  const out = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].y;
    if (!Number.isFinite(prev) || prev === 0) continue;
    const y = ((series[i].y / prev) - 1) * 100;
    if (Number.isFinite(y)) out.push({ x: series[i].x, y });
  }
  return out;
}

function movingAvg(series, w) {
  if (!series.length || w <= 1) return series;
  const q = [];
  let sum = 0;
  const out = [];
  for (const row of series) {
    q.push(row.y);
    sum += row.y;
    if (q.length > w) sum -= q.shift();
    if (q.length < w) continue;
    out.push({ x: row.x, y: sum / q.length });
  }
  return out;
}

function emaSeries(series, period) {
  if (!series.length || period <= 1) return series;
  const alpha = 2 / (period + 1);
  const out = [];
  let ema = series[0].y;
  for (const row of series) {
    ema = alpha * row.y + (1 - alpha) * ema;
    out.push({ x: row.x, y: ema });
  }
  return out;
}

function rollingStdDevSeries(series, window) {
  if (series.length < window || window <= 1) return [];
  const out = [];
  const values = [];
  let sum = 0;
  let sumSq = 0;
  for (const row of series) {
    values.push(row.y);
    sum += row.y;
    sumSq += row.y * row.y;
    if (values.length > window) {
      const dropped = values.shift() || 0;
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

function alignSeriesWithCarry(left, right) {
  if (!left.length || !right.length) return [];
  const sortedLeft = [...left].sort((a, b) => a.x - b.x);
  const sortedRight = [...right].sort((a, b) => a.x - b.x);
  let rIndex = 0;
  let activeRight = sortedRight[0].y;
  const out = [];
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

function pearson(xs, ys) {
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

function computeLogRegressionSeries(priceSeries) {
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

  const trend = usable.map((row, i) => ({ x: row.x, y: Math.exp(intercept + slope * xs[i]) }));
  const fair = trend.map((row) => ({ x: row.x, y: row.y * Math.exp(-sigma) }));
  const trendByTs = new Map(trend.map((row) => [row.x, row.y]));
  const rainbow = usable
    .map((row) => {
      const base = trendByTs.get(row.x);
      const y = Number.isFinite(base) && base > 0 ? ((row.y / base) - 1) * 100 : NaN;
      return { x: row.x, y };
    })
    .filter((row) => Number.isFinite(row.y));

  return { trend, fair, rainbow };
}

function computeRsiSeries(priceSeries, period = 14) {
  if (priceSeries.length <= period) return [];
  const out = [];
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

function lookbackDaysForSpecialChart(defId, timeframeDays) {
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
  ) return Math.max(timeframeDays, 730);
  return Math.max(timeframeDays, 365);
}

async function loadSeries(id, timeframeDays, visited = new Set()) {
  if (visited.has(id)) return [];
  const nextVisited = new Set(visited);
  nextVisited.add(id);
  const def = chartById.get(id);
  if (!def) return [];
  if (def.type === "coingecko") return fetchCoinGeckoSeries(def.coinId, def.metric, timeframeDays);
  if (def.type === "fred") {
    const fallback = FRED_SERIES_FALLBACKS[def.seriesId];
    if (fallback?.stooqSymbol) {
      const csv = await fetchViaProxy(`https://stooq.com/q/d/l/?s=${encodeURIComponent(fallback.stooqSymbol)}&i=d`);
      return parseStooqCsv(csv, timeframeDays);
    }
    const resolvedId = fallback?.seriesId || def.seriesId;
    const csv = await fetchViaProxy(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(resolvedId)}`);
    let rows = parseFredCsv(csv, timeframeDays);
    if (typeof fallback?.transform === "function") {
      rows = rows.map((row) => ({ ...row, y: fallback.transform(row.y) })).filter((row) => Number.isFinite(row.y));
    }
    return rows;
  }

  if (ROI_SPECIAL_IDS.has(def.id)) {
    const specialLookback = lookbackDaysForSpecialChart(def.id, timeframeDays);
    const base = await loadSeries(def.leftId, specialLookback, nextVisited);
    if (!base.length) return [];
    if (def.id === "monthly_returns") return limitToTimeframe(rollingReturn(base, 30), timeframeDays);
    if (def.id === "quarterly_returns") return limitToTimeframe(rollingReturn(base, 90), timeframeDays);
    if (def.id === "average_daily_returns") return limitToTimeframe(dailyReturns(base), timeframeDays);
    if (def.id === "monthly_average_roi") return limitToTimeframe(movingAvg(rollingReturn(base, 30), 30), timeframeDays);
    if (def.id === "historical_monthly_average_roi") return limitToTimeframe(movingAvg(rollingReturn(base, 30), 180), timeframeDays);
    if (def.id === "year_to_date_roi") {
      const latest = new Date(base[base.length - 1].x);
      const yStart = Date.parse(`${latest.getUTCFullYear()}-01-01T00:00:00Z`);
      return limitToTimeframe(anchorToRoi(base, yStart), timeframeDays);
    }
    if (def.id === "roi_after_halving") {
      const anchor = findLatestEventInRange(base, BTC_HALVING_DATES) || base[0].x;
      return limitToTimeframe(anchorToRoi(base, anchor), timeframeDays);
    }
    if (def.id === "roi_after_cycle_bottom" || def.id === "roi_after_bottom_multiple" || def.id === "roi_after_bottom_pairs") {
      const anchor = findLatestEventInRange(base, BTC_CYCLE_BOTTOM_DATES) || base[0].x;
      return limitToTimeframe(anchorToRoi(base, anchor), timeframeDays);
    }
    if (def.id === "roi_after_cycle_peak" || def.id === "roi_after_latest_cycle_peak_multi" || def.id === "roi_after_latest_cycle_peak_pairs") {
      const anchor = findLatestEventInRange(base, BTC_CYCLE_PEAK_DATES) || base[0].x;
      return limitToTimeframe(anchorToRoi(base, anchor), timeframeDays);
    }
    if (def.id === "roi_after_sub_cycle_bottom") {
      const anchor = findLatestEventInRange(base, BTC_SUB_CYCLE_BOTTOM_DATES) || base[0].x;
      return limitToTimeframe(anchorToRoi(base, anchor), timeframeDays);
    }
    return limitToTimeframe(anchorToRoi(base, base[0].x), timeframeDays);
  }

  if (INDICATOR_SPECIAL_IDS.has(def.id)) {
    const lookbackDays = lookbackDaysForSpecialChart(def.id, timeframeDays);
    if (def.id === "fear_greed_index") {
      return fetchFearGreedSeries(timeframeDays);
    }
    if (def.id === "transaction_fees") {
      return fetchBtcFeesSeries(timeframeDays);
    }
    const btc = await loadSeries("btc_price_usd", lookbackDays, nextVisited);
    if (!btc.length) return [];
    if (def.id === "logarithmic_regression") return limitToTimeframe(computeLogRegressionSeries(btc).trend, timeframeDays);
    if (def.id === "fair_value_log_reg") return limitToTimeframe(computeLogRegressionSeries(btc).fair, timeframeDays);
    if (def.id === "log_reg_rainbow") return limitToTimeframe(computeLogRegressionSeries(btc).rainbow, timeframeDays);
    if (def.id === "price_drawdown_from_ath") {
      let peak = Number.NEGATIVE_INFINITY;
      const out = btc
        .map((row) => {
          peak = Math.max(peak, row.y);
          const y = peak > 0 ? ((row.y / peak) - 1) * 100 : NaN;
          return { x: row.x, y };
        })
        .filter((row) => Number.isFinite(row.y));
      return limitToTimeframe(out, timeframeDays);
    }
    if (def.id === "moving_averages" || def.id === "golden_death_crosses") {
      const sma50 = movingAvg(btc, 50);
      const sma200 = movingAvg(btc, 200);
      return limitToTimeframe(mergeSeries(sma50, sma200, "divide").map((row) => ({ x: row.x, y: (row.y - 1) * 100 })), timeframeDays);
    }
    if (def.id === "bull_market_support_band") {
      const sma20w = movingAvg(btc, 140);
      const ema21w = emaSeries(btc, 147);
      const bandMid = mergeSeries(sma20w, ema21w, "add").map((row) => ({ x: row.x, y: row.y / 2 }));
      const aligned = alignSeriesWithCarry(btc, bandMid);
      const out = aligned
        .map((row) => ({ x: row.x, y: row.right === 0 ? NaN : ((row.left / row.right) - 1) * 100 }))
        .filter((row) => Number.isFinite(row.y));
      return limitToTimeframe(out, timeframeDays);
    }
    if (def.id === "pi_cycle_bottom_top") {
      const sma111 = movingAvg(btc, 111);
      const sma350 = movingAvg(btc, 350).map((row) => ({ x: row.x, y: row.y * 2 }));
      return limitToTimeframe(mergeSeries(sma111, sma350, "divide").map((row) => ({ x: row.x, y: row.y * 100 })), timeframeDays);
    }
    if (def.id === "rsi") return limitToTimeframe(computeRsiSeries(btc, 14), timeframeDays);
    if (def.id === "macd") {
      const ema12 = emaSeries(btc, 12);
      const ema26 = emaSeries(btc, 26);
      const macd = mergeSeries(ema12, ema26, "subtract");
      const signal = emaSeries(macd, 9);
      return limitToTimeframe(mergeSeries(macd, signal, "subtract"), timeframeDays);
    }
    if (def.id === "bollinger_bands") {
      const sma20 = movingAvg(btc, 20);
      const std20 = rollingStdDevSeries(btc, 20).map((row) => ({ x: row.x, y: row.y * 2 }));
      const top = mergeSeries(sma20, std20, "add");
      const bottom = mergeSeries(sma20, std20, "subtract");
      const topByTs = new Map(top.map((row) => [row.x, row.y]));
      const bottomByTs = new Map(bottom.map((row) => [row.x, row.y]));
      const midByTs = new Map(sma20.map((row) => [row.x, row.y]));
      const out = btc
        .map((row) => {
          const topV = topByTs.get(row.x);
          const botV = bottomByTs.get(row.x);
          const midV = midByTs.get(row.x);
          if (!Number.isFinite(topV) || !Number.isFinite(botV) || !Number.isFinite(midV) || topV === botV) return { x: row.x, y: NaN };
          return { x: row.x, y: ((row.y - midV) / (topV - botV)) * 100 };
        })
        .filter((row) => Number.isFinite(row.y));
      return limitToTimeframe(out, timeframeDays);
    }
    if (def.id === "volatility") {
      const daily = dailyReturns(btc);
      const vol = rollingStdDevSeries(daily, 30);
      return limitToTimeframe(vol.map((row) => ({ x: row.x, y: row.y * Math.sqrt(365) })), timeframeDays);
    }
    if (def.id === "correlation_coefficients") {
      const dxy = await loadSeries("dollar_index", lookbackDays, nextVisited);
      const aligned = alignSeriesWithCarry(btc, dxy);
      if (aligned.length < 120) return [];
      const btcRet = [];
      const dxyRet = [];
      for (let i = 1; i < aligned.length; i += 1) {
        const prev = aligned[i - 1];
        const cur = aligned[i];
        if (prev.left === 0 || prev.right === 0) continue;
        const l = cur.left / prev.left - 1;
        const r = cur.right / prev.right - 1;
        if (!Number.isFinite(l) || !Number.isFinite(r)) continue;
        btcRet.push({ x: cur.x, y: l });
        dxyRet.push({ x: cur.x, y: r });
      }
      const out = [];
      for (let i = 89; i < btcRet.length; i += 1) {
        const left = btcRet.slice(i - 89, i + 1).map((row) => row.y);
        const right = dxyRet.slice(i - 89, i + 1).map((row) => row.y);
        const corr = pearson(left, right);
        if (!Number.isFinite(corr)) continue;
        out.push({ x: btcRet[i].x, y: corr });
      }
      return limitToTimeframe(out, timeframeDays);
    }
  }

  const left = await loadSeries(def.leftId, timeframeDays, nextVisited);
  const right = await loadSeries(def.rightId, timeframeDays, nextVisited);
  const merged = mergeSeries(left, right, def.op);
  if (merged.length >= 2) return merged;
  if (left.length >= 2) return left;
  return merged;
}

function sanityCheck(chartId, series) {
  if (!series.length) return null;
  const ys = series.map((p) => p.y).filter(Number.isFinite);
  if (!ys.length) return "no_finite_values";
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  if (chartId === "rsi" && (min < -1 || max > 101)) return `rsi_out_of_range_${min.toFixed(2)}_${max.toFixed(2)}`;
  if (chartId === "correlation_coefficients" && (min < -1.05 || max > 1.05)) return `corr_out_of_range_${min.toFixed(3)}_${max.toFixed(3)}`;
  if (chartId === "price_drawdown_from_ath" && max > 1) return `drawdown_positive_${max.toFixed(2)}`;
  return null;
}

async function main() {
  const failures = [];
  const warnings = [];
  const requestedIds = (process.env.CHART_SWEEP_IDS || "")
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean);
  const idSource = requestedIds.length
    ? requestedIds
    : chartDefs.map((row) => row.id);
  const ids = Array.from(new Set(idSource)).filter((id) => chartById.has(id));
  console.log(`Validating charts: ${ids.length} ids, ${TIMEFRAMES.length} timeframes, ${PASS_COUNT} passes`);

  for (let pass = 1; pass <= PASS_COUNT; pass += 1) {
    console.log(`Pass ${pass}/${PASS_COUNT}`);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      for (const tf of TIMEFRAMES) {
        try {
          const series = await loadSeries(id, tf);
          if (series.length < 2) {
            failures.push({ id, tf, pass, reason: `points_${series.length}` });
            continue;
          }
          const sanity = sanityCheck(id, series);
          if (sanity) warnings.push({ id, tf, pass, reason: sanity });
        } catch (err) {
          failures.push({ id, tf, pass, reason: `exception_${String(err?.message || err)}` });
        }
      }
      if ((i + 1) % 10 === 0) {
        console.log(`  ${i + 1}/${ids.length} charts`);
      }
    }
  }

  const report = {
    at: new Date().toISOString(),
    baseUrl: APP_BASE,
    totalCharts: ids.length,
    totalChecks: ids.length * TIMEFRAMES.length * PASS_COUNT,
    failures,
    warnings,
  };
  fs.writeFileSync("scripts/chart-sweep-report.json", JSON.stringify(report, null, 2));

  console.log(`Failures: ${failures.length}`);
  console.log(`Warnings: ${warnings.length}`);
  if (failures.length) {
    console.log("Top failures:");
    for (const row of failures.slice(0, 20)) {
      console.log(`- ${row.id} @ ${row.tf}D (pass ${row.pass}): ${row.reason}`);
    }
  }
  if (warnings.length) {
    console.log("Top warnings:");
    for (const row of warnings.slice(0, 20)) {
      console.log(`- ${row.id} @ ${row.tf}D (pass ${row.pass}): ${row.reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
