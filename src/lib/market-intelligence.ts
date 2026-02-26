import type { XYPoint } from "../data/macro";

export type RegimeState = "Early Expansion" | "Mid-Cycle" | "Late Cycle" | "Contraction" | "Panic / Stress";
export type RiskState = "Risk-On" | "Neutral" | "Risk-Off";
export type LiquidityState = "Expanding" | "Neutral" | "Contracting";

export function latest(points: XYPoint[]): number {
  if (!points.length) return NaN;
  return points[points.length - 1].y;
}

export function pctDelta(points: XYPoint[], lookback = 12): number {
  if (points.length < lookback + 1) return NaN;
  const a = points[points.length - 1]?.y;
  const b = points[points.length - 1 - lookback]?.y;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return NaN;
  return ((a - b) / Math.abs(b)) * 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalize(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v) || hi <= lo) return 0.5;
  return clamp((v - lo) / (hi - lo), 0, 1);
}

export function computeLiquidityIndex(input: {
  m2YoY: number;
  fedBalanceSheetTrend: number;
  stablecoinTrend: number;
  netLiquidityTrend: number;
}): number {
  const m2 = normalize(input.m2YoY, -4, 12);
  const fed = normalize(input.fedBalanceSheetTrend, -8, 8);
  const stable = normalize(input.stablecoinTrend, -15, 15);
  const net = normalize(input.netLiquidityTrend, -10, 10);
  return Math.round((m2 * 0.28 + fed * 0.24 + stable * 0.24 + net * 0.24) * 100);
}

export function computeStressScore(input: {
  hySpread: number;
  curveSlope: number;
  vix: number;
  dxyTrend: number;
  breadthUpRatio: number;
}): number {
  const hy = normalize(input.hySpread, 2.5, 8.5);
  const curveRisk = 1 - normalize(input.curveSlope, -1.2, 1.8);
  const vix = normalize(input.vix, 12, 45);
  const dxy = normalize(input.dxyTrend, -6, 8);
  const breadthRisk = 1 - normalize(input.breadthUpRatio, 0.3, 0.75);
  return Math.round((hy * 0.23 + curveRisk * 0.2 + vix * 0.22 + dxy * 0.15 + breadthRisk * 0.2) * 100);
}

export function classifyRisk(stressScore: number): RiskState {
  if (stressScore >= 66) return "Risk-Off";
  if (stressScore <= 38) return "Risk-On";
  return "Neutral";
}

export function classifyLiquidity(liquidityIndex: number): LiquidityState {
  if (liquidityIndex >= 62) return "Expanding";
  if (liquidityIndex <= 40) return "Contracting";
  return "Neutral";
}

export function classifyRegime(input: {
  inflationTrend: number;
  curveSlope: number;
  hySpread: number;
  m2Trend: number;
  unemploymentTrend: number;
  breadthUpRatio: number;
  stressScore: number;
}): RegimeState {
  const inflationCooling = Number.isFinite(input.inflationTrend) ? input.inflationTrend < 0 : false;
  const curvePositive = Number.isFinite(input.curveSlope) ? input.curveSlope > 0.2 : false;
  const creditCalm = Number.isFinite(input.hySpread) ? input.hySpread < 4.2 : false;
  const liquidityUp = Number.isFinite(input.m2Trend) ? input.m2Trend > 0 : false;
  const laborSoftening = Number.isFinite(input.unemploymentTrend) ? input.unemploymentTrend > 0.15 : false;
  const breadthGood = Number.isFinite(input.breadthUpRatio) ? input.breadthUpRatio > 0.55 : false;

  if (input.stressScore >= 78) return "Panic / Stress";
  if (!curvePositive && laborSoftening && input.hySpread > 4.8) return "Contraction";
  if (!inflationCooling && !creditCalm && input.stressScore > 62) return "Late Cycle";
  if (inflationCooling && curvePositive && liquidityUp && breadthGood) return "Early Expansion";
  return "Mid-Cycle";
}
