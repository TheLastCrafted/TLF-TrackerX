import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tradingMarketCapSymbolForCoinId, tradingSymbolForCoinId } from "../../src/catalog/trading-symbols";
import { tradingSymbolForChartId } from "../../src/catalog/chart-trading-symbols";
import { CHARTS, ChartValueFormat } from "../../src/catalog/charts";
import { fetchCoinGeckoMarketChart } from "../../src/data/coingecko";
import { fetchFredSeries } from "../../src/data/macro";
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

const TIMEFRAMES: { days: 1 | 7 | 30 | 365 | 1825 | 3650 | 7300 | 18250; label: string }[] = [
  { days: 1, label: "1D" },
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 365, label: "1Y" },
  { days: 1825, label: "5Y" },
  { days: 3650, label: "10Y" },
  { days: 7300, label: "20Y" },
  { days: 18250, label: "50Y" },
];
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

function mergeSeries(left: Pt[], right: Pt[], operation: "divide" | "multiply" | "subtract" | "add"): Pt[] {
  if (!left.length || !right.length) return [];
  const rightByDay = new Map<string, number>();
  for (const point of right) {
    const key = new Date(point.x).toISOString().slice(0, 10);
    rightByDay.set(key, point.y);
  }
  const out: Pt[] = [];
  for (const point of left) {
    const key = new Date(point.x).toISOString().slice(0, 10);
    const rhs = rightByDay.get(key);
    if (rhs === undefined || !Number.isFinite(rhs)) continue;
    let y = NaN;
    if (operation === "divide") y = rhs === 0 ? NaN : point.y / rhs;
    if (operation === "multiply") y = point.y * rhs;
    if (operation === "subtract") y = point.y - rhs;
    if (operation === "add") y = point.y + rhs;
    if (Number.isFinite(y)) out.push({ x: point.x, y });
  }
  return out.sort((a, b) => a.x - b.x);
}

async function loadSeries(defId: string, currency: string, timeframeDays: number, depth = 0): Promise<Pt[]> {
  if (depth > 2) return [];
  const def = CHARTS.find((row) => row.id === defId);
  if (!def) return [];
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
  const left = await loadSeries(def.params.leftId, currency, timeframeDays, depth + 1);
  const right = await loadSeries(def.params.rightId, currency, timeframeDays, depth + 1);
  return mergeSeries(left, right, def.params.operation);
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

  const [timeframeDays, setTimeframeDays] = useState<1 | 7 | 30 | 365 | 1825 | 3650 | 7300 | 18250>(
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

  useEffect(() => {
    setTimeframeDays(
      chartDef?.type === "coingecko_market_chart" ? chartDef.params.defaultDays : settings.defaultTimeframeDays
    );
    setShowControls(false);
  }, [chartDef, settings.defaultTimeframeDays]);

  const load = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      setErr(null);
      if (!chartDef) throw new Error("Chart not found");

      const converted = await loadSeries(chartDef.id, settings.currency, timeframeDays);

      if (converted.length < 2) throw new Error("Not enough data points returned");

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
    return TIMEFRAMES;
  }, []);

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
                    setTimeframeDays(tf.days);
                    setShowTimeMenu(false);
                    update("defaultTimeframeDays", tf.days);
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
                    setTimeframeDays(tf.days);
                    setShowTimeMenu(false);
                    update("defaultTimeframeDays", tf.days);
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
