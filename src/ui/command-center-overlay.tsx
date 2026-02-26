import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { CHARTS } from "../catalog/charts";
import { FINANCIAL_ASSETS } from "../catalog/financial-assets";
import { TRACKED_COINS } from "../catalog/coins";
import { fetchCoinGeckoSimplePrices } from "../data/coingecko";
import { fetchFredSeries } from "../data/macro";
import { fetchTopStockBreadth } from "../data/stocks";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import {
  classifyLiquidity,
  classifyRegime,
  classifyRisk,
  computeLiquidityIndex,
  computeStressScore,
  latest,
  pctDelta,
} from "../lib/market-intelligence";
import { getResearchMaterials } from "../data/research-materials";
import { useAppMode } from "../state/app-mode";
import { useCommandCenter } from "../state/command-center";
import { useSettings } from "../state/settings";
import { useI18n } from "../i18n/use-i18n";
import { useAppColors } from "./use-app-colors";

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  route: string;
};

type CommandCenterSnapshot = {
  m2Trend: number;
  fedTrend: number;
  stableTrend: number;
  netLiquidityTrend: number;
  hy: number;
  curve: number;
  vix: number;
  dxyTrend: number;
  breadthRatio: number;
  inflationTrend: number;
  unemploymentTrend: number;
  stressScore: number;
  liquidityIndex: number;
  riskState: "Risk-On" | "Neutral" | "Risk-Off";
  liquidityState: "Expanding" | "Neutral" | "Contracting";
  regime: "Early Expansion" | "Mid-Cycle" | "Late Cycle" | "Contraction" | "Panic / Stress";
};

const SNAPSHOT_TTL_MS = 5 * 60_000;
const snapshotCache = new Map<string, { at: number; data: CommandCenterSnapshot }>();
const snapshotInflight = new Map<string, Promise<CommandCenterSnapshot | null>>();
const SNAPSHOT_PERSIST_KEY_PREFIX = "command_center_snapshot";

const DAILY_EVENTS = [
  { id: "cpi", title: "US CPI", date: "2026-03-12" },
  { id: "fomc", title: "FOMC Decision", date: "2026-03-18" },
  { id: "ecb", title: "ECB Meeting", date: "2026-03-05" },
  { id: "payrolls", title: "US Payrolls", date: "2026-03-06" },
];

function badgeColor(value: "Risk-On" | "Neutral" | "Risk-Off" | "Expanding" | "Contracting") {
  if (value === "Risk-On" || value === "Expanding") return "#5CE0AB";
  if (value === "Neutral") return "#F5C77A";
  return "#FF8497";
}

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

async function buildSnapshot(currency: "usd" | "eur"): Promise<CommandCenterSnapshot | null> {
  try {
    const safeSeries = async (seriesId: string): Promise<{ x: number; y: number }[]> => {
      try {
        return await fetchFredSeries({ seriesId, days: 720 });
      } catch {
        return [];
      }
    };
    const safeBreadth = async () => {
      try {
        return await fetchTopStockBreadth(200);
      } catch {
        return { up: 0, down: 0, unchanged: 0, total: 0 };
      }
    };
    const safeStable = async () => {
      try {
        return await fetchCoinGeckoSimplePrices({
          ids: ["tether", "usd-coin", "dai"],
          vsCurrency: currency,
          useCache: true,
          cacheTtlMs: 45_000,
        });
      } catch {
        return {};
      }
    };

    const [
      m2,
      fed,
      rrp,
      tga,
      hySpread,
      dgs10,
      dgs2,
      vixSeries,
      dxy,
      cpi,
      unrate,
      breadth,
      stableMap,
    ] = await Promise.all([
      safeSeries("WM2NS"),
      safeSeries("WALCL"),
      safeSeries("RRPONTSYD"),
      safeSeries("WTREGEN"),
      safeSeries("BAMLH0A0HYM2"),
      safeSeries("DGS10"),
      safeSeries("DGS2"),
      safeSeries("VIXCLS"),
      safeSeries("DTWEXBGS"),
      safeSeries("CPIAUCSL"),
      safeSeries("UNRATE"),
      safeBreadth(),
      safeStable(),
    ]);

    const m2Trend = pctDelta(m2, 12);
    const fedTrend = pctDelta(fed, 12);
    const rrpTrend = pctDelta(rrp, 12);
    const tgaTrend = pctDelta(tga, 12);
    const stableRows = Object.values(stableMap ?? {}).filter((row) => row && typeof row === "object");
    const stableNow = stableRows.reduce((s, row: any) => s + (Number(row.market_cap) || 0), 0);
    const stableWeighted24h = stableRows.reduce((sum: number, row: any) => {
      const cap = Number(row.market_cap) || 0;
      const w = stableNow > 0 ? cap / stableNow : 0;
      const ch = Number(row.price_change_percentage_24h);
      return sum + w * (Number.isFinite(ch) ? ch : 0);
    }, 0);
    const stableTrend = Number.isFinite(stableWeighted24h) ? stableWeighted24h : NaN;
    const netLiquidityTrend = Number.isFinite(fedTrend) && Number.isFinite(rrpTrend) && Number.isFinite(tgaTrend) ? fedTrend - Math.max(rrpTrend, 0) - Math.max(tgaTrend, 0) : NaN;
    const curve = latest(dgs10) - latest(dgs2);
    const breadthRatio = breadth.total > 0 ? breadth.up / breadth.total : 0.5;
    const hy = latest(hySpread);
    const vix = latest(vixSeries);
    const dxyTrend = pctDelta(dxy, 12);
    const inflationTrend = pctDelta(cpi, 12);
    const unemploymentTrend = pctDelta(unrate, 6);

    const stressScore = computeStressScore({ hySpread: hy, curveSlope: curve, vix, dxyTrend, breadthUpRatio: breadthRatio });
    const liquidityIndex = computeLiquidityIndex({
      m2YoY: m2Trend,
      fedBalanceSheetTrend: fedTrend,
      stablecoinTrend: stableTrend,
      netLiquidityTrend,
    });
    const riskState = classifyRisk(stressScore);
    const liquidityState = classifyLiquidity(liquidityIndex);
    const regime = classifyRegime({
      inflationTrend,
      curveSlope: curve,
      hySpread: hy,
      m2Trend,
      unemploymentTrend,
      breadthUpRatio: breadthRatio,
      stressScore,
    });

    return {
      m2Trend,
      fedTrend,
      stableTrend,
      netLiquidityTrend,
      hy,
      curve,
      vix,
      dxyTrend,
      breadthRatio,
      inflationTrend,
      unemploymentTrend,
      stressScore,
      liquidityIndex,
      riskState,
      liquidityState,
      regime,
    };
  } catch {
    return null;
  }
}

export function CommandCenterOverlay() {
  const router = useRouter();
  const colors = useAppColors();
  const { settings } = useSettings();
  const { t } = useI18n();
  const { mode } = useAppMode();
  const { open, closeCenter } = useCommandCenter();

  const [loading, setLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<CommandCenterSnapshot | null>(null);

  const loadSnapshot = useCallback(async (opts?: { force?: boolean; showLoader?: boolean }) => {
    const currency = settings.currency.toLowerCase() as "usd" | "eur";
    const cacheKey = `snapshot:${currency}`;
    const persistKey = `${SNAPSHOT_PERSIST_KEY_PREFIX}:${currency}`;
    const cached = snapshotCache.get(cacheKey);
    const isFresh = !!cached && Date.now() - cached.at < SNAPSHOT_TTL_MS;

    if (cached?.data) {
      setSnapshot(cached.data);
      setSnapshotUpdatedAt(cached.at);
    }

    if (!cached?.data) {
      const persisted = await loadPersistedJson<{ at: number; data: CommandCenterSnapshot } | null>(persistKey, null);
      if (persisted?.data) {
        snapshotCache.set(cacheKey, persisted);
        setSnapshot(persisted.data);
        setSnapshotUpdatedAt(persisted.at);
      }
    }

    if (isFresh && !opts?.force) {
      setLoading(false);
      return;
    }

    if (opts?.showLoader && !cached?.data) setLoading(true);

    let task = snapshotInflight.get(cacheKey);
    if (!task) {
      task = buildSnapshot(currency);
      snapshotInflight.set(cacheKey, task);
    }

    try {
      const next = await task;
      if (next) {
        const payload = { at: Date.now(), data: next };
        snapshotCache.set(cacheKey, payload);
        setSnapshot(next);
        setSnapshotUpdatedAt(payload.at);
        void savePersistedJson(persistKey, payload);
      }
    } finally {
      snapshotInflight.delete(cacheKey);
      setLoading(false);
    }
  }, [settings.currency]);

  useEffect(() => {
    if (!open) return;
    void loadSnapshot({ showLoader: true });
  }, [open, loadSnapshot]);

  useEffect(() => {
    // Warm snapshot in background so opening the command center is near-instant.
    void loadSnapshot({ showLoader: false });
  }, [loadSnapshot]);

  const searchPool = useMemo<SearchItem[]>(() => {
    const chartItems: SearchItem[] = CHARTS.map((chart) => ({
      id: `chart_${chart.id}`,
      title: chart.title,
      subtitle: `${chart.category} chart`,
      icon: "show-chart",
      route: `/chart/${chart.id}`,
    }));
    const assetItems: SearchItem[] = FINANCIAL_ASSETS.slice(0, 300).map((asset) => ({
      id: `asset_${asset.id}`,
      title: `${asset.symbol} • ${asset.name}`,
      subtitle: `${asset.kind} asset`,
      icon: asset.kind === "crypto" ? "currency-bitcoin" : asset.kind === "etf" ? "pie-chart" : "show-chart",
      route: `/chart/custom?symbol=${encodeURIComponent(asset.symbol)}&name=${encodeURIComponent(asset.name)}&kind=${encodeURIComponent(asset.kind)}`,
    }));
    const coinItems: SearchItem[] = TRACKED_COINS.map((coin) => ({
      id: `coin_${coin.id}`,
      title: `${coin.symbol.toUpperCase()} • ${coin.name}`,
      subtitle: "crypto tracked asset",
      icon: "currency-bitcoin",
      route: `/chart/${coin.symbol.toLowerCase()}_price_usd`,
    }));
    const researchItems: SearchItem[] = (["indicators", "macro", "crypto", "risk", "playbooks"] as const)
      .flatMap((topic) => getResearchMaterials(topic))
      .map((item) => ({
        id: `research_${item.id}`,
        title: item.title,
        subtitle: "research material",
        icon: "menu-book",
        route: `/research-material/${item.id}`,
      }));
    const macroSeriesItems: SearchItem[] = CHARTS.filter((c) => c.category === "Macro" || c.category === "EU")
      .slice(0, 120)
      .map((chart) => ({
        id: `macro_${chart.id}`,
        title: chart.title,
        subtitle: "macro series",
        icon: "insights",
        route: `/chart/${chart.id}`,
      }));
    return [...chartItems, ...macroSeriesItems, ...assetItems, ...coinItems, ...researchItems];
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchPool
      .filter((row) => row.title.toLowerCase().includes(q) || row.subtitle.toLowerCase().includes(q))
      .slice(0, 16);
  }, [query, searchPool]);

  const displayStressScore = useMemo(() => {
    if (!snapshot) return 50;
    return clampScore(100 - snapshot.stressScore);
  }, [snapshot]);
  const aiBrief = useMemo(() => {
    if (!snapshot) return [];
    return [
      `Overnight: ${snapshot.riskState} tone with Stress Score ${displayStressScore}/100 and Liquidity ${snapshot.liquidityState.toLowerCase()}.`,
      `Today focus: HY spread ${snapshot.hy.toFixed(2)} and curve ${snapshot.curve.toFixed(2)}. These drive cross-asset risk tolerance.`,
      `Key levels: VIX ${snapshot.vix.toFixed(2)}, DXY trend ${formatPct(snapshot.dxyTrend)}, breadth ${(snapshot.breadthRatio * 100).toFixed(0)}% up.`,
    ];
  }, [displayStressScore, snapshot]);

  const narratives = useMemo(() => {
    if (!snapshot) return ["Disinflation trade", "Liquidity cycle", "Dollar regime"];
    const out: string[] = [];
    if (snapshot.dxyTrend > 1) out.push("Dollar squeeze");
    if (snapshot.stressScore > 60) out.push("Risk compression");
    if (snapshot.liquidityIndex > 58) out.push("Liquidity expansion");
    if (snapshot.inflationTrend < 0) out.push("Disinflation trade");
    if (!out.length) out.push("Range-bound macro");
    return out;
  }, [snapshot]);

  if (!open) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: colors.dark ? "rgba(7,9,14,0.55)" : "rgba(18,24,41,0.2)",
        zIndex: 1000,
      }}
    >
      <Pressable
        onPress={closeCenter}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        style={{
          flex: 1,
          marginTop: 72,
          marginHorizontal: 14,
          marginBottom: 82,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: "hidden",
        }}
      >
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17 }}>TrackerX Command Center</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Pressable
                disabled={manualRefreshing}
                onPress={() => {
                  void (async () => {
                    setManualRefreshing(true);
                    try {
                      await loadSnapshot({ force: true, showLoader: true });
                    } finally {
                      setManualRefreshing(false);
                    }
                  })();
                }}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                  backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  opacity: manualRefreshing ? 0.85 : 1,
                })}
              >
                {manualRefreshing ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <MaterialIcons name="refresh" size={12} color={colors.accent} />
                )}
                <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "800" }}>
                  {t("Refresh", "Aktualisieren")}
                </Text>
              </Pressable>
              {!!snapshotUpdatedAt && (
                <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: "700" }}>
                    {Date.now() - snapshotUpdatedAt < SNAPSHOT_TTL_MS ? t("Fresh", "Frisch") : t("Cached", "Cache")}
                  </Text>
                </View>
              )}
              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: "700" }}>FRED + CoinGecko</Text>
              </View>
            </View>
            <Pressable
              onPress={closeCenter}
              style={({ pressed }) => ({
                width: 30,
                height: 30,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <MaterialIcons name="close" size={16} color={colors.accent} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 10, paddingBottom: 44 }}
            scrollEnabled
            showsVerticalScrollIndicator
            bounces
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: 10 }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search charts, indicators, assets, macro, research"
                placeholderTextColor={colors.subtext}
                style={{ color: colors.text, fontWeight: "600" }}
              />
              {!!query.trim() && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {searchResults.map((row) => (
                    <Pressable
                      key={row.id}
                      onPress={() => {
                        closeCenter();
                        router.push(row.route as never);
                      }}
                      style={({ pressed }) => ({
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? colors.accentSoft : colors.surface,
                        padding: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      })}
                    >
                      <MaterialIcons name={row.icon} size={14} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{row.title}</Text>
                        <Text style={{ color: colors.subtext, fontSize: 11 }}>{row.subtitle}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {!searchResults.length && <Text style={{ color: colors.subtext, fontSize: 12 }}>No matches.</Text>}
                </View>
              )}
            </View>

            {loading && (
              <View style={{ marginTop: 14 }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}

            {!!snapshot && (
              <>
                <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>Market Regime</Text>
                    <Text style={{ color: colors.text, fontWeight: "900", marginTop: 2 }}>{snapshot.regime}</Text>
                    <Text style={{ color: badgeColor(snapshot.riskState), fontWeight: "800", fontSize: 12, marginTop: 4 }}>{snapshot.riskState}</Text>
                  </View>
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>Liquidity State</Text>
                    <Text style={{ color: colors.text, fontWeight: "900", marginTop: 2 }}>{snapshot.liquidityState}</Text>
                    <Text style={{ color: badgeColor(snapshot.liquidityState), fontWeight: "800", fontSize: 12, marginTop: 4 }}>Index {snapshot.liquidityIndex}/100</Text>
                  </View>
                </View>

                <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>TrackerX Stress Score</Text>
                  <View style={{ alignItems: "center", justifyContent: "center", marginTop: 4 }}>
                    <View style={{ width: 196, height: 112, alignItems: "center", justifyContent: "center" }}>
                      <Svg width={196} height={112}>
                        {(() => {
                          const score = displayStressScore;
                          const cx = 98;
                          const cy = 94;
                          const r = 60;
                          // Top semicircle: left (-90) to right (+90) => 180 degrees.
                          const start = -90;
                          const end = 90;
                          const progress = start + (score / 100) * (end - start);
                          const sweep = end - start;
                          const segmentGap = 6;
                          const segments = [
                            { color: "#FF4D67", span: 0.17 },
                            { color: "#FFA11F", span: 0.2 },
                            { color: "#F2D14B", span: 0.2 },
                            { color: "#8FDF32", span: 0.2 },
                            { color: "#35D1A2", span: 0.23 },
                          ];
                          let cursor = start;
                          return (
                            <>
                              {segments.map((seg, idx) => {
                                const segSweep = sweep * seg.span;
                                const segStart = cursor + segmentGap / 2;
                                const segEnd = cursor + segSweep - segmentGap / 2;
                                cursor += segSweep;
                                if (segEnd <= segStart) return null;
                                return <Path key={`stress_seg_${idx}`} d={describeArc(cx, cy, r, segStart, segEnd)} stroke={seg.color} strokeWidth={9} strokeLinecap="round" fill="none" />;
                              })}
                              {(() => {
                                const p = polarToCartesian(cx, cy, r, progress);
                                return (
                                  <>
                                    <Circle cx={p.x} cy={p.y} r={6.5} fill="#F7FAFF" stroke={colors.dark ? "#1B2438" : "#D4DCEC"} strokeWidth={2} />
                                  </>
                                );
                              })()}
                            </>
                          );
                        })()}
                      </Svg>
                      <Text
                        style={{
                          position: "absolute",
                          top: 46,
                          color: colors.text,
                          fontSize: 34,
                          fontWeight: "900",
                          lineHeight: 38,
                          includeFontPadding: false,
                        }}
                      >
                        {displayStressScore}
                      </Text>
                      <View
                        style={{
                          position: "absolute",
                          top: 88,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.dark ? "#111A2B" : "#F6FAFF",
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>out of 100</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>HY {snapshot.hy.toFixed(2)} • Curve {snapshot.curve.toFixed(2)} • VIX {snapshot.vix.toFixed(1)}</Text>
                  <View
                    style={{
                      marginTop: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceAlt,
                      paddingHorizontal: 8,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>
                      {t("How to read it", "So liest du ihn")}
                    </Text>
                    <Text style={{ color: "#FF8FA3", fontSize: 11, marginTop: 3 }}>
                      {t("0-33: elevated stress", "0-33: erhoehter Stress")}
                    </Text>
                    <Text style={{ color: "#F5C77A", fontSize: 11, marginTop: 1 }}>
                      {t("34-66: mixed conditions", "34-66: gemischte Bedingungen")}
                    </Text>
                    <Text style={{ color: "#63E6BE", fontSize: 11, marginTop: 1 }}>
                      {t("67-100: calm risk backdrop", "67-100: ruhiges Risikoumfeld")}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 4 }}>
                      {t("Lower score means higher stress.", "Niedriger Wert bedeutet hoeheren Stress.")}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>Liquidity & Flows</Text>
                  <Text style={{ color: colors.text, marginTop: 4 }}>Global M2 {formatPct(snapshot.m2Trend)} • Fed BS {formatPct(snapshot.fedTrend)}</Text>
                  <Text style={{ color: colors.text }}>Stablecoins {formatPct(snapshot.stableTrend)} • Net liquidity {formatPct(snapshot.netLiquidityTrend)}</Text>
                </View>

                <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>AI Daily Brief</Text>
                  {aiBrief.slice(0, 2).map((line) => (
                    <Text key={line} style={{ color: colors.text, marginTop: 4, fontSize: 12 }}>
                      • {line}
                    </Text>
                  ))}
                </View>

                <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>Market Narrative Tracker</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {narratives.map((n) => (
                      <View key={n} style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 11 }}>{n}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>Upcoming High-Impact Events</Text>
                  {DAILY_EVENTS.slice(0, 3).map((ev) => (
                    <Text key={ev.id} style={{ color: colors.text, marginTop: 4, fontSize: 12 }}>
                      • {ev.title} • {ev.date}
                    </Text>
                  ))}
                </View>
              </>
            )}

            <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => {
                  closeCenter();
                  router.push(mode === "informational" ? "/(tabs)" : "/(tabs)/tools");
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                  backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                  paddingVertical: 10,
                  alignItems: "center",
                })}
              >
                <Text style={{ color: colors.accent, fontWeight: "800" }}>Go Home</Text>
              </Pressable>
              <Pressable
                onPress={closeCenter}
                style={({ pressed }) => ({
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
                  paddingVertical: 10,
                  alignItems: "center",
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "800" }}>Close</Text>
              </Pressable>
            </View>
          </ScrollView>
      </View>
    </View>
  );
}
