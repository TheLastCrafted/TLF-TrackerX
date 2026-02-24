import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Animated, LayoutAnimation, Platform, ScrollView, Text, UIManager, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFinanceTools } from "../../src/state/finance-tools";
import { fetchCoinGeckoMarkets } from "../../src/data/coingecko";
import { fetchYahooQuotes } from "../../src/data/quotes";
import { useI18n } from "../../src/i18n/use-i18n";
import { useSettings } from "../../src/state/settings";
import { HapticPressable as Pressable } from "../../src/ui/haptic-pressable";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function money(v: number, currency: "USD" | "EUR", locale: "en" | "de"): string {
  if (!Number.isFinite(v)) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(v);
}

type PersonalWidgetId =
  | "portfolio_value"
  | "holdings_count"
  | "net_cashflow"
  | "budget_utilization"
  | "top_spend_category"
  | "income_vs_expense"
  | "monthly_savings_rate"
  | "budget_count"
  | "expenses_count"
  | "incomes_count";
type PersonalWidgetSize = "sm" | "md" | "lg";

const PERSONAL_WIDGETS: { id: PersonalWidgetId; label: string; size: PersonalWidgetSize }[] = [
  { id: "portfolio_value", label: "Portfolio Value", size: "lg" },
  { id: "holdings_count", label: "Holdings Count", size: "sm" },
  { id: "net_cashflow", label: "Net Cashflow", size: "md" },
  { id: "budget_utilization", label: "Budget Utilization", size: "md" },
  { id: "top_spend_category", label: "Top Spend Category", size: "md" },
  { id: "income_vs_expense", label: "Income vs Expense", size: "md" },
  { id: "monthly_savings_rate", label: "Savings Rate", size: "sm" },
  { id: "budget_count", label: "Budget Buckets", size: "sm" },
  { id: "expenses_count", label: "Expense Entries", size: "sm" },
  { id: "incomes_count", label: "Income Entries", size: "sm" },
];

export default function ToolsHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { t } = useI18n();
  const { settings } = useSettings();
  const { holdings, budgets, expenses, incomes } = useFinanceTools();
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [selectedWidgets, setSelectedWidgets] = useState<PersonalWidgetId[]>([
    "portfolio_value",
    "net_cashflow",
    "budget_utilization",
  ]);
  const [widgetSizes, setWidgetSizes] = useState<Partial<Record<PersonalWidgetId, PersonalWidgetSize>>>({});
  const [draggingWidget, setDraggingWidget] = useState<PersonalWidgetId | null>(null);
  const [dragHint, setDragHint] = useState<string | null>(null);
  const dragTouchRef = useRef<{ id: PersonalWidgetId | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragOffsetsRef = useRef(new Map<PersonalWidgetId, Animated.Value>());
  const dragOffsetXRef = useRef(new Map<PersonalWidgetId, Animated.Value>());

  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
  const [cryptoDailyPct, setCryptoDailyPct] = useState<Record<string, number>>({});
  const [equityPrices, setEquityPrices] = useState<Record<string, number>>({});
  const [equityPreviousPrices, setEquityPreviousPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    const ids = Array.from(new Set(holdings.map((h) => h.coinGeckoId).filter((id): id is string => Boolean(id))));
    if (!ids.length) {
      setCryptoPrices({});
      setCryptoDailyPct({});
      return;
    }
    const poll = async () => {
      try {
        const rows = await fetchCoinGeckoMarkets({
          ids,
          vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
          useCache: true,
          cacheTtlMs: 15_000,
        });
        if (!alive) return;
        setCryptoPrices(Object.fromEntries(rows.map((row) => [row.id, row.current_price])));
        setCryptoDailyPct(
          Object.fromEntries(
            rows.map((row) => [
              row.id,
              Number.isFinite(row.price_change_percentage_24h as number) ? Number(row.price_change_percentage_24h) : NaN,
            ])
          )
        );
      } catch {
        if (alive) {
          setCryptoPrices({});
          setCryptoDailyPct({});
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [holdings, settings.currency]);

  useEffect(() => {
    let alive = true;
    const symbols = Array.from(new Set(holdings.filter((h) => h.kind !== "crypto").map((h) => h.symbol)));
    if (!symbols.length) {
      setEquityPrices({});
      setEquityPreviousPrices({});
      return;
    }
    const poll = async () => {
      try {
        const rows = await fetchYahooQuotes(symbols);
        if (!alive) return;
        setEquityPrices(Object.fromEntries(rows.map((row) => [row.symbol.toUpperCase(), row.price])));
        setEquityPreviousPrices(
          Object.fromEntries(
            rows.map((row) => {
              const changePct = Number.isFinite(row.changePct) ? Number(row.changePct) : NaN;
              const fallbackPrev =
                Number.isFinite(changePct) && changePct > -99
                  ? row.price / (1 + changePct / 100)
                  : row.previousClose;
              return [row.symbol.toUpperCase(), Number.isFinite(fallbackPrev) ? Number(fallbackPrev) : row.price];
            })
          )
        );
      } catch {
        if (alive) {
          setEquityPrices({});
          setEquityPreviousPrices({});
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [holdings]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const dragOffsetFor = (id: PersonalWidgetId) => {
    const existing = dragOffsetsRef.current.get(id);
    if (existing) return existing;
    const next = new Animated.Value(0);
    dragOffsetsRef.current.set(id, next);
    return next;
  };
  const dragOffsetXFor = (id: PersonalWidgetId) => {
    const existing = dragOffsetXRef.current.get(id);
    if (existing) return existing;
    const next = new Animated.Value(0);
    dragOffsetXRef.current.set(id, next);
    return next;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startDrag = (id: PersonalWidgetId, pageX?: number, pageY?: number) => {
    setDraggingWidget(id);
    setDragHint(t("Dragging", "Ziehen"));
    dragTouchRef.current.id = id;
    dragTouchRef.current.x = pageX ?? 0;
    dragTouchRef.current.y = pageY ?? 0;
    dragStartXRef.current = pageX ?? 0;
    dragStartYRef.current = pageY ?? 0;
    dragOffsetXFor(id).setValue(0);
    dragOffsetFor(id).setValue(0);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const endDrag = (id: PersonalWidgetId) => {
    if (draggingWidget === id) {
      const offset = dragOffsetFor(id);
      const offsetX = dragOffsetXFor(id);
      Animated.spring(offset, {
        toValue: 0,
        useNativeDriver: true,
        tension: 140,
        friction: 14,
      }).start();
      Animated.spring(offsetX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 140,
        friction: 14,
      }).start();
      setDraggingWidget(null);
      setDragHint(null);
    }
    dragTouchRef.current.id = null;
    dragTouchRef.current.x = 0;
    dragTouchRef.current.y = 0;
    dragStartXRef.current = 0;
    dragStartYRef.current = 0;
  };

  const expenseTotal = useMemo(() => expenses.reduce((s, r) => s + r.amount, 0), [expenses]);
  const incomeTotal = useMemo(() => incomes.reduce((s, r) => s + r.amount, 0), [incomes]);
  const portfolioValue = useMemo(
    () =>
      holdings.reduce((sum, h) => {
        const live =
          h.kind === "crypto"
            ? (h.coinGeckoId ? cryptoPrices[h.coinGeckoId] : undefined)
            : equityPrices[h.symbol.toUpperCase()];
        const px = Number.isFinite(live) ? Number(live) : Number.isFinite(h.manualPrice) ? Number(h.manualPrice) : h.avgCost;
        return sum + h.quantity * px;
      }, 0),
    [holdings, cryptoPrices, equityPrices]
  );
  const planned = useMemo(() => budgets.reduce((s, r) => s + r.planned, 0), [budgets]);
  const spent = useMemo(() => budgets.reduce((s, r) => s + r.spent, 0), [budgets]);
  const portfolioPrevValue = useMemo(
    () =>
      holdings.reduce((sum, h) => {
        if (h.kind === "crypto") {
          const live = h.coinGeckoId ? cryptoPrices[h.coinGeckoId] : undefined;
          const id = h.coinGeckoId;
          const sourceRowPrice = Number.isFinite(live) ? Number(live) : Number.isFinite(h.manualPrice) ? Number(h.manualPrice) : h.avgCost;
          const rowPct = id ? cryptoDailyPct[id] : NaN;
          const prev = Number.isFinite(rowPct) && rowPct > -99
            ? sourceRowPrice / (1 + rowPct / 100)
            : sourceRowPrice;
          return sum + h.quantity * prev;
        }
        const prevPx = equityPreviousPrices[h.symbol.toUpperCase()];
        const fallback = equityPrices[h.symbol.toUpperCase()] ?? h.manualPrice ?? h.avgCost;
        const px = Number.isFinite(prevPx) ? prevPx : fallback;
        return sum + h.quantity * px;
      }, 0),
    [holdings, cryptoPrices, cryptoDailyPct, equityPreviousPrices, equityPrices]
  );
  const portfolioDailyPct = useMemo(
    () => (portfolioPrevValue > 0 ? ((portfolioValue - portfolioPrevValue) / portfolioPrevValue) * 100 : NaN),
    [portfolioValue, portfolioPrevValue]
  );
  const cashUsagePct = useMemo(
    () => (incomeTotal > 0 ? (expenseTotal / incomeTotal) * 100 : NaN),
    [expenseTotal, incomeTotal]
  );
  const topCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of expenses) m.set(row.category, (m.get(row.category) ?? 0) + row.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [expenses]);

  const shortcuts = [
    { label: "Portfolio", icon: "work", route: "/portfolio", tint: "#9B80FF" },
    { label: "Strategy", icon: "functions", route: "/strategy", tint: "#79B9FF" },
    { label: "Budget", icon: "account-balance-wallet", route: "/budget", tint: "#6FD6C8" },
    { label: "Cashflow", icon: "bar-chart", route: "/cashflow", tint: "#8EC8FF" },
  ] as const;

  const toggleWidget = (id: PersonalWidgetId) => {
    setSelectedWidgets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dropWidgetOn = (target: PersonalWidgetId) => {
    if (!draggingWidget || draggingWidget === target) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedWidgets((prev) => {
      const from = prev.indexOf(draggingWidget);
      const to = prev.indexOf(target);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, draggingWidget);
      return next;
    });
    setDraggingWidget(null);
    setDragHint(null);
  };
  const moveWidget = (id: PersonalWidgetId, direction: -1 | 1, step = 1) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedWidgets((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const primaryTarget = idx + direction * Math.max(1, step);
      const fallbackTarget = idx + direction;
      const target =
        primaryTarget >= 0 && primaryTarget < prev.length
          ? primaryTarget
          : fallbackTarget >= 0 && fallbackTarget < prev.length
            ? fallbackTarget
            : -1;
      if (target < 0) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onDragMove = (id: PersonalWidgetId, e: any) => {
    if (draggingWidget !== id) return;
    const x = e.nativeEvent.pageX;
    const y = e.nativeEvent.pageY;
    if (!dragStartXRef.current) {
      dragStartXRef.current = x;
    }
    if (!dragStartYRef.current) {
      dragStartYRef.current = y;
    }
    dragOffsetXFor(id).setValue(x - dragStartXRef.current);
    dragOffsetFor(id).setValue(y - dragStartYRef.current);
    if (!dragTouchRef.current.x && !dragTouchRef.current.y) {
      dragTouchRef.current.x = x;
      dragTouchRef.current.y = y;
      return;
    }
    const deltaX = x - dragTouchRef.current.x;
    const delta = y - dragTouchRef.current.y;
    const threshold = 12;
    const rowStep = 2;
    if (Math.abs(deltaX) >= threshold || Math.abs(delta) >= threshold) {
      if (Math.abs(deltaX) > Math.abs(delta) * 1.35) {
        moveWidget(id, deltaX > 0 ? 1 : -1);
        setDragHint(deltaX > 0 ? t("Moving right", "Nach rechts") : t("Moving left", "Nach links"));
      } else {
        moveWidget(id, delta > 0 ? 1 : -1, rowStep);
        setDragHint(delta > 0 ? t("Moving down", "Nach unten") : t("Moving up", "Nach oben"));
      }
      dragTouchRef.current.x = x;
      dragTouchRef.current.y = y;
    }
  };
  const cycleWidgetSize = (id: PersonalWidgetId) => {
    const current = widgetSizes[id] ?? (PERSONAL_WIDGETS.find((w) => w.id === id)?.size ?? "md");
    const next: PersonalWidgetSize = current === "sm" ? "md" : current === "md" ? "lg" : "sm";
    setWidgetSizes((prev) => ({ ...prev, [id]: next }));
  };
  const widgetSize = (id: PersonalWidgetId): PersonalWidgetSize => widgetSizes[id] ?? (PERSONAL_WIDGETS.find((w) => w.id === id)?.size ?? "md");
  const widgetFloatingStyle = (id: PersonalWidgetId) =>
    draggingWidget === id
      ? {
          transform: [{ translateX: dragOffsetXFor(id) }, { translateY: dragOffsetFor(id) }, { scale: 1.05 }],
          shadowColor: "#8E63F0",
          shadowOpacity: 0.42,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 12 },
          elevation: 22,
          zIndex: 30,
        }
      : null;
  const sizeStyle = (size: PersonalWidgetSize) => {
    if (size === "lg") return { width: "100%" as const, minHeight: 100 };
    if (size === "md") return { width: "48.5%" as const, minHeight: 94 };
    return { width: "31.5%" as const, minHeight: 82 };
  };

  const cardStyle = {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
  } as const;
  const renderWidget = (id: PersonalWidgetId) => {
    switch (id) {
      case "portfolio_value":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Portfolio Value</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{money(portfolioValue, settings.currency, settings.language)}</Text>
            <Text style={{ color: Number.isFinite(portfolioDailyPct) ? (portfolioDailyPct >= 0 ? "#5CE0AB" : "#FF8497") : colors.subtext, marginTop: 3, fontWeight: "700" }}>
              {Number.isFinite(portfolioDailyPct) ? `${portfolioDailyPct >= 0 ? "+" : ""}${portfolioDailyPct.toFixed(2)}% vs prior day` : "-"}
            </Text>
          </>
        );
      case "holdings_count":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Holdings Count</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{holdings.length} positions</Text>
          </>
        );
      case "net_cashflow":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Net Cashflow</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{money(incomeTotal - expenseTotal, settings.currency, settings.language)}</Text>
            <Text style={{ color: Number.isFinite(cashUsagePct) ? (cashUsagePct <= 100 ? "#5CE0AB" : "#FF8497") : colors.subtext, marginTop: 3, fontWeight: "700" }}>
              {Number.isFinite(cashUsagePct) ? `${cashUsagePct.toFixed(1)}% usage` : "-"}
            </Text>
          </>
        );
      case "budget_utilization":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Budget Utilization</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>
              {planned > 0 ? `${((spent / planned) * 100).toFixed(1)}% used` : "No budget configured"}
            </Text>
          </>
        );
      case "top_spend_category":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Top Spend Category</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>
              {topCategory ? `${topCategory[0]} • ${money(topCategory[1], settings.currency, settings.language)}` : "-"}
            </Text>
          </>
        );
      case "income_vs_expense":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Income vs Expense</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>
              {money(incomeTotal, settings.currency, settings.language)} • {money(expenseTotal, settings.currency, settings.language)}
            </Text>
          </>
        );
      case "monthly_savings_rate":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Savings Rate</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{incomeTotal > 0 ? `${(((incomeTotal - expenseTotal) / incomeTotal) * 100).toFixed(1)}%` : "-"}</Text>
          </>
        );
      case "budget_count":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Budget Buckets</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{budgets.length} configured</Text>
          </>
        );
      case "expenses_count":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Expense Entries</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{expenses.length} entries</Text>
          </>
        );
      case "incomes_count":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Income Entries</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>{incomes.length} entries</Text>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 118 }} scrollEnabled={!draggingWidget}>
      <TabHeader title={t("Personal Hub", "Persoenlicher Hub")} />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={[cardStyle, { marginBottom: 10 }]}>
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>{t("Overview", "Uebersicht")}</Text>
          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#18152A" : "#FAF6FF", padding: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>Portfolio</Text>
              <Text style={{ color: colors.text, marginTop: 3, fontWeight: "900" }}>{money(portfolioValue, settings.currency, settings.language)}</Text>
              <Text style={{ color: colors.subtext, fontSize: 11 }}>{holdings.length} positions</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#18152A" : "#FAF6FF", padding: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>Cashflow</Text>
              <Text style={{ color: colors.text, marginTop: 3, fontWeight: "900" }}>{money(incomeTotal - expenseTotal, settings.currency, settings.language)}</Text>
              <Text style={{ color: colors.subtext, fontSize: 11 }}>net</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#18152A" : "#FAF6FF", padding: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>Budgets</Text>
              <Text style={{ color: colors.text, marginTop: 3, fontWeight: "900" }}>{budgets.length}</Text>
              <Text style={{ color: colors.subtext, fontSize: 11 }}>active</Text>
            </View>
          </View>
        </View>

        <View style={[cardStyle, { marginBottom: 10 }]}>
          <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 8 }}>{t("Quick Nav", "Schnellnavigation")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {shortcuts.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => router.push(s.route)}
                style={({ pressed }) => ({
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#1A2033" : "#EDF3FF") : colors.dark ? "#151926" : "#F8FBFF",
                  padding: 11,
                  alignItems: "center",
                })}
              >
                <MaterialIcons name={s.icon} size={20} color={s.tint} />
                <Text style={{ color: colors.subtext, marginTop: 4, fontSize: 11, fontWeight: "700" }}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[cardStyle, { marginBottom: 10 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Widgets", "Widgets")}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => {
                  setEditingLayout((v) => !v);
                  if (editingLayout) {
                    setDraggingWidget(null);
                    setDragHint(null);
                  }
                }}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#5F43B2",
                  backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: "#B79DFF", fontSize: 12, fontWeight: "700" }}>{editingLayout ? t("Done", "Fertig") : t("Drag", "Verschieben")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowWidgetPicker((v) => !v)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#5F43B2",
                  backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: "#B79DFF", fontSize: 12, fontWeight: "700" }}>{showWidgetPicker ? t("Close", "Schliessen") : t("Manage", "Verwalten")}</Text>
              </Pressable>
            </View>
          </View>

          {showWidgetPicker && (
            <View style={{ marginTop: 10, gap: 8 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {PERSONAL_WIDGETS.map((w) => {
                  const active = selectedWidgets.includes(w.id);
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => toggleWidget(w.id)}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? "#8E63F0" : colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#241F40" : "#F1EBFF") : active ? (colors.dark ? "#2A2250" : "#F4EEFF") : colors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      })}
                    >
                      <Text style={{ color: active ? "#8E63F0" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{w.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {editingLayout && (
                <>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>
                    {t("Use up/down controls for stable widget reordering. Tap size chip to resize.", "Nutze Hoch/Runter fuer stabiles Umordnen. Tippe auf die Groesse zum Anpassen.")}
                  </Text>
                  {!!dragHint && <Text style={{ color: "#8E63F0", fontSize: 12, fontWeight: "700" }}>{dragHint}</Text>}
                  {selectedWidgets.map((id) => (
                    <Pressable
                      key={`mgr_${id}`}
                      style={({ pressed }) => ({
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#241F40" : "#F1EBFF") : colors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <MaterialIcons name="widgets" size={16} color={colors.subtext} />
                        <Text style={{ color: colors.text, fontWeight: "700" }}>{PERSONAL_WIDGETS.find((w) => w.id === id)?.label ?? id}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable
                          onPress={() => moveWidget(id, -1)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: pressed ? (colors.dark ? "#221C3A" : "#F1EBFF") : colors.surface,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          })}
                        >
                          <Text style={{ color: colors.subtext, fontWeight: "700", fontSize: 11 }}>{t("Up", "Hoch")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => moveWidget(id, 1)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: pressed ? (colors.dark ? "#221C3A" : "#F1EBFF") : colors.surface,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          })}
                        >
                          <Text style={{ color: colors.subtext, fontWeight: "700", fontSize: 11 }}>{t("Down", "Runter")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => cycleWidgetSize(id)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: pressed ? (colors.dark ? "#221C3A" : "#F1EBFF") : colors.surface,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          })}
                        >
                          <Text style={{ color: colors.subtext, fontWeight: "700", fontSize: 11 }}>{widgetSize(id).toUpperCase()}</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {selectedWidgets.map((id) => (
            <Animated.View
              key={id}
              style={[
                cardStyle,
                sizeStyle(widgetSize(id)),
                widgetFloatingStyle(id),
              ]}
            >
              {editingLayout && (
                <>
                  <View
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      zIndex: 10,
                      flexDirection: "row",
                      gap: 6,
                    }}
                  >
                    <Pressable
                      onPress={() => moveWidget(id, -1)}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.dark ? "#251D45" : "#EEE5FF",
                        paddingHorizontal: 9,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "800" }}>{t("Up", "Hoch")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => moveWidget(id, 1)}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.dark ? "#251D45" : "#EEE5FF",
                        paddingHorizontal: 9,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "800" }}>{t("Down", "Runter")}</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => cycleWidgetSize(id)}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      zIndex: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.dark ? "#251D45" : "#EEE5FF",
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 10, fontWeight: "800" }}>{widgetSize(id).toUpperCase()}</Text>
                  </Pressable>
                </>
              )}
              {renderWidget(id)}
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={{ height: Math.max(80, insets.bottom + 54) }} />
    </ScrollView>
  );
}
