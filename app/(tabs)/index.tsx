import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, LayoutAnimation, Platform, ScrollView, Text, UIManager, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CHARTS } from "../../src/catalog/charts";
import { TRACKED_COINS } from "../../src/catalog/coins";
import { CoinMarket, fetchCoinGeckoMarkets, fetchCoinGeckoTopMarkets } from "../../src/data/coingecko";
import { fetchFredSeries } from "../../src/data/macro";
import { fetchTopStockBreadth, StockBreadthSnapshot } from "../../src/data/stocks";
import { useI18n } from "../../src/i18n/use-i18n";
import { useSettings } from "../../src/state/settings";
import { useWatchlist } from "../../src/state/watchlist";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { HapticPressable as Pressable } from "../../src/ui/haptic-pressable";
import { useAppColors } from "../../src/ui/use-app-colors";

function money(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function pct(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function deltaColor(v: number) {
  if (!Number.isFinite(v)) return "#9AA3BF";
  return v >= 0 ? "#4ED8A2" : "#F08BA1";
}

type WidgetSize = "sm" | "md" | "lg";
type WidgetId =
  | "market_breadth"
  | "top_movers"
  | "btc_dominance"
  | "eth_dominance"
  | "flow_ratio"
  | "risk_pulse"
  | "volatility"
  | "rotation"
  | "liquidity"
  | "market_cap"
  | "volume"
  | "avg_move"
  | "coin_count"
  | "watchlist_snapshot"
  | "saved_assets"
  | "crypto_coverage"
  | "macro_us_coverage"
  | "macro_eu_coverage"
  | "price_dispersion"
  | "alts_vs_btc"
  | "heatmap"
  | "trend_strength";

const WIDGET_CATALOG: { id: WidgetId; label: string; size: WidgetSize }[] = [
  { id: "market_breadth", label: "Market Breadth", size: "lg" },
  { id: "top_movers", label: "Top Movers", size: "lg" },
  { id: "heatmap", label: "Heatmap", size: "lg" },
  { id: "btc_dominance", label: "BTC Dominance", size: "md" },
  { id: "eth_dominance", label: "ETH Dominance", size: "md" },
  { id: "flow_ratio", label: "Flow Ratio", size: "md" },
  { id: "risk_pulse", label: "Risk Pulse", size: "md" },
  { id: "volatility", label: "Volatility", size: "md" },
  { id: "rotation", label: "Rotation", size: "sm" },
  { id: "liquidity", label: "Liquidity", size: "sm" },
  { id: "market_cap", label: "Market Cap", size: "sm" },
  { id: "volume", label: "Volume", size: "sm" },
  { id: "avg_move", label: "Avg Move", size: "sm" },
  { id: "coin_count", label: "Coins", size: "sm" },
  { id: "watchlist_snapshot", label: "Watchlist", size: "md" },
  { id: "saved_assets", label: "Saved", size: "sm" },
  { id: "crypto_coverage", label: "Crypto Charts", size: "sm" },
  { id: "macro_us_coverage", label: "US Charts", size: "sm" },
  { id: "macro_eu_coverage", label: "EU Charts", size: "sm" },
  { id: "price_dispersion", label: "Dispersion", size: "md" },
  { id: "alts_vs_btc", label: "Alts vs BTC", size: "md" },
  { id: "trend_strength", label: "Trend Strength", size: "md" },
];

type MacroKey = "us_rate" | "us_unemp" | "us_cpi" | "us_10y" | "eu_rate" | "eu_unemp" | "eu_hicp" | "eurusd";
type MacroPoint = { current: number; previous: number };

const MACRO_SERIES: Record<MacroKey, string> = {
  us_rate: "FEDFUNDS",
  us_unemp: "UNRATE",
  us_cpi: "CPIAUCSL",
  us_10y: "DGS10",
  eu_rate: "ECBDFR",
  eu_unemp: "LRHUTTTTEZM156S",
  eu_hicp: "CP0000EZ19M086NEST",
  eurusd: "DEXUSEU",
};

const US_ROTATION: { key: MacroKey; label: string; format: "pct" | "num" }[] = [
  { key: "us_rate", label: "Fed Rate", format: "pct" },
  { key: "us_unemp", label: "Unemployment", format: "pct" },
  { key: "us_10y", label: "10Y Yield", format: "pct" },
  { key: "us_cpi", label: "CPI Index", format: "num" },
];

const EU_ROTATION: { key: MacroKey; label: string; format: "pct" | "num" }[] = [
  { key: "eu_rate", label: "ECB Rate", format: "pct" },
  { key: "eu_unemp", label: "Unemployment", format: "pct" },
  { key: "eu_hicp", label: "HICP Index", format: "num" },
  { key: "eurusd", label: "EUR/USD", format: "num" },
];

function metric(v: number, format: "pct" | "num"): string {
  if (!Number.isFinite(v)) return "-";
  if (format === "pct") return `${v.toFixed(2)}%`;
  return v >= 100 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v.toFixed(3);
}

function MiniBars(props: { values: number[]; positiveColor: string; negativeColor: string }) {
  const max = Math.max(1, ...props.values.map((v) => Math.abs(v)));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 30, marginTop: 8 }}>
      {props.values.slice(0, 14).map((v, idx) => (
        <View
          key={idx}
          style={{
            flex: 1,
            height: Math.max(3, (Math.abs(v) / max) * 30),
            borderRadius: 4,
            backgroundColor: v >= 0 ? props.positiveColor : props.negativeColor,
            opacity: 0.9,
          }}
        />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { chartIds, coinIds } = useWatchlist();
  const colors = useAppColors();
  const { t } = useI18n();

  const [markets, setMarkets] = useState<CoinMarket[]>([]);
  const [stockBreadth, setStockBreadth] = useState<StockBreadthSnapshot | null>(null);
  const [macroValues, setMacroValues] = useState<Partial<Record<MacroKey, MacroPoint>>>({});
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [widgetSizeOverrides, setWidgetSizeOverrides] = useState<Partial<Record<WidgetId, WidgetSize>>>({});
  const [draggingWidget, setDraggingWidget] = useState<WidgetId | null>(null);
  const [dragHint, setDragHint] = useState<string | null>(null);
  const dragTouchRef = useRef<{ id: WidgetId | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const dragStartYRef = useRef(0);
  const dragStartXRef = useRef(0);
  const dragOffsetsRef = useRef(new Map<WidgetId, Animated.Value>());
  const dragOffsetXRef = useRef(new Map<WidgetId, Animated.Value>());
  const [rotationIndex, setRotationIndex] = useState(0);
  const [selectedWidgets, setSelectedWidgets] = useState<WidgetId[]>([
    "market_breadth",
    "top_movers",
    "btc_dominance",
    "flow_ratio",
    "heatmap",
    "watchlist_snapshot",
    "risk_pulse",
  ]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchCoinGeckoTopMarkets({
          vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
          page: 1,
          perPage: 200,
          useCache: true,
          cacheTtlMs: 20_000,
        });
        if (alive) setMarkets(rows);
      } catch {
        try {
          const fallback = await fetchCoinGeckoMarkets({
            ids: TRACKED_COINS.map((c) => c.id),
            vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
            useCache: true,
            cacheTtlMs: 20_000,
          });
          if (alive) setMarkets(fallback);
        } catch {
          if (alive) setMarkets([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [settings.currency]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const breadth = await fetchTopStockBreadth(200);
        if (alive) setStockBreadth(breadth);
      } catch {
        if (alive) setStockBreadth(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        (Object.keys(MACRO_SERIES) as MacroKey[]).map(async (key) => {
          try {
            const points = await fetchFredSeries({ seriesId: MACRO_SERIES[key], days: 3650 });
            return [key, { current: points[points.length - 1]?.y ?? NaN, previous: points[points.length - 2]?.y ?? NaN }] as const;
          } catch {
            return [key, { current: NaN, previous: NaN }] as const;
          }
        })
      );
      if (!alive) return;
      setMacroValues(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setRotationIndex((v) => v + 1), 4500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const dragOffsetFor = (id: WidgetId) => {
    const existing = dragOffsetsRef.current.get(id);
    if (existing) return existing;
    const next = new Animated.Value(0);
    dragOffsetsRef.current.set(id, next);
    return next;
  };
  const dragOffsetXFor = (id: WidgetId) => {
    const existing = dragOffsetXRef.current.get(id);
    if (existing) return existing;
    const next = new Animated.Value(0);
    dragOffsetXRef.current.set(id, next);
    return next;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startDrag = (id: WidgetId, pageX?: number, pageY?: number) => {
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
  const endDrag = (id: WidgetId) => {
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

  const marketCap = useMemo(() => markets.reduce((sum, r) => sum + (r.market_cap || 0), 0), [markets]);
  const volume = useMemo(() => markets.reduce((sum, r) => sum + (r.total_volume || 0), 0), [markets]);
  const positive = useMemo(() => markets.filter((r) => (r.price_change_percentage_24h ?? 0) > 0).length, [markets]);
  const avgMove = useMemo(() => {
    if (!markets.length) return 0;
    return markets.reduce((sum, r) => sum + Math.abs(r.price_change_percentage_24h ?? 0), 0) / markets.length;
  }, [markets]);

  const movers = useMemo(() => [...markets].sort((a, b) => (b.price_change_percentage_24h ?? -999) - (a.price_change_percentage_24h ?? -999)).slice(0, 6), [markets]);
  const laggards = useMemo(() => [...markets].sort((a, b) => (a.price_change_percentage_24h ?? 999) - (b.price_change_percentage_24h ?? 999)).slice(0, 6), [markets]);
  const btc = useMemo(() => markets.find((r) => r.id === "bitcoin" || r.symbol.toLowerCase() === "btc"), [markets]);
  const eth = useMemo(() => markets.find((r) => r.id === "ethereum" || r.symbol.toLowerCase() === "eth"), [markets]);
  const btcDominance = useMemo(() => (btc && marketCap > 0 ? (btc.market_cap / marketCap) * 100 : NaN), [btc, marketCap]);

  const aggregateMarketCapYesterday = useMemo(
    () =>
      markets.reduce((sum, row) => {
        const p = Number(row.price_change_percentage_24h ?? 0) / 100;
        return sum + (p > -0.999 ? row.market_cap / (1 + p) : row.market_cap);
      }, 0),
    [markets]
  );
  const aggregateVolumeYesterday = useMemo(
    () =>
      markets.reduce((sum, row) => {
        const p = Number(row.price_change_percentage_24h ?? 0) / 100;
        return sum + (p > -0.999 ? row.total_volume / (1 + p) : row.total_volume);
      }, 0),
    [markets]
  );
  const marketCapChangePct = useMemo(() => (aggregateMarketCapYesterday > 0 ? ((marketCap - aggregateMarketCapYesterday) / aggregateMarketCapYesterday) * 100 : NaN), [marketCap, aggregateMarketCapYesterday]);
  const volumeChangePct = useMemo(() => (aggregateVolumeYesterday > 0 ? ((volume - aggregateVolumeYesterday) / aggregateVolumeYesterday) * 100 : NaN), [volume, aggregateVolumeYesterday]);

  const usRotating = US_ROTATION[rotationIndex % US_ROTATION.length];
  const euRotating = EU_ROTATION[rotationIndex % EU_ROTATION.length];
  const cryptoRotation = useMemo(
    () => [
      { label: "Market Cap", value: money(marketCap), changePct: marketCapChangePct },
      { label: "BTC Price", value: btc ? money(btc.current_price) : "-", changePct: btc?.price_change_percentage_24h ?? NaN },
      { label: "ETH Price", value: eth ? money(eth.current_price) : "-", changePct: eth?.price_change_percentage_24h ?? NaN },
      { label: "24h Volume", value: money(volume), changePct: volumeChangePct },
      { label: "BTC Dominance", value: Number.isFinite(btcDominance) ? `${btcDominance.toFixed(2)}%` : "-", changePct: NaN },
    ],
    [marketCap, marketCapChangePct, btc, eth, volume, volumeChangePct, btcDominance]
  );
  const cryptoRotating = cryptoRotation[rotationIndex % cryptoRotation.length];

  const shortcuts = [
    { label: t("Crypto", "Krypto"), icon: "currency-bitcoin", route: "/crypto", tint: "#9B80FF" },
    { label: t("Charts", "Charts"), icon: "show-chart", route: "/charts", tint: "#79B9FF" },
    { label: t("Macro", "Makro"), icon: "public", route: "/explore", tint: "#6FD6C8" },
    { label: t("News", "News"), icon: "article", route: "/news", tint: "#8EC8FF" },
  ] as const;

  const toggleWidget = (id: WidgetId) => {
    setSelectedWidgets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dropWidgetOn = (target: WidgetId) => {
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
  const moveWidget = (id: WidgetId, direction: -1 | 1, step = 1) => {
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
  const onDragMove = (id: WidgetId, e: any) => {
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

  const cycleWidgetSize = (id: WidgetId) => {
    const defaultSize = WIDGET_CATALOG.find((w) => w.id === id)?.size ?? "md";
    const current = widgetSizeOverrides[id] ?? defaultSize;
    const next: WidgetSize = current === "sm" ? "md" : current === "md" ? "lg" : "sm";
    setWidgetSizeOverrides((prev) => ({ ...prev, [id]: next }));
  };

  const sizeStyle = (size: WidgetSize) => {
    if (size === "lg") return { width: "100%" as const, minHeight: 102 };
    if (size === "md") return { width: "48.5%" as const, minHeight: 96 };
    return { width: "31.6%" as const, minHeight: 82 };
  };

  const widgetSize = (id: WidgetId): WidgetSize => widgetSizeOverrides[id] ?? (WIDGET_CATALOG.find((w) => w.id === id)?.size ?? "md");
  const widgetFloatingStyle = (id: WidgetId) =>
    draggingWidget === id
      ? {
          transform: [{ translateX: dragOffsetXFor(id) }, { translateY: dragOffsetFor(id) }, { scale: 1.05 }],
          shadowColor: "#7C56D9",
          shadowOpacity: 0.42,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 14 },
          elevation: 24,
          zIndex: 40,
        }
      : null;

  const cardStyle = {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
  } as const;

  const renderWidget = (id: WidgetId) => {
    const totalSavedWatchlist = coinIds.length + chartIds.length;
    switch (id) {
      case "market_breadth": {
        const cryptoUp = positive;
        const cryptoDown = Math.max(markets.length - positive, 0);
        const cryptoTotal = Math.max(1, cryptoUp + cryptoDown);
        const stocksUp = stockBreadth?.up ?? 0;
        const stocksDown = stockBreadth?.down ?? 0;
        const stocksTotal = Math.max(1, stocksUp + stocksDown + (stockBreadth?.unchanged ?? 0));
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Market Breadth</Text>
            <Text style={{ color: colors.subtext, marginTop: 4 }}>
              Crypto Top 200: {cryptoUp} up • {cryptoDown} down
            </Text>
            <View style={{ marginTop: 6, height: 8, borderRadius: 999, backgroundColor: colors.dark ? "#22283A" : "#E9EFFC", overflow: "hidden", flexDirection: "row" }}>
              <View style={{ width: `${(cryptoUp / cryptoTotal) * 100}%`, backgroundColor: "#4DD9A5" }} />
              <View style={{ flex: 1, backgroundColor: "#F08BA1" }} />
            </View>
            <Text style={{ color: colors.subtext, marginTop: 8 }}>
              Stocks Top 200: {stockBreadth ? `${stocksUp} up • ${stocksDown} down` : "loading..."}
            </Text>
            <View style={{ marginTop: 6, height: 8, borderRadius: 999, backgroundColor: colors.dark ? "#22283A" : "#E9EFFC", overflow: "hidden", flexDirection: "row" }}>
              <View style={{ width: `${(stocksUp / stocksTotal) * 100}%`, backgroundColor: "#7DA7FF" }} />
              <View style={{ flex: 1, backgroundColor: "#F0A1B5" }} />
            </View>
          </>
        );
      }
      case "top_movers":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Top Movers</Text>
            <View style={{ marginTop: 7, gap: 4 }}>
              {movers.slice(0, 4).map((m) => (
                <View key={m.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{m.symbol.toUpperCase()}</Text>
                  <Text style={{ color: (m.price_change_percentage_24h ?? 0) >= 0 ? "#56D7A8" : "#F08BA1", fontWeight: "700" }}>{pct(m.price_change_percentage_24h ?? 0)}</Text>
                </View>
              ))}
            </View>
          </>
        );
      case "heatmap": {
        const strip = [...movers.slice(0, 6), ...laggards.slice(0, 6)].map((x) => x.price_change_percentage_24h ?? 0);
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Momentum Heatmap</Text>
            <MiniBars values={strip} positiveColor="#4DD9A5" negativeColor="#F08BA1" />
          </>
        );
      }
      case "btc_dominance":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>BTC Dom</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 20 }}>{Number.isFinite(btcDominance) ? `${btcDominance.toFixed(1)}%` : "-"}</Text>
          </>
        );
      case "eth_dominance":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>ETH Dom</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 20 }}>{eth && marketCap > 0 ? `${((eth.market_cap / marketCap) * 100).toFixed(1)}%` : "-"}</Text>
          </>
        );
      case "flow_ratio":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Flow Ratio</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 20 }}>{marketCap > 0 ? `${((volume / marketCap) * 100).toFixed(2)}%` : "-"}</Text>
          </>
        );
      case "risk_pulse":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Risk Pulse</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 20 }}>{avgMove > 5 ? "High" : avgMove > 3 ? "Mid" : "Low"}</Text>
            <Text style={{ color: colors.subtext, marginTop: 2 }}>{avgMove.toFixed(2)}% avg move</Text>
          </>
        );
      case "volatility":
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Volatility</Text>
            <MiniBars values={markets.slice(0, 10).map((m) => Math.abs(m.price_change_percentage_24h ?? 0))} positiveColor="#7DA7FF" negativeColor="#7DA7FF" />
          </>
        );
      case "rotation":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Leader</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 20 }}>{movers[0]?.symbol.toUpperCase() ?? "-"}</Text>
          </>
        );
      case "liquidity":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Liquidity</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{money(volume)}</Text>
          </>
        );
      case "market_cap":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Market Cap</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{money(marketCap)}</Text>
          </>
        );
      case "volume":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>24h Vol</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{money(volume)}</Text>
          </>
        );
      case "avg_move":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Avg Move</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{pct(avgMove)}</Text>
          </>
        );
      case "coin_count":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Tracked Coins</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{markets.length}</Text>
          </>
        );
      case "watchlist_snapshot":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Watchlist</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{totalSavedWatchlist ? "Active" : "Empty"}</Text>
            <Text style={{ color: colors.subtext, marginTop: 2, fontSize: 11 }}>
              {coinIds.length} coins • {chartIds.length} charts
            </Text>
          </>
        );
      case "saved_assets":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Saved</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{coinIds.length + chartIds.length}</Text>
          </>
        );
      case "crypto_coverage":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Crypto Charts</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{CHARTS.filter((c) => c.category === "Crypto").length}</Text>
          </>
        );
      case "macro_us_coverage":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>US Charts</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{CHARTS.filter((c) => c.category === "Macro" || c.category === "Stocks").length}</Text>
          </>
        );
      case "macro_eu_coverage":
        return (
          <>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>EU Charts</Text>
            <Text style={{ color: colors.text, marginTop: 5, fontWeight: "900", fontSize: 18 }}>{CHARTS.filter((c) => c.category === "EU").length}</Text>
          </>
        );
      case "price_dispersion": {
        const top = movers[0]?.price_change_percentage_24h ?? 0;
        const bottom = laggards[0]?.price_change_percentage_24h ?? 0;
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Dispersion</Text>
            <Text style={{ color: colors.subtext, marginTop: 5 }}>Top {pct(top)} • Bottom {pct(bottom)}</Text>
          </>
        );
      }
      case "alts_vs_btc": {
        const btcMove = btc?.price_change_percentage_24h ?? 0;
        const altMoves = markets.filter((m) => m.id !== btc?.id).map((m) => m.price_change_percentage_24h ?? 0);
        const avgAlt = altMoves.length ? altMoves.reduce((s, x) => s + x, 0) / altMoves.length : NaN;
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Alts vs BTC</Text>
            <Text style={{ color: colors.subtext, marginTop: 5 }}>{pct(avgAlt)} vs {pct(btcMove)}</Text>
          </>
        );
      }
      case "trend_strength": {
        const trend = movers.filter((m) => (m.price_change_percentage_24h ?? 0) > 0).length;
        return (
          <>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Trend Strength</Text>
            <Text style={{ color: colors.subtext, marginTop: 5 }}>{trend >= 4 ? "Strong" : trend >= 2 ? "Mixed" : "Weak"}</Text>
          </>
        );
      }
      default:
        return <Text style={{ color: colors.subtext }}>-</Text>;
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      scrollEnabled={!draggingWidget}
    >
      <TabHeader title={t("Home", "Start")} />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={[cardStyle, { marginBottom: 10 }]}> 
          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#161A2A" : "#F6F9FF", padding: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{cryptoRotating.label}</Text>
              <Text
                style={{ color: colors.text, marginTop: 3, fontWeight: "900", fontSize: 19 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {cryptoRotating.value}
              </Text>
              <Text style={{ color: deltaColor(cryptoRotating.changePct), fontSize: 12, fontWeight: "700" }}>
                {Number.isFinite(cryptoRotating.changePct) ? `${cryptoRotating.changePct >= 0 ? "+" : ""}${cryptoRotating.changePct.toFixed(2)}%` : "-"}
              </Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#161A2A" : "#F6F9FF", padding: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{usRotating.label}</Text>
              <Text
                style={{ color: colors.text, marginTop: 3, fontWeight: "900", fontSize: 19 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {metric(macroValues[usRotating.key]?.current ?? NaN, usRotating.format)}
              </Text>
              <Text style={{ color: deltaColor((macroValues[usRotating.key]?.current ?? NaN) - (macroValues[usRotating.key]?.previous ?? NaN)), fontSize: 12, fontWeight: "700" }}>
                {Number.isFinite(macroValues[usRotating.key]?.current ?? NaN) && Number.isFinite(macroValues[usRotating.key]?.previous ?? NaN)
                  ? `${(macroValues[usRotating.key]!.current - macroValues[usRotating.key]!.previous) >= 0 ? "+" : ""}${(macroValues[usRotating.key]!.current - macroValues[usRotating.key]!.previous).toFixed(2)}`
                  : "-"}
              </Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#161A2A" : "#F6F9FF", padding: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{euRotating.label}</Text>
              <Text
                style={{ color: colors.text, marginTop: 3, fontWeight: "900", fontSize: 19 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {metric(macroValues[euRotating.key]?.current ?? NaN, euRotating.format)}
              </Text>
              <Text style={{ color: deltaColor((macroValues[euRotating.key]?.current ?? NaN) - (macroValues[euRotating.key]?.previous ?? NaN)), fontSize: 12, fontWeight: "700" }}>
                {Number.isFinite(macroValues[euRotating.key]?.current ?? NaN) && Number.isFinite(macroValues[euRotating.key]?.previous ?? NaN)
                  ? `${(macroValues[euRotating.key]!.current - macroValues[euRotating.key]!.previous) >= 0 ? "+" : ""}${(macroValues[euRotating.key]!.current - macroValues[euRotating.key]!.previous).toFixed(2)}`
                  : "-"}
              </Text>
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
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Widgets", "Widgets")} ({selectedWidgets.length})</Text>

          {showWidgetPicker && (
            <View style={{ marginTop: 10, gap: 8 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {WIDGET_CATALOG.map((w) => {
                  const active = selectedWidgets.includes(w.id);
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => toggleWidget(w.id)}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? "#A98BFF" : colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#1E2340" : "#EEF2FF") : active ? (colors.dark ? "#252046" : "#F1EBFF") : colors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      })}
                    >
                      <Text style={{ color: active ? "#A98BFF" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{w.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {!!selectedWidgets.length && editingLayout && (
                <View style={{ marginTop: 4, gap: 6 }}>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>
                    {t("Use up/down controls for stable widget reordering. Tap size chip to resize.", "Nutze Hoch/Runter fuer stabiles Umordnen. Tippe auf die Groesse zum Anpassen.")}
                  </Text>
                  {!!dragHint && <Text style={{ color: "#A98BFF", fontSize: 12, fontWeight: "700" }}>{dragHint}</Text>}
                  {selectedWidgets.map((id) => {
                    const label = WIDGET_CATALOG.find((w) => w.id === id)?.label ?? id;
                    return (
                      <Pressable
                        key={`layout_${id}`}
                        style={({ pressed }) => ({
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#1A2234" : "#EAF1FF") : colors.surface,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        })}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <MaterialIcons name="widgets" size={16} color={colors.subtext} />
                          <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Pressable
                            onPress={() => moveWidget(id, -1)}
                            style={({ pressed }) => ({
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: pressed ? (colors.dark ? "#202640" : "#EEF2FF") : colors.surface,
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
                              backgroundColor: pressed ? (colors.dark ? "#202640" : "#EEF2FF") : colors.surface,
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
                              backgroundColor: pressed ? (colors.dark ? "#202640" : "#EEF2FF") : colors.surface,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                            })}
                          >
                            <Text style={{ color: colors.subtext, fontWeight: "700", fontSize: 11 }}>{widgetSize(id).toUpperCase()}</Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {selectedWidgets.map((id, idx) => (
            <Animated.View
              key={`${id}-${idx}`}
              style={[
                cardStyle,
                sizeStyle(widgetSize(id)),
                widgetFloatingStyle(id),
                { backgroundColor: colors.dark ? "#11172A" : "#F9FAFF", borderColor: colors.dark ? "#212A44" : colors.border },
              ]}
            >
              {editingLayout && (
                <>
                  <View
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      zIndex: 6,
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
                        backgroundColor: colors.dark ? "#273251" : "#E8EDFF",
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
                        backgroundColor: colors.dark ? "#273251" : "#E8EDFF",
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
                      zIndex: 5,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.dark ? "#273251" : "#E8EDFF",
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

        <View style={[cardStyle, { marginTop: 10, marginBottom: 10 }]}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            {showWidgetPicker && (
              <Pressable
                onPress={() => {
                  setEditingLayout((v) => !v);
                  if (editingLayout) setDraggingWidget(null);
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
            )}
            <Pressable
              onPress={() =>
                setShowWidgetPicker((v) => {
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
              <Text style={{ color: "#B79DFF", fontSize: 12, fontWeight: "700" }}>{showWidgetPicker ? t("Close", "Schliessen") : t("Manage", "Verwalten")}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ height: Math.max(80, insets.bottom + 54) }} />
    </ScrollView>
  );
}
