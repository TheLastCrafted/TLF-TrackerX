import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { fetchCoinGeckoMarkets } from "../../src/data/coingecko";
import { fetchFredSeries } from "../../src/data/macro";
import { fetchTopStockBreadth } from "../../src/data/stocks";
import {
  classifyLiquidity,
  classifyRisk,
  computeLiquidityIndex,
  computeStressScore,
  latest,
  pctDelta,
} from "../../src/lib/market-intelligence";
import { useI18n } from "../../src/i18n/use-i18n";
import { useSettings } from "../../src/state/settings";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export default function LiquidityScreen() {
  const colors = useAppColors();
  const { settings } = useSettings();
  const { t } = useI18n();

  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const reloadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const toVal = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await p;
        } catch {
          return fallback;
        }
      };
      const [
        m2,
        m3eu,
        chinaM2,
        fed,
        rrp,
        tga,
        dxy,
        hy,
        dgs10,
        dgs2,
        vix,
        breadth,
        stableRows,
        btcEth,
      ] = await Promise.all([
        toVal(fetchFredSeries({ seriesId: "WM2NS", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "MABMM301EZM189S", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "MABMM301CNM189S", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "WALCL", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "RRPONTSYD", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "WTREGEN", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "DTWEXBGS", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "BAMLH0A0HYM2", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "DGS10", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "DGS2", days: 730 }), []),
        toVal(fetchFredSeries({ seriesId: "VIXCLS", days: 730 }), []),
        toVal(fetchTopStockBreadth(200), { up: 0, down: 0, unchanged: 0, total: 0 }),
        toVal(
          fetchCoinGeckoMarkets({
            ids: ["tether", "usd-coin", "dai"],
            vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
            useCache: true,
            cacheTtlMs: 20_000,
          }),
          []
        ),
        toVal(
          fetchCoinGeckoMarkets({
            ids: ["bitcoin", "ethereum"],
            vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
            useCache: true,
            cacheTtlMs: 20_000,
          }),
          []
        ),
      ]);

      const m2Trend = pctDelta(m2, 12);
      const m3Trend = pctDelta(m3eu, 12);
      const cnTrend = pctDelta(chinaM2, 12);
      const fedTrend = pctDelta(fed, 12);
      const rrpTrend = pctDelta(rrp, 12);
      const tgaTrend = pctDelta(tga, 12);
      const dxyTrend = pctDelta(dxy, 12);
      const stableNow = stableRows.reduce((s, row) => s + (row.market_cap || 0), 0);
      const stableWeighted24h = stableRows.reduce((sum, row) => {
        const weight = stableNow > 0 ? (row.market_cap || 0) / stableNow : 0;
        const change = Number(row.price_change_percentage_24h ?? 0);
        return sum + weight * change;
      }, 0);
      const stableTrend = Number.isFinite(stableWeighted24h) ? stableWeighted24h : NaN;
      const netLiquidityTrend = fedTrend - Math.max(rrpTrend, 0) - Math.max(tgaTrend, 0);
      const curve = latest(dgs10) - latest(dgs2);
      const breadthRatio = breadth.total > 0 ? breadth.up / breadth.total : 0.5;
      const stressScore = computeStressScore({
        hySpread: latest(hy),
        curveSlope: curve,
        vix: latest(vix),
        dxyTrend,
        breadthUpRatio: breadthRatio,
      });
      const liquidityIndex = computeLiquidityIndex({
        m2YoY: m2Trend,
        fedBalanceSheetTrend: fedTrend,
        stablecoinTrend: stableTrend,
        netLiquidityTrend,
      });
      const btcPrice = btcEth.find((row) => row.id === "bitcoin")?.current_price ?? NaN;
      const ethPrice = btcEth.find((row) => row.id === "ethereum")?.current_price ?? NaN;

      setKpis({
        m2Trend,
        m3Trend,
        cnTrend,
        fedTrend,
        rrpTrend,
        tgaTrend,
        dxyTrend,
        stableTrend,
        netLiquidityTrend,
        stressScore,
        liquidityIndex,
        riskState: classifyRisk(stressScore) === "Risk-On" ? 1 : classifyRisk(stressScore) === "Neutral" ? 0 : -1,
        liquidityState: classifyLiquidity(liquidityIndex) === "Expanding" ? 1 : classifyLiquidity(liquidityIndex) === "Neutral" ? 0 : -1,
        btcPrice,
        ethPrice,
        breadthRatio,
      });
    } finally {
      setLoading(false);
    }
  }, [settings.currency]);

  useEffect(() => {
    void reloadSnapshot();
  }, [reloadSnapshot]);

  const onManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await reloadSnapshot();
    } finally {
      setManualRefreshing(false);
    }
  }, [reloadSnapshot]);

  const riskText = useMemo(() => {
    if (kpis.riskState === 1) return "Risk-On";
    if (kpis.riskState === -1) return "Risk-Off";
    return "Neutral";
  }, [kpis.riskState]);

  const liquidityText = useMemo(() => {
    if (kpis.liquidityState === 1) return "Expanding";
    if (kpis.liquidityState === -1) return "Contracting";
    return "Neutral";
  }, [kpis.liquidityState]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={() => {
            void onManualRefresh();
          }}
          {...refreshControlProps(colors, "Refreshing liquidity snapshot...")}
        />
      }
    >
      <RefreshFeedback refreshing={manualRefreshing} colors={colors} label={t("Refreshing liquidity and flow data...", "Liquiditaets- und Flow-Daten werden aktualisiert...")} />
      <TabHeader
        title={t("Liquidity", "Liquiditaet")}
        subtitle={t("Global liquidity, flow direction, and TrackerX proprietary indices.", "Globale Liquiditaet, Flow-Richtung und TrackerX-Indizes.")}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING, gap: 10 }}>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 12 }}>
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>Liquidity & Flows Dashboard</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>{loading ? "Updating live snapshot..." : "Live snapshot ready."}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 11 }}>TrackerX Liquidity Index</Text>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900" }}>{Math.round(kpis.liquidityIndex ?? 0)}</Text>
            <Text style={{ color: kpis.liquidityState === 1 ? colors.positive : kpis.liquidityState === -1 ? colors.negative : colors.warning, fontWeight: "800" }}>{liquidityText}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 11 }}>TrackerX Risk Pulse</Text>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900" }}>{Math.round(kpis.stressScore ?? 0)}</Text>
            <Text style={{ color: kpis.riskState === 1 ? colors.positive : kpis.riskState === -1 ? colors.negative : colors.warning, fontWeight: "800" }}>{riskText}</Text>
          </View>
        </View>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Global Liquidity</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>US M2 YoY {fmtPct(kpis.m2Trend)} • EU M3 {fmtPct(kpis.m3Trend)} • China liquidity {fmtPct(kpis.cnTrend)}</Text>
          <Text style={{ color: colors.subtext, marginTop: 2 }}>Fed balance sheet {fmtPct(kpis.fedTrend)} • RRP {fmtPct(kpis.rrpTrend)} • TGA {fmtPct(kpis.tgaTrend)}</Text>
          <Text style={{ color: colors.subtext, marginTop: 2 }}>DXY trend {fmtPct(kpis.dxyTrend)} • Net liquidity composite {fmtPct(kpis.netLiquidityTrend)}</Text>
        </View>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Crypto Liquidity</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>Stablecoin market cap trend {fmtPct(kpis.stableTrend)}</Text>
          <Text style={{ color: colors.subtext, marginTop: 2 }}>BTC {fmt(kpis.btcPrice, 2)} • ETH {fmt(kpis.ethPrice, 2)} • Breadth {(Number.isFinite(kpis.breadthRatio) ? (kpis.breadthRatio * 100).toFixed(1) : "-")}% up</Text>
        </View>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>ETF / Flow Layer</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>BTC ETF net flows, SPY/QQQ flows, and sector rotation are modeled via liquidity + breadth proxies in this build.</Text>
          <Text style={{ color: colors.subtext, marginTop: 2 }}>Institutional feed adapter is prepared for direct flow APIs in next phase.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
