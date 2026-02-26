import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { searchUniversalAssets, UniversalAsset } from "../../src/data/asset-search";
import { FormInput } from "../../src/ui/form-input";
import { ActionButton } from "../../src/ui/action-button";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function toMoney(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function projectFutureValue(initial: number, monthly: number, annualReturn: number, years: number): number {
  let value = initial;
  const months = Math.floor(years * 12);
  for (let i = 0; i < months; i += 1) {
    value = (value + monthly) * (1 + annualReturn / 12);
  }
  return value;
}

type StrategyAsset = {
  id: string;
  symbol: string;
  name: string;
  kind: "stock" | "etf" | "crypto";
  expectedReturnPct: number;
  allocationPct: number;
};

export default function StrategyScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const [compactHeader, setCompactHeader] = useState(false);
  const [showCoreInputs, setShowCoreInputs] = useState(true);
  const [showAllocInputs, setShowAllocInputs] = useState(false);
  const [showRetireInputs, setShowRetireInputs] = useState(false);

  const [initialInput, setInitialInput] = useState("10000");
  const [monthlyInput, setMonthlyInput] = useState("500");
  const [yieldInput, setYieldInput] = useState("7");
  const [yearsInput, setYearsInput] = useState("10");
  const [inflationInput, setInflationInput] = useState("2.5");

  const [withdrawRateInput, setWithdrawRateInput] = useState("4");
  const [retireTargetInput, setRetireTargetInput] = useState("1500000");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchRows, setSearchRows] = useState<UniversalAsset[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });
  const [strategyAssets, setStrategyAssets] = useState<StrategyAsset[]>([
    { id: "preset_spy", symbol: "SPY", name: "S&P 500 ETF", kind: "etf", expectedReturnPct: 8, allocationPct: 50 },
    { id: "preset_qqq", symbol: "QQQ", name: "NASDAQ 100 ETF", kind: "etf", expectedReturnPct: 10, allocationPct: 20 },
    { id: "preset_btc", symbol: "BTC", name: "Bitcoin", kind: "crypto", expectedReturnPct: 15, allocationPct: 20 },
    { id: "preset_bonds", symbol: "BND", name: "US Aggregate Bond ETF", kind: "etf", expectedReturnPct: 4, allocationPct: 10 },
  ]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchRows([]);
      setSearchLoading(false);
      return;
    }
    let alive = true;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void searchUniversalAssets(q, 18)
        .then((rows) => {
          if (alive) setSearchRows(rows);
        })
        .catch(() => {
          if (alive) setSearchRows([]);
        })
        .finally(() => {
          if (alive) setSearchLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const parsed = useMemo(() => {
    const initial = Number(initialInput);
    const monthly = Number(monthlyInput);
    const years = Number(yearsInput);
    const inflation = Number(inflationInput) / 100;
    return {
      initial: Number.isFinite(initial) ? initial : 0,
      monthly: Number.isFinite(monthly) ? monthly : 0,
      years: Number.isFinite(years) ? years : 0,
      inflation: Number.isFinite(inflation) ? inflation : 0,
    };
  }, [initialInput, monthlyInput, yearsInput, inflationInput]);

  const weightedReturnPct = useMemo(() => {
    const totalWeight = strategyAssets.reduce((sum, row) => sum + row.allocationPct, 0);
    if (totalWeight <= 0) return 0;
    const weighted = strategyAssets.reduce((sum, row) => sum + row.expectedReturnPct * (row.allocationPct / totalWeight), 0);
    return weighted;
  }, [strategyAssets]);

  const projection = useMemo(() => {
    if (parsed.years <= 0) return null;
    const annualReturn = Number(yieldInput) > 0 ? Number(yieldInput) / 100 : weightedReturnPct / 100;
    const value = projectFutureValue(parsed.initial, parsed.monthly, annualReturn, parsed.years);
    const invested = parsed.initial + parsed.monthly * Math.floor(parsed.years * 12);
    const gain = value - invested;
    const realValue = value / Math.pow(1 + parsed.inflation, parsed.years);
    return { invested, value, gain, realValue, annualReturnPct: annualReturn * 100 };
  }, [parsed, yieldInput, weightedReturnPct]);

  const scenarios = useMemo(() => {
    if (parsed.years <= 0) return [];
    const set = [
      { key: "conservative", label: "Conservative", annualReturn: Math.max(weightedReturnPct - 3, 2) / 100, color: "#AAB2D3" },
      { key: "base", label: "Base Case", annualReturn: Math.max(weightedReturnPct, 2) / 100, color: "#8ED3FF" },
      { key: "aggressive", label: "Aggressive", annualReturn: Math.max(weightedReturnPct + 4, 3) / 100, color: "#9CF0C9" },
    ] as const;
    return set.map((scenario) => {
      const value = projectFutureValue(parsed.initial, parsed.monthly, scenario.annualReturn, parsed.years);
      const realValue = value / Math.pow(1 + parsed.inflation, parsed.years);
      return { ...scenario, value, realValue };
    });
  }, [parsed, weightedReturnPct]);

  const retirement = useMemo(() => {
    const target = Number(retireTargetInput);
    const withdraw = Number(withdrawRateInput) / 100;
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(withdraw) || withdraw <= 0) return null;
    const monthlyNeeded = (target * withdraw) / 12;
    const contributionCoverage = monthlyNeeded > 0 ? (parsed.monthly / monthlyNeeded) * 100 : 0;
    const currentProjection = projection?.value ?? 0;
    const fundedRatio = target > 0 ? (currentProjection / target) * 100 : 0;
    return { monthlyNeeded, contributionCoverage, fundedRatio };
  }, [retireTargetInput, withdrawRateInput, parsed.monthly, projection]);

  const requiredReturn = useMemo(() => {
    const target = Number(retireTargetInput);
    if (!Number.isFinite(target) || target <= 0 || parsed.years <= 0) return null;
    const months = Math.floor(parsed.years * 12);
    let low = 0;
    let high = 0.4;
    for (let i = 0; i < 50; i += 1) {
      const mid = (low + high) / 2;
      const val = projectFutureValue(parsed.initial, parsed.monthly, mid, parsed.years);
      if (val >= target) high = mid;
      else low = mid;
    }
    return { annualPct: high * 100, months };
  }, [retireTargetInput, parsed]);

  const ladder = useMemo(() => {
    const years = Math.max(parsed.years, 1);
    const points = [1, 3, 5, 10, 15, 20, 25, 30].filter((y) => y <= Math.max(30, years));
    return points.map((year) => ({
      year,
      value: projectFutureValue(parsed.initial, parsed.monthly, Math.max(weightedReturnPct, 2) / 100, year),
    }));
  }, [parsed, weightedReturnPct]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 120)}
      scrollEventThrottle={16}
    >
      {compactHeader && (
        <View
          style={{
            position: "absolute",
            top: insets.top + 6,
            left: SCREEN_HORIZONTAL_PADDING,
            right: SCREEN_HORIZONTAL_PADDING,
            zIndex: 30,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.dark ? "rgba(15,16,24,0.96)" : "rgba(255,255,255,0.96)",
            paddingHorizontal: 12,
            paddingVertical: 9,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>Strategy</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{yearsInput}y horizon</Text>
        </View>
      )}

      <TabHeader title="Strategy" subtitle="Scenario engine, allocation assumptions, and long-horizon target planning." />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Core Inputs</Text>
            <ActionButton label={showCoreInputs ? "Close" : "Edit Inputs"} onPress={() => setShowCoreInputs((v) => !v)}/>
          </View>
          {showCoreInputs && (
            <>
              <FormInput value={initialInput} onChangeText={setInitialInput} keyboardType="decimal-pad" label="Initial Capital" placeholder="e.g. 10000" help="Current invested amount at start." />
              <FormInput value={monthlyInput} onChangeText={setMonthlyInput} keyboardType="decimal-pad" label="Monthly Contribution" placeholder="e.g. 500" help="How much you add every month." />
              <FormInput value={yieldInput} onChangeText={setYieldInput} keyboardType="decimal-pad" label="Manual Annual Return (%)" placeholder="e.g. 8" help="Optional override. Leave 0 to use weighted allocation return." />
              <FormInput value={yearsInput} onChangeText={setYearsInput} keyboardType="decimal-pad" label="Time Horizon (Years)" placeholder="e.g. 15" help="Projection length in years." />
              <FormInput value={inflationInput} onChangeText={setInflationInput} keyboardType="decimal-pad" label="Inflation Assumption (%)" placeholder="e.g. 2.5" help="Used to calculate real (inflation-adjusted) value." />
            </>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Allocation Assumptions</Text>
            <ActionButton label={showAllocInputs ? "Close" : "Add/Adjust Assets"} onPress={() => setShowAllocInputs((v) => !v)}/>
          </View>
          <Text style={{ color: colors.subtext, marginTop: 4, fontSize: 12 }}>
            Add stocks, ETFs, or crypto from universal search and set your own expected annual return + weight.
          </Text>
          {showAllocInputs && (
            <>
          <FormInput value={searchQuery} onChangeText={setSearchQuery} label="Global Search For Assumption Universe" placeholder="Search listings globally (AAPL, VOO, BTC...)" help="Pick the assets you want included in strategy assumptions." style={{ marginTop: 8 }} />
          {searchLoading && (
            <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#83C8FF" />
              <Text style={{ color: "#8FA0C8", fontSize: 12 }}>Searching...</Text>
            </View>
          )}
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {searchRows.map((asset) => (
              <Pressable
                key={asset.id}
                onPress={() => {
                  setStrategyAssets((prev) => {
                    if (prev.some((row) => row.symbol === asset.symbol && row.kind === asset.kind)) return prev;
                    const fallbackReturn = asset.kind === "crypto" ? 14 : asset.kind === "etf" ? 8 : 9;
                    return [
                      ...prev,
                      {
                        id: asset.id,
                        symbol: asset.symbol.toUpperCase(),
                        name: asset.name,
                        kind: asset.kind,
                        expectedReturnPct: fallbackReturn,
                        allocationPct: 0,
                      },
                    ];
                  });
                }}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#2A3A54",
                  backgroundColor: pressed ? "#15263C" : "#101B2D",
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: "#CFE0FF", fontSize: 11, fontWeight: "700" }}>
                  {asset.symbol} ({asset.kind.toUpperCase()})
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: 10, gap: 8 }}>
            {strategyAssets.map((asset) => (
              <View key={asset.id} style={{ borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 9 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: "#F0F4FF", fontWeight: "800" }}>{asset.symbol} • {asset.name}</Text>
                  <Pressable onPress={() => setStrategyAssets((prev) => prev.filter((row) => row.id !== asset.id))}>
                    <Text style={{ color: "#F0A3B2", fontWeight: "700" }}>Remove</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 7 }}>
                  <TextInput
                    value={String(asset.expectedReturnPct)}
                    onChangeText={(value) =>
                      setStrategyAssets((prev) =>
                        prev.map((row) => (row.id === asset.id ? { ...row, expectedReturnPct: Number(value) || 0 } : row))
                      )
                    }
                    keyboardType="decimal-pad"
                    placeholder="Return %"
                    placeholderTextColor="#6B6B7A"
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 7 }}
                  />
                  <TextInput
                    value={String(asset.allocationPct)}
                    onChangeText={(value) =>
                      setStrategyAssets((prev) =>
                        prev.map((row) => (row.id === asset.id ? { ...row, allocationPct: Number(value) || 0 } : row))
                      )
                    }
                    keyboardType="decimal-pad"
                    placeholder="Allocation %"
                    placeholderTextColor="#6B6B7A"
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 7 }}
                  />
                </View>
              </View>
            ))}
          </View>
          <Text style={{ color: "#8FBCEB", marginTop: 8, fontWeight: "700" }}>
            Weighted expected return: {weightedReturnPct.toFixed(2)}%
          </Text>
            </>
          )}
        </View>

        {!!projection && (
          <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10, gap: 4 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Compound Projection</Text>
            <Text style={{ color: colors.subtext }}>Invested {toMoney(projection.invested)}</Text>
            <Text style={{ color: "#71DDB0", fontWeight: "700" }}>Nominal Value {toMoney(projection.value)}</Text>
            <Text style={{ color: colors.subtext }}>Real Value (inflation-adjusted) {toMoney(projection.realValue)}</Text>
            <Text style={{ color: "#8FC9FF" }}>Total Gain {toMoney(projection.gain)}</Text>
            <Text style={{ color: "#95B7E8", fontSize: 12 }}>Using annual return {projection.annualReturnPct.toFixed(2)}%</Text>
          </View>
        )}

        {!!scenarios.length && (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 17 }}>Scenario Matrix</Text>
            {scenarios.map((scenario) => (
              <View key={scenario.key} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                <Text style={{ color: scenario.color, fontWeight: "900" }}>{scenario.label}</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>Nominal {toMoney(scenario.value)}</Text>
                <Text style={{ color: colors.subtext }}>Real {toMoney(scenario.realValue)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Retirement Lens</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>Withdrawal, target funding, and required return diagnostics.</Text>
          <View style={{ marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>Retirement Inputs</Text>
              <ActionButton label={showRetireInputs ? "Close" : "Retirement Inputs"} onPress={() => setShowRetireInputs((v) => !v)}/>
            </View>
            {showRetireInputs && (
              <>
                <FormInput value={retireTargetInput} onChangeText={setRetireTargetInput} keyboardType="decimal-pad" label="Target Portfolio Size" placeholder="e.g. 1500000" help="Long-term target amount." />
                <FormInput value={withdrawRateInput} onChangeText={setWithdrawRateInput} keyboardType="decimal-pad" label="Withdrawal Rate (%)" placeholder="e.g. 4" help="Annual withdrawal assumption in retirement." />
              </>
            )}
          </View>

          {!!retirement && (
            <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10, gap: 4 }}>
              <Text style={{ color: colors.subtext }}>Required monthly draw: {toMoney(retirement.monthlyNeeded)}</Text>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Contribution coverage: {retirement.contributionCoverage.toFixed(2)}%</Text>
              <Text style={{ color: "#8FC9FF" }}>Projected funding ratio: {retirement.fundedRatio.toFixed(2)}%</Text>
            </View>
          )}

          {!!requiredReturn && (
            <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>Required Return Check</Text>
              <Text style={{ color: colors.subtext, marginTop: 4 }}>
                Required annual return to reach target in {yearsInput} years: {requiredReturn.annualPct.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>

        {!!ladder.length && (
          <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Milestone Ladder</Text>
            <View style={{ marginTop: 6, gap: 3 }}>
              {ladder.map((row) => (
                <Text key={row.year} style={{ color: colors.subtext }}>Year {row.year}: {toMoney(row.value)}</Text>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
