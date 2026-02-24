import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CHARTS } from "../../src/catalog/charts";
import { fetchCoinGeckoMarketChart } from "../../src/data/coingecko";
import { fetchFredSeries } from "../../src/data/macro";
import { useSettings } from "../../src/state/settings";
import { useAppColors } from "../../src/ui/use-app-colors";

type Pt = { x: number; y: number };

function correlation(left: Pt[], right: Pt[]): number {
  const rightByDay = new Map<string, number>();
  for (const point of right) rightByDay.set(new Date(point.x).toISOString().slice(0, 10), point.y);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of left) {
    const key = new Date(point.x).toISOString().slice(0, 10);
    const y = rightByDay.get(key);
    if (!Number.isFinite(y)) continue;
    xs.push(point.y);
    ys.push(y!);
  }
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}

function mergeSeries(left: Pt[], right: Pt[], operation: "divide" | "multiply" | "subtract" | "add"): Pt[] {
  const rightByDay = new Map<string, number>();
  for (const point of right) rightByDay.set(new Date(point.x).toISOString().slice(0, 10), point.y);
  const out: Pt[] = [];
  for (const point of left) {
    const rhs = rightByDay.get(new Date(point.x).toISOString().slice(0, 10));
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

async function loadSeries(chartId: string, currency: string, days: 1 | 7 | 30 | 365): Promise<Pt[]> {
  const def = CHARTS.find((row) => row.id === chartId);
  if (!def) return [];
  if (def.type === "coingecko_market_chart") {
    const raw = await fetchCoinGeckoMarketChart({
      coinId: def.params.coinId,
      vsCurrency: currency.toLowerCase() as "usd" | "eur",
      days,
      metric: def.params.metric,
    });
    return raw.map((p) => ({ x: p.x, y: p.y })).filter((p) => Number.isFinite(p.y));
  }
  if (def.type === "fred_series") {
    const raw = await fetchFredSeries(def.params);
    return raw.map((p) => ({ x: p.x, y: p.y })).filter((p) => Number.isFinite(p.y));
  }
  const left = await loadSeries(def.params.leftId, currency, days);
  const right = await loadSeries(def.params.rightId, currency, days);
  return mergeSeries(left, right, def.params.operation);
}

export default function ChartLabScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const colors = useAppColors();
  const [leftQuery, setLeftQuery] = useState("dollar");
  const [rightQuery, setRightQuery] = useState("market cap");
  const [leftId, setLeftId] = useState("dollar_index");
  const [rightId, setRightId] = useState("btc_market_cap_usd");
  const [operation, setOperation] = useState<"divide" | "multiply" | "subtract" | "add">("divide");
  const [days, setDays] = useState<1 | 7 | 30 | 365>(30);
  const [points, setPoints] = useState<Pt[]>([]);
  const [corrValue, setCorrValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leftMatches = useMemo(() => {
    const q = leftQuery.trim().toLowerCase();
    if (!q) return CHARTS.slice(0, 24);
    return CHARTS.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 24);
  }, [leftQuery]);
  const rightMatches = useMemo(() => {
    const q = rightQuery.trim().toLowerCase();
    if (!q) return CHARTS.slice(0, 24);
    return CHARTS.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 24);
  }, [rightQuery]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const [left, right] = await Promise.all([loadSeries(leftId, settings.currency, days), loadSeries(rightId, settings.currency, days)]);
      const merged = mergeSeries(left, right, operation);
      if (merged.length < 2) throw new Error("Not enough overlapping datapoints. Try another pair or longer timeframe.");
      setPoints(merged);
      const c = correlation(left, right);
      setCorrValue(Number.isFinite(c) ? c : null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to build chart");
      setPoints([]);
      setCorrValue(null);
    } finally {
      setLoading(false);
    }
  };

  const chartData = points.map((p) => ({ value: p.y }));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 14, paddingTop: insets.top + 10, paddingBottom: 24 }}>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "900" }}>Chart Lab</Text>
      <Text style={{ color: colors.subtext, marginTop: 6 }}>
        Build custom combinations like TradingView formulas: series A {operation} series B.
      </Text>

      <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 6 }}>Series A (Numerator)</Text>
        <TextInput value={leftQuery} onChangeText={setLeftQuery} placeholder="Search first series" placeholderTextColor={colors.subtext} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 11, paddingVertical: 9 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {leftMatches.map((row) => (
            <Pressable key={row.id} onPress={() => setLeftId(row.id)} style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1, borderColor: leftId === row.id ? "#5F43B2" : "#2A3249", backgroundColor: pressed ? "#151D2A" : leftId === row.id ? "#1B1534" : "#111827", paddingHorizontal: 9, paddingVertical: 6 })}>
              <Text style={{ color: leftId === row.id ? "#C9BCFF" : "#D6E0FF", fontSize: 11, fontWeight: "700" }}>{row.title}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 6 }}>Series B (Denominator)</Text>
        <TextInput value={rightQuery} onChangeText={setRightQuery} placeholder="Search second series" placeholderTextColor={colors.subtext} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 11, paddingVertical: 9 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {rightMatches.map((row) => (
            <Pressable key={row.id} onPress={() => setRightId(row.id)} style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1, borderColor: rightId === row.id ? "#5F43B2" : "#2A3249", backgroundColor: pressed ? "#151D2A" : rightId === row.id ? "#1B1534" : "#111827", paddingHorizontal: 9, paddingVertical: 6 })}>
              <Text style={{ color: rightId === row.id ? "#C9BCFF" : "#D6E0FF", fontSize: 11, fontWeight: "700" }}>{row.title}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["divide", "multiply", "subtract", "add"] as const).map((op) => (
          <Pressable key={op} onPress={() => setOperation(op)} style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1, borderColor: operation === op ? "#5F43B2" : "#2A3249", backgroundColor: pressed ? "#151D2A" : operation === op ? "#1B1534" : "#111827", paddingHorizontal: 10, paddingVertical: 7 })}>
            <Text style={{ color: operation === op ? "#C9BCFF" : "#D6E0FF", fontSize: 12, fontWeight: "700" }}>{op.toUpperCase()}</Text>
          </Pressable>
        ))}
        {([
          [1, "1D"],
          [7, "7D"],
          [30, "30D"],
          [365, "1Y"],
        ] as const).map(([value, label]) => (
          <Pressable key={value} onPress={() => setDays(value)} style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1, borderColor: days === value ? "#4699D1" : "#2A3249", backgroundColor: pressed ? "#15212F" : days === value ? "#12314A" : "#111827", paddingHorizontal: 10, paddingVertical: 7 })}>
            <Text style={{ color: days === value ? "#AFDEFF" : "#D6E0FF", fontSize: 12, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => void run()} style={({ pressed }) => ({ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: "#3654A8", backgroundColor: pressed ? "#1A2E66" : "#152554", paddingHorizontal: 12, paddingVertical: 10, alignSelf: "flex-start" })}>
        <Text style={{ color: "#E5ECFF", fontWeight: "900" }}>{loading ? "Building..." : "Build Combination Chart"}</Text>
      </Pressable>

      {!!error && <Text style={{ color: "#F4A5B4", marginTop: 8 }}>{error}</Text>}

      {!!chartData.length && (
        <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 8 }}>
            {leftId} {operation} {rightId}
          </Text>
          <Text style={{ color: colors.subtext, marginBottom: 8 }}>
            Correlation matrix (A vs B): {corrValue === null ? "-" : corrValue.toFixed(3)}
          </Text>
          <LineChart data={chartData} width={330} hideDataPoints color="#8B5CF6" thickness={2} areaChart startFillColor="#8B5CF6" endFillColor="#8B5CF6" startOpacity={0.18} endOpacity={0.02} />
        </View>
      )}
    </ScrollView>
  );
}
