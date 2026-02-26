import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, LayoutAnimation, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, UIManager, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CHARTS } from "../../src/catalog/charts";
import { fetchFredSeries } from "../../src/data/macro";
import { useI18n } from "../../src/i18n/use-i18n";
import { loadPersistedJson, savePersistedJson } from "../../src/lib/persistence";
import { useSettings } from "../../src/state/settings";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

type Region = "All" | "US" | "EU";

type KpiDef = {
  id: string;
  chartId: string;
  label: string;
  seriesId: string;
  format: "percent" | "number";
  region: Exclude<Region, "All">;
};
type MacroWidget =
  | "rates"
  | "labor"
  | "inflation"
  | "liquidity"
  | "fx"
  | "risk"
  | "growth"
  | "housing"
  | "credit"
  | "energy"
  | "sentiment"
  | "calendar"
  | "policy"
  | "bonds"
  | "manufacturing";
type MacroWidgetSize = "sm" | "md" | "lg";

const KPI_DEFS: KpiDef[] = [
  { id: "us_rate", chartId: "us_fed_funds_rate", label: "US Policy Rate", seriesId: "FEDFUNDS", format: "percent", region: "US" },
  { id: "us_unemp", chartId: "us_unemployment", label: "US Unemployment", seriesId: "UNRATE", format: "percent", region: "US" },
  { id: "us_claims", chartId: "us_initial_claims", label: "US Initial Claims", seriesId: "ICSA", format: "number", region: "US" },
  { id: "us_10y", chartId: "us_10y_yield", label: "US 10Y Yield", seriesId: "DGS10", format: "percent", region: "US" },
  { id: "us_cpi", chartId: "us_cpi", label: "US CPI", seriesId: "CPIAUCSL", format: "number", region: "US" },
  { id: "us_m2", chartId: "us_money_supply_m2", label: "US M2", seriesId: "M2SL", format: "number", region: "US" },
  { id: "us_gdp", chartId: "us_gdp", label: "US GDP", seriesId: "GDP", format: "number", region: "US" },
  { id: "us_housing", chartId: "us_housing_starts", label: "US Housing Starts", seriesId: "HOUST", format: "number", region: "US" },
  { id: "us_hy", chartId: "us_hy_spread", label: "US HY Spread", seriesId: "BAMLH0A0HYM2", format: "percent", region: "US" },
  { id: "us_curve", chartId: "us_10y_2y_spread", label: "US 10Y-2Y Curve", seriesId: "T10Y2Y", format: "percent", region: "US" },
  { id: "us_oil", chartId: "wti_crude_oil", label: "WTI Crude", seriesId: "DCOILWTICO", format: "number", region: "US" },
  { id: "us_dxy", chartId: "us_dxy", label: "DXY", seriesId: "DTWEXBGS", format: "number", region: "US" },
  { id: "eu_rate", chartId: "eu_ecb_deposit_rate", label: "EU Deposit Rate", seriesId: "ECBDFR", format: "percent", region: "EU" },
  { id: "eu_unemp", chartId: "eu_unemployment", label: "EU Unemployment", seriesId: "LRHUTTTTEZM156S", format: "percent", region: "EU" },
  { id: "eu_hicp", chartId: "eu_hicp", label: "EU HICP", seriesId: "CP0000EZ19M086NEST", format: "number", region: "EU" },
  { id: "eu_gdp", chartId: "eu_gdp", label: "EU GDP", seriesId: "CLVMNACSCAB1GQEA19", format: "number", region: "EU" },
  { id: "eurusd", chartId: "eur_usd", label: "EUR/USD", seriesId: "DEXUSEU", format: "number", region: "EU" },
];

const FEEDS = [
  {
    id: "fed",
    title: "Federal Reserve (FOMC)",
    description: "US policy statements, projections, and press conferences.",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
  {
    id: "ecb",
    title: "ECB Monetary Policy",
    description: "Latest ECB policy decisions and monetary policy communication.",
    url: "https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html",
  },
  {
    id: "fred",
    title: "FRED Data",
    description: "Primary macroeconomic source for dashboards and charts.",
    url: "https://fred.stlouisfed.org/",
  },
] as const;

const EVENT_CALENDAR = [
  { id: "cpi", title: "US CPI Release", category: "Macro", date: "2026-03-12" },
  { id: "fomc", title: "FOMC Rate Decision", category: "Macro", date: "2026-03-18" },
  { id: "nfp", title: "US Nonfarm Payrolls", category: "Macro", date: "2026-03-06" },
  { id: "ecb", title: "ECB Policy Meeting", category: "EU", date: "2026-03-05" },
  { id: "pce", title: "US Core PCE", category: "Macro", date: "2026-03-27" },
  { id: "ism", title: "US ISM Manufacturing", category: "Macro", date: "2026-03-02" },
  { id: "ecb_minutes", title: "ECB Meeting Accounts", category: "EU", date: "2026-03-26" },
  { id: "boe", title: "Bank of England Decision", category: "Macro", date: "2026-03-19" },
  { id: "retail", title: "US Retail Sales", category: "Macro", date: "2026-03-17" },
  { id: "jolts", title: "US JOLTS", category: "Macro", date: "2026-03-10" },
  { id: "pmis_us", title: "US PMI Composite", category: "Macro", date: "2026-03-03" },
  { id: "pmis_eu", title: "Eurozone PMI Composite", category: "EU", date: "2026-03-05" },
  { id: "ppi_us", title: "US PPI", category: "Macro", date: "2026-03-13" },
  { id: "cpi_eu", title: "Eurozone CPI Flash", category: "EU", date: "2026-03-01" },
  { id: "gdp_us", title: "US GDP Revision", category: "Macro", date: "2026-03-26" },
  { id: "gdp_eu", title: "Eurozone GDP Final", category: "EU", date: "2026-03-07" },
  { id: "boj", title: "BoJ Policy Decision", category: "Macro", date: "2026-03-17" },
  { id: "boc", title: "BoC Policy Decision", category: "Macro", date: "2026-03-12" },
  { id: "pmi_usm", title: "US ISM Services", category: "Macro", date: "2026-03-04" },
  { id: "ecb_press", title: "ECB Press Conference", category: "EU", date: "2026-03-05" },
];

function formatValue(value: number, format: "percent" | "number"): string {
  if (!Number.isFinite(value)) return "-";
  if (format === "percent") return `${value.toFixed(2)}%`;
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return value.toFixed(2);
}

const DEFAULT_MACRO_WIDGETS: MacroWidget[] = [
  "rates",
  "labor",
  "inflation",
  "risk",
  "growth",
  "credit",
  "policy",
  "bonds",
];

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const colors = useAppColors();
  const { t } = useI18n();

  const initialRegion: Region = settings.focusRegion === "Global" ? "All" : settings.focusRegion;
  const [region, setRegion] = useState<Region>(initialRegion);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [compactHeader, setCompactHeader] = useState(false);
  const [enabledWidgets, setEnabledWidgets] = useState<MacroWidget[]>(DEFAULT_MACRO_WIDGETS);
  const [showWidgetManager, setShowWidgetManager] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [draggingWidget, setDraggingWidget] = useState<MacroWidget | null>(null);
  const [widgetSizes, setWidgetSizes] = useState<Partial<Record<MacroWidget, MacroWidgetSize>>>({});
  const [dragHint, setDragHint] = useState<string | null>(null);
  const dragTouchRef = useRef<{ id: MacroWidget | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragOffsetsRef = useRef(new Map<MacroWidget, Animated.Value>());
  const dragOffsetXRef = useRef(new Map<MacroWidget, Animated.Value>());
  const [marketSummary, setMarketSummary] = useState<string>("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadPersistedJson<{
        enabledWidgets: MacroWidget[];
        widgetSizes: Partial<Record<MacroWidget, MacroWidgetSize>>;
      }>("macro_widgets_layout", { enabledWidgets: DEFAULT_MACRO_WIDGETS, widgetSizes: {} });
      if (!alive) return;
      const allowed = new Set<MacroWidget>([
        "rates", "labor", "inflation", "liquidity", "fx", "risk", "growth",
        "housing", "credit", "energy", "sentiment", "calendar", "policy",
        "bonds", "manufacturing",
      ]);
      const nextWidgets = Array.isArray(saved.enabledWidgets)
        ? saved.enabledWidgets.filter((id): id is MacroWidget => allowed.has(id as MacroWidget))
        : DEFAULT_MACRO_WIDGETS;
      setEnabledWidgets(nextWidgets.length ? nextWidgets : DEFAULT_MACRO_WIDGETS);
      const validSizes: Partial<Record<MacroWidget, MacroWidgetSize>> = {};
      if (saved.widgetSizes && typeof saved.widgetSizes === "object") {
        for (const [key, value] of Object.entries(saved.widgetSizes)) {
          if (allowed.has(key as MacroWidget) && (value === "sm" || value === "md" || value === "lg")) {
            validSizes[key as MacroWidget] = value;
          }
        }
      }
      setWidgetSizes(validSizes);
      setLayoutHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!layoutHydrated) return;
    void savePersistedJson("macro_widgets_layout", { enabledWidgets, widgetSizes });
  }, [enabledWidgets, widgetSizes, layoutHydrated]);

  useEffect(() => {
    if (!showWidgetManager && editingLayout) {
      setEditingLayout(false);
      setDraggingWidget(null);
      setDragHint(null);
    }
  }, [showWidgetManager, editingLayout]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const dragOffsetFor = (id: MacroWidget) => {
    const existing = dragOffsetsRef.current.get(id);
    if (existing) return existing;
    const next = new Animated.Value(0);
    dragOffsetsRef.current.set(id, next);
    return next;
  };
  const dragOffsetXFor = (id: MacroWidget) => {
    const existing = dragOffsetXRef.current.get(id);
    if (existing) return existing;
    const next = new Animated.Value(0);
    dragOffsetXRef.current.set(id, next);
    return next;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startDrag = (id: MacroWidget, pageX?: number, pageY?: number) => {
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
  const endDrag = (id: MacroWidget) => {
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

  useEffect(() => {
    setRegion(settings.focusRegion === "Global" ? "All" : settings.focusRegion);
  }, [settings.focusRegion]);

  const reloadKpis = useCallback(async () => {
    const selectedDefs = KPI_DEFS.filter((k) => region === "All" || k.region === region);
    const results = await Promise.all(
      selectedDefs.map(async (def) => {
        try {
          const points = await fetchFredSeries({ seriesId: def.seriesId, days: 3650 });
          const last = points[points.length - 1]?.y;
          return [def.id, typeof last === "number" ? last : NaN] as const;
        } catch {
          return [def.id, NaN] as const;
        }
      })
    );
    setKpis(Object.fromEntries(results));
  }, [region]);

  useEffect(() => {
    void reloadKpis();
  }, [reloadKpis]);

  const onManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await reloadKpis();
    } finally {
      setManualRefreshing(false);
    }
  }, [reloadKpis]);

  const filteredCharts = useMemo(() => {
    return CHARTS.filter((chart) => {
      if (region === "All") return chart.category !== "Crypto";
      if (region === "EU") return chart.category === "EU";
      return chart.category === "Macro" || chart.category === "Stocks";
    });
  }, [region]);

  const quickCharts = filteredCharts.slice(0, 12);
  const deepDiveCharts = filteredCharts.slice(12, 40);
  const euCharts = useMemo(() => CHARTS.filter((chart) => chart.category === "EU"), []);
  const euQuickCharts = euCharts.slice(0, 12);
  const sentimentScore = useMemo(() => {
    const rate = Number.isFinite(kpis.us_rate) ? kpis.us_rate : 4.5;
    const unemp = Number.isFinite(kpis.us_unemp) ? kpis.us_unemp : 4.2;
    const score = 70 - rate * 4 + (5 - unemp) * 8;
    return Math.max(0, Math.min(100, score));
  }, [kpis.us_rate, kpis.us_unemp]);
  const regimeText = useMemo(() => {
    const usRate = kpis.us_rate;
    const usUnemp = kpis.us_unemp;
    const euRate = kpis.eu_rate;
    const euUnemp = kpis.eu_unemp;
    const notes: string[] = [];
    if (Number.isFinite(usRate) && Number.isFinite(usUnemp)) {
      notes.push(usRate > 4 && usUnemp < 4.5 ? "US policy restrictive vs labor resilience" : "US policy/labor mix balanced");
    }
    if (Number.isFinite(euRate) && Number.isFinite(euUnemp)) {
      notes.push(euRate > 2 && euUnemp < 7 ? "EU policy moderately tight" : "EU macro still mixed");
    }
    return notes.length ? notes.join(" • ") : "Collecting macro regime signal...";
  }, [kpis]);
  const toggleWidget = (id: MacroWidget) => {
    setEnabledWidgets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dropWidgetOn = (target: MacroWidget) => {
    if (!draggingWidget || draggingWidget === target) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEnabledWidgets((prev) => {
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
  const moveWidget = (id: MacroWidget, direction: -1 | 1, step = 1) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEnabledWidgets((prev) => {
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
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onDragMove = (id: MacroWidget, e: any) => {
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
  const cycleWidgetSize = (id: MacroWidget) => {
    const current = widgetSizes[id] ?? "md";
    const next: MacroWidgetSize = current === "sm" ? "md" : current === "md" ? "lg" : "sm";
    setWidgetSizes((prev) => ({ ...prev, [id]: next }));
  };
  const macroWidgetIds: MacroWidget[] = [
    "rates",
    "labor",
    "inflation",
    "liquidity",
    "fx",
    "risk",
    "growth",
    "housing",
    "credit",
    "energy",
    "sentiment",
    "policy",
    "bonds",
    "manufacturing",
    "calendar",
  ];
  const upcomingEvents = useMemo(() => {
    return [...EVENT_CALENDAR]
      .map((event) => {
        const ts = new Date(`${event.date}T00:00:00Z`).getTime();
        return { ...event, ts, deltaDays: Math.ceil((ts - nowTs) / (24 * 60 * 60 * 1000)) };
      })
      .sort((a, b) => a.ts - b.ts);
  }, [nowTs]);
  const widgetStyle = (id: MacroWidget) => {
    const size = widgetSizes[id] ?? "md";
    if (size === "lg") return { width: "100%" as const };
    if (size === "md") return { width: "48.5%" as const };
    return { width: "31.5%" as const };
  };
  const widgetCardStyle = (id: MacroWidget) => [
    { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 },
    widgetStyle(id),
    draggingWidget === id
      ? {
          transform: [{ scale: 1.03 }],
          shadowColor: "#6A9BC2",
          shadowOpacity: 0.32,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 14,
          zIndex: 20,
        }
      : null,
  ];
  const widgetFloatingStyle = (id: MacroWidget) =>
    draggingWidget === id
      ? {
          transform: [{ translateX: dragOffsetXFor(id) }, { translateY: dragOffsetFor(id) }, { scale: 1.05 }],
          shadowColor: "#6A9BC2",
          shadowOpacity: 0.42,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 12 },
          elevation: 22,
          zIndex: 30,
        }
      : null;
  const WidgetCard = (props: { id: MacroWidget; children: ReactNode }) => (
    <Animated.View style={[widgetCardStyle(props.id), widgetFloatingStyle(props.id)]}>{props.children}</Animated.View>
  );
  const pageScrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    pageScrollRef.current?.scrollTo({ y: 0, animated: true });
  });
  const generateSummary = () => {
    const usRate = Number.isFinite(kpis.us_rate) ? kpis.us_rate : NaN;
    const usUnemp = Number.isFinite(kpis.us_unemp) ? kpis.us_unemp : NaN;
    const usCpi = Number.isFinite(kpis.us_cpi) ? kpis.us_cpi : NaN;
    const us10y = Number.isFinite(kpis.us_10y) ? kpis.us_10y : NaN;
    const euUnemp = Number.isFinite(kpis.eu_unemp) ? kpis.eu_unemp : NaN;
    const eurusd = Number.isFinite(kpis.eurusd) ? kpis.eurusd : NaN;
    const scoreBand = sentimentScore >= 60 ? "risk-on with caution" : sentimentScore >= 40 ? "balanced but fragile" : "defensive and risk-off";

    const reportSections = [
      `Market sentiment overview (${new Date().toLocaleDateString(settings.language)}): the current composite signal is ${sentimentScore.toFixed(1)}/100, which maps to a ${scoreBand} backdrop. In practical terms, macro data is not pointing to a single clean regime; it is showing a split between still-resilient activity and policy settings that remain restrictive enough to cap valuation expansion. That means trend participation can continue, but position sizing and entry quality matter more than broad beta exposure.`,
      `Short-term (1-8 weeks): policy still drives the tape. US policy rate is ${Number.isFinite(usRate) ? `${usRate.toFixed(2)}%` : "unavailable"} and US 10Y yield is ${Number.isFinite(us10y) ? `${us10y.toFixed(2)}%` : "unavailable"}, so duration sensitivity remains elevated and cross-asset reactions can be sharp around data releases. If inflation prints cool and labor holds, risk assets can drift higher on multiple expansion. If inflation re-accelerates or yields push higher, expect fast repricing and lower tolerance for weak balance sheets or speculative narratives. Tactical bias: stay selective, avoid over-concentration, and keep liquidity for event days.`,
      `Mid-term (2-6 months): labor trend is the anchor. US unemployment at ${Number.isFinite(usUnemp) ? `${usUnemp.toFixed(2)}%` : "unavailable"} and EU unemployment at ${Number.isFinite(euUnemp) ? `${euUnemp.toFixed(2)}%` : "unavailable"} imply that hard recession stress is not yet dominant, but softness risk is rising if real rates stay high. In this window, leadership quality matters: profitable, cash-generative assets tend to outperform while cyclical and highly levered names become more dispersion-driven. Macro sequencing to monitor: labor cooling first, then inflation glide, then policy pivot expectations.`,
      `Long-term (6-24 months): the core question is whether inflation normalization can coexist with stable growth without a deep labor reset. US CPI level proxy is ${Number.isFinite(usCpi) ? usCpi.toFixed(2) : "unavailable"}, and EUR/USD at ${Number.isFinite(eurusd) ? eurusd.toFixed(3) : "unavailable"} suggests global policy divergence remains relevant for capital flows and earnings translation. Base case: choppy disinflation with episodic risk rallies; upside case: steady inflation decline and mild growth re-acceleration; downside case: sticky inflation and renewed rate pressure. Portfolio implication: keep a barbell between quality risk exposure and defensive/liquidity sleeves, and rebalance on macro regime shifts rather than narrative momentum alone.`,
    ];

    let report = reportSections.join("\n\n");
    const wordCount = report.trim().split(/\s+/).length;
    if (wordCount < 250) {
      report += `\n\nRisk map and execution checklist: prioritize decision points around CPI, payrolls, and policy communication, because those events are most likely to change rate-path assumptions and compress/expand multiples quickly. Keep risk budgets dynamic rather than static: if realized volatility and dispersion rise together, reduce gross exposure and tighten stop distance; if volatility falls while breadth improves, gradually add risk through liquid leaders instead of thin beta. Confirm trend quality with participation and earnings sensitivity, not price alone. This approach keeps the portfolio adaptable to regime shifts while still allowing upside participation in constructive windows.`;
    }

    setMarketSummary(report);
  };

  return (
    <ScrollView
      ref={pageScrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 140)}
      scrollEventThrottle={16}
      scrollEnabled={!draggingWidget}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={() => {
            void onManualRefresh();
          }}
          {...refreshControlProps(colors, "Refreshing macro data...")}
        />
      }
    >
      <RefreshFeedback refreshing={manualRefreshing} colors={colors} label={t("Refreshing macro dashboard...", "Makro-Dashboard wird aktualisiert...")} />
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
            backgroundColor: colors.dark ? "rgba(12,22,31,0.96)" : "rgba(255,255,255,0.96)",
            paddingHorizontal: 12,
            paddingVertical: 9,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Macro", "Makro")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Region", "Region")} {region} • {filteredCharts.length} {t("charts", "Charts")}</Text>
        </View>
      )}
      <TabHeader title={t("Macro", "Makro")} subtitle={t("Region-focused dashboards with direct chart drilldown.", "Regionale Dashboards mit direktem Chart-Drilldown.")} />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <LinearGradient
          colors={colors.dark ? ["#173046", "#102032", "#0A1018"] : ["#E5F2FF", "#EEF6FF", "#F8FBFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, padding: 16 }}
        >
          <Text style={{ color: colors.text, fontSize: 25, fontWeight: "900" }}>{t("Macro Dashboard", "Makro-Dashboard")}</Text>
          <Text style={{ color: colors.subtext, marginTop: 6 }}>
            {t("Regional context layer for rates, labor, inflation, and market stress.", "Regionaler Kontext fuer Zinsen, Arbeitsmarkt, Inflation und Marktstress.")}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {(["All", "US", "EU"] as const).map((r) => {
              const active = region === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    setRegion(r);
                    update("focusRegion", r === "All" ? "Global" : r);
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#6A9BC2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#173149" : "#EAF4FF") : active ? (colors.dark ? "#183447" : "#E6F1FF") : colors.surface,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  })}
                >
                  <Text style={{ color: active ? (colors.dark ? "#D9EEFF" : "#35638E") : colors.subtext, fontWeight: "700" }}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>

        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {KPI_DEFS.filter((k) => region === "All" || k.region === region).slice(0, 10).map((kpi) => (
            <Pressable
              key={kpi.id}
              onPress={() => router.push(`/chart/${kpi.chartId}`)}
              style={({ pressed }) => ({
                width: "48.5%",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? (colors.dark ? "#132333" : "#EEF4FF") : colors.surface,
                padding: 12,
              })}
            >
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{kpi.label}</Text>
              <Text style={{ color: colors.text, fontSize: 21, fontWeight: "900", marginTop: 6 }}>
                {formatValue(kpis[kpi.id], kpi.format)}
              </Text>
              <Text style={{ color: "#78A8D2", marginTop: 5, fontSize: 12, fontWeight: "700" }}>Open chart</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Macro Regime Snapshot", "Makro-Regime-Snapshot")}</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>{regimeText}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <Text style={{ color: colors.subtext }}>Charts in scope: {filteredCharts.length}</Text>
            <Text style={{ color: colors.subtext }}>Quick set: {quickCharts.length}</Text>
            <Text style={{ color: colors.subtext }}>Deep dive set: {deepDiveCharts.length}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Market Sentiment & Trust Metric", "Marktstimmung & Vertrauensmetrik")}</Text>
          <Text style={{ color: colors.subtext, marginTop: 5 }}>
            Composite social-risk proxy (macro stress + labor resilience): {sentimentScore.toFixed(1)}/100
          </Text>
          <View style={{ marginTop: 8, height: 8, borderRadius: 999, backgroundColor: colors.dark ? "#1A2438" : "#DCE8FA", overflow: "hidden" }}>
            <View style={{ width: `${sentimentScore}%`, height: "100%", backgroundColor: sentimentScore >= 60 ? "#4ED8A2" : sentimentScore >= 40 ? "#E7C56A" : "#F08798" }} />
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Market Health Summary", "Marktgesundheits-Zusammenfassung")}</Text>
            <Pressable
              onPress={generateSummary}
              style={({ pressed }) => ({
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? (colors.dark ? "#151B28" : "#EAF0FF") : colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 7,
              })}
            >
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Generate", "Generieren")}</Text>
            </Pressable>
          </View>
          {!!marketSummary && <Text style={{ color: colors.subtext, marginTop: 7 }}>{marketSummary}</Text>}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <Pressable
            onPress={() => setCalendarOpen((v) => !v)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#5F43B2",
              backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
              paddingHorizontal: 10,
              paddingVertical: 8,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <MaterialIcons name="event" size={16} color="#B79DFF" />
              <Text style={{ color: "#B79DFF", fontWeight: "800" }}>{t("Macro Event Calendar", "Makro-Ereigniskalender")}</Text>
            </View>
            <MaterialIcons name={calendarOpen ? "expand-less" : "expand-more"} size={20} color="#B79DFF" />
          </Pressable>
          {calendarOpen && (
            <View style={{ marginTop: 8, gap: 6 }}>
              {upcomingEvents.map((event) => (
                <View key={event.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 9 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                      <MaterialIcons name={event.category === "EU" ? "public" : "insights"} size={14} color={event.category === "EU" ? "#8DA9FF" : "#7FD4BE"} />
                      <Text style={{ color: colors.text, fontWeight: "700", flexShrink: 1 }}>{event.title}</Text>
                    </View>
                    <Text style={{ color: event.deltaDays <= 2 ? "#F6A7B7" : "#82C5FF", fontSize: 11, fontWeight: "800" }}>
                      {event.deltaDays >= 0 ? `T-${event.deltaDays}d` : `T+${Math.abs(event.deltaDays)}d`}
                    </Text>
                  </View>
                  <Text style={{ color: colors.subtext, marginTop: 3 }}>{event.category} • {event.date}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Macro Widgets", "Makro-Widgets")}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {showWidgetManager && (
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
                  <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>{editingLayout ? t("Done", "Fertig") : t("Drag", "Verschieben")}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() =>
                  setShowWidgetManager((v) => {
                    const next = !v;
                    if (!next) {
                      setEditingLayout(false);
                      setDraggingWidget(null);
                      setDragHint(null);
                    }
                    return next;
                  })
                }
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#5F43B2",
                  backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>{showWidgetManager ? t("Close", "Schliessen") : t("Manage", "Verwalten")}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>Enable, drag-reorder, and resize macro blocks.</Text>
          {showWidgetManager && (
            <View style={{ marginTop: 8, gap: 6 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {macroWidgetIds.map((id) => {
                  const active = enabledWidgets.includes(id);
                  return (
                    <Pressable
                      key={`chip_${id}`}
                      onPress={() => toggleWidget(id)}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? "#6A9BC2" : colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#173149" : "#EAF4FF") : active ? (colors.dark ? "#183447" : "#E6F1FF") : colors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      })}
                    >
                      <Text style={{ color: active ? "#84C1F2" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{id.toUpperCase()}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {editingLayout && (
                <>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>
                    {t("Use up/down controls for stable widget reordering. Tap size chip to resize.", "Nutze Hoch/Runter fuer stabiles Umordnen. Tippe auf die Groesse zum Anpassen.")}
                  </Text>
                  {!!dragHint && <Text style={{ color: "#6A9BC2", fontSize: 12, fontWeight: "700" }}>{dragHint}</Text>}
                  {enabledWidgets.map((id) => (
                    <Pressable
                      key={`mgr_${id}`}
                      style={({ pressed }) => ({
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#173149" : "#EAF4FF") : colors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <MaterialIcons name="widgets" size={16} color={colors.subtext} />
                        <Text style={{ color: colors.text, fontWeight: "700" }}>{id.toUpperCase()}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable
                          onPress={() => moveWidget(id, -1)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: pressed ? (colors.dark ? "#173149" : "#EAF4FF") : colors.surface,
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
                            backgroundColor: pressed ? (colors.dark ? "#173149" : "#EAF4FF") : colors.surface,
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
                            backgroundColor: pressed ? (colors.dark ? "#173149" : "#EAF4FF") : colors.surface,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          })}
                        >
                          <Text style={{ color: colors.subtext, fontWeight: "700", fontSize: 11 }}>{(widgetSizes[id] ?? "md").toUpperCase()}</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          )}

          <View style={{ marginTop: 10, gap: 8, flexDirection: "row", flexWrap: "wrap" }}>
            {enabledWidgets.includes("rates") && (
              <WidgetCard id="rates">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Rates Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US Fed Funds {formatValue(kpis.us_rate, "percent")} • EU Deposit {formatValue(kpis.eu_rate, "percent")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("labor") && (
              <WidgetCard id="labor">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Labor Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US Unemployment {formatValue(kpis.us_unemp, "percent")} • EU Unemployment {formatValue(kpis.eu_unemp, "percent")} • Claims {formatValue(kpis.us_claims, "number")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("inflation") && (
              <WidgetCard id="inflation">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Inflation Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US CPI {formatValue(kpis.us_cpi, "number")} • EU HICP {formatValue(kpis.eu_hicp, "number")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("liquidity") && (
              <WidgetCard id="liquidity">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Liquidity Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US M2 {formatValue(kpis.us_m2, "number")} • US 10Y {formatValue(kpis.us_10y, "percent")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("fx") && (
              <WidgetCard id="fx">
                <Text style={{ color: colors.text, fontWeight: "800" }}>FX Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>EUR/USD {formatValue(kpis.eurusd, "number")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("risk") && (
              <WidgetCard id="risk">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Risk Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>{regimeText}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("growth") && (
              <WidgetCard id="growth">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Growth Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US GDP {formatValue(kpis.us_gdp, "number")} • EU GDP {formatValue(kpis.eu_gdp, "number")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("housing") && (
              <WidgetCard id="housing">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Housing Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US housing starts {formatValue(kpis.us_housing, "number")} • Mortgage pressure proxy {formatValue(kpis.us_10y, "percent")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("credit") && (
              <WidgetCard id="credit">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Credit Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>HY spread {formatValue(kpis.us_hy, "percent")} • Curve {formatValue(kpis.us_curve, "percent")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("energy") && (
              <WidgetCard id="energy">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Energy Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>WTI {formatValue(kpis.us_oil, "number")} • DXY {formatValue(kpis.us_dxy, "number")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("sentiment") && (
              <WidgetCard id="sentiment">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Sentiment Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>Composite score {sentimentScore.toFixed(1)}/100 • {sentimentScore >= 60 ? "Risk-on" : sentimentScore >= 40 ? "Neutral" : "Risk-off"}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("policy") && (
              <WidgetCard id="policy">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Policy Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US policy rate {formatValue(kpis.us_rate, "percent")} • EU deposit {formatValue(kpis.eu_rate, "percent")} • Regime {sentimentScore >= 60 ? "Supportive" : sentimentScore >= 40 ? "Mixed" : "Restrictive"}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("bonds") && (
              <WidgetCard id="bonds">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Bonds Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>US 10Y {formatValue(kpis.us_10y, "percent")} • Curve 10Y-2Y {formatValue(kpis.us_curve, "percent")} • HY spread {formatValue(kpis.us_hy, "percent")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("manufacturing") && (
              <WidgetCard id="manufacturing">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Manufacturing Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>ISM proxy via yields {formatValue(kpis.us_10y, "percent")} • Labor stress {formatValue(kpis.us_unemp, "percent")} • Energy input {formatValue(kpis.us_oil, "number")}</Text>
              </WidgetCard>
            )}
            {enabledWidgets.includes("calendar") && (
              <WidgetCard id="calendar">
                <Text style={{ color: colors.text, fontWeight: "800" }}>Calendar Widget</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>{EVENT_CALENDAR.slice(0, 2).map((e) => `${e.title} (${e.date})`).join(" • ")}</Text>
              </WidgetCard>
            )}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>EU Macro Indicators</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "ECB Rate", value: formatValue(kpis.eu_rate, "percent") },
              { label: "EU Unemployment", value: formatValue(kpis.eu_unemp, "percent") },
              { label: "EU HICP", value: formatValue(kpis.eu_hicp, "number") },
              { label: "EU GDP", value: formatValue(kpis.eu_gdp, "number") },
              { label: "EUR/USD", value: formatValue(kpis.eurusd, "number") },
            ].map((item) => (
              <View key={item.label} style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{item.label}</Text>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>EU Quick Charts</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {euQuickCharts.map((chart) => (
              <Pressable
                key={`eu_${chart.id}`}
                onPress={() => router.push(`/chart/${chart.id}`)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#162335" : "#EEF4FF") : colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{chart.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>Quick Charts</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quickCharts.map((chart) => (
              <Pressable
                key={chart.id}
                onPress={() => router.push(`/chart/${chart.id}`)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#162335" : "#EEF4FF") : colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{chart.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>Deep Dive</Text>
          <View style={{ gap: 10 }}>
            {deepDiveCharts.map((chart) => (
              <Pressable
                key={chart.id}
                onPress={() => router.push(`/chart/${chart.id}`)}
                style={({ pressed }) => ({
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#141E2A" : "#EEF4FF") : colors.surface,
                  padding: 14,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{chart.title}</Text>
                {!!chart.description && <Text style={{ color: colors.subtext, marginTop: 6 }}>{chart.description}</Text>}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>Sources</Text>
          <View style={{ gap: 10 }}>
            {FEEDS.map((feed) => (
              <Pressable
                key={feed.id}
                onPress={() => {
                  void Linking.openURL(feed.url);
                }}
                style={({ pressed }) => ({
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#141420" : "#EEF4FF") : colors.surface,
                  padding: 14,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{feed.title}</Text>
                <Text style={{ color: colors.subtext, marginTop: 6 }}>{feed.description}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
