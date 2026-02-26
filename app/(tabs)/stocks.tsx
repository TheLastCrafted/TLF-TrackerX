import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { searchUniversalAssets, UniversalAsset } from "../../src/data/asset-search";
import { fetchStockQuoteSnapshot, fetchTopStocks, StockMarketRow } from "../../src/data/stocks-live";
import { useI18n } from "../../src/i18n/use-i18n";
import { usePriceAlerts } from "../../src/state/price-alerts";
import { useSettings } from "../../src/state/settings";
import { useWatchlist } from "../../src/state/watchlist";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function formatMoney(value: number, currency: "USD" | "EUR", compact: boolean, locale: "en" | "de"): string {
  if (!Number.isFinite(value)) return "-";
  const symbol = currency === "EUR" ? "EUR" : "USD";

  if (compact) {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B ${symbol}`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ${symbol}`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K ${symbol}`;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

type SortKey = "rank" | "price" | "change24" | "volume" | "marketCap";
type RowDensity = "compact" | "expanded";

export default function StocksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { equitySymbols, isEquitySaved, toggleEquity } = useWatchlist();
  const { settings } = useSettings();
  const colors = useAppColors();
  const { addAlert } = usePriceAlerts();
  const { t } = useI18n();

  const [rows, setRows] = useState<StockMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDesc, setSortDesc] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [rowDensity, setRowDensity] = useState<RowDensity>("compact");
  const [compactHeader, setCompactHeader] = useState(false);
  const [remoteSearchRows, setRemoteSearchRows] = useState<UniversalAsset[]>([]);
  const [failedLogos, setFailedLogos] = useState<Record<string, true>>({});
  const listRef = useRef<FlatList<StockMarketRow>>(null);
  const pollCounterRef = useRef(0);
  const rowSymbolsKey = useMemo(
    () => rows.map((row) => row.symbol).sort().join("|"),
    [rows]
  );
  const rowSymbols = useMemo(
    () => (rowSymbolsKey ? rowSymbolsKey.split("|").filter(Boolean) : []),
    [rowSymbolsKey]
  );

  useLogoScrollToTop(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  });

  const rankBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    [...rows]
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .forEach((row, idx) => {
        map[row.symbol] = idx + 1;
      });
    return map;
  }, [rows]);

  const mergeRows = useCallback((incoming: StockMarketRow[]) => {
    setRows((prev) => {
      const bySymbol = new Map(prev.map((row) => [row.symbol, row]));
      for (const row of incoming) bySymbol.set(row.symbol, row);
      return [...bySymbol.values()];
    });
  }, []);

  const refreshLiveQuotes = useCallback(async (): Promise<boolean> => {
    const symbols = rowSymbols.slice(0, 230);
    if (!symbols.length) return false;
    try {
      const live = await fetchStockQuoteSnapshot(symbols, { useCache: true, cacheTtlMs: 8_000 });
      if (!live.length) return false;
      const bySymbol = new Map(live.map((row) => [row.symbol, row]));
      let changed = false;
      setRows((prev) =>
        prev.map((row) => {
          const quote = bySymbol.get(row.symbol);
          if (!quote) return row;
          const nextPrice = Number.isFinite(quote.price) ? quote.price : row.price;
          const nextChangePct = Number.isFinite(quote.changePct) ? quote.changePct : row.changePct;
          const nextMarketCap = quote.marketCap || row.marketCap;
          const nextVolume = quote.volume || row.volume;
          const nextAverageVolume = quote.averageVolume ?? row.averageVolume;
          const nextHigh24h = quote.high24h ?? row.high24h;
          const nextLow24h = quote.low24h ?? row.low24h;
          const nextCurrency = quote.currency ?? row.currency;
          const nextExchange = quote.exchange ?? row.exchange;
          const hasDiff =
            nextPrice !== row.price ||
            nextChangePct !== row.changePct ||
            nextMarketCap !== row.marketCap ||
            nextVolume !== row.volume ||
            nextAverageVolume !== row.averageVolume ||
            nextHigh24h !== row.high24h ||
            nextLow24h !== row.low24h ||
            nextCurrency !== row.currency ||
            nextExchange !== row.exchange;
          if (!hasDiff) return row;
          changed = true;
          return {
            ...row,
            price: nextPrice,
            changePct: nextChangePct,
            marketCap: nextMarketCap,
            volume: nextVolume,
            averageVolume: nextAverageVolume,
            high24h: nextHigh24h,
            low24h: nextLow24h,
            currency: nextCurrency,
            exchange: nextExchange,
            lastUpdatedAt: Date.now(),
          };
        })
      );
      if (changed) setLastUpdatedAt(Date.now());
      setError(null);
      return true;
    } catch {
      return false;
    }
  }, [rowSymbols]);

  const load = useCallback(
    async (isManualRefresh = false): Promise<boolean> => {
      try {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        const top = await fetchTopStocks({ count: 200, useCache: !isManualRefresh, cacheTtlMs: 25_000 });
        if (top.length) {
          setRows(top);
          setLastUpdatedAt(Date.now());
          setError(null);
          return true;
        }
        setError(t("Could not update stock feed right now.", "Stock-Feed konnte aktuell nicht aktualisiert werden."));
        return rows.length > 0;
      } catch {
        setError(t("Could not update stock feed right now.", "Stock-Feed konnte aktuell nicht aktualisiert werden."));
        return rows.length > 0;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [rows.length, t]
  );

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setRemoteSearchRows([]);
      return;
    }
    let alive = true;
    const timeout = setTimeout(() => {
      void searchUniversalAssets(q, 26)
        .then((result) => {
          if (!alive) return;
          setRemoteSearchRows(result.filter((row) => row.kind === "stock" || row.kind === "etf"));
        })
        .catch(() => {
          if (alive) setRemoteSearchRows([]);
        });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [search]);

  useEffect(() => {
    const missing = remoteSearchRows
      .map((row) => row.symbol.toUpperCase())
      .filter((symbol) => symbol && !rows.some((r) => r.symbol === symbol))
      .slice(0, 24);
    if (!missing.length) return;
    let alive = true;
    (async () => {
      try {
        const live = await fetchStockQuoteSnapshot(missing, { useCache: true, cacheTtlMs: 25_000 });
        if (!alive || !live.length) return;
        const bySymbol = new Map(remoteSearchRows.map((row) => [row.symbol.toUpperCase(), row]));
        mergeRows(
          live.map((row) => {
            const hit = bySymbol.get(row.symbol);
            const mappedKind = hit?.kind === "etf" ? "etf" : "stock";
            return {
              ...row,
              name: hit?.name || row.name,
              kind: mappedKind,
            };
          })
        );
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [remoteSearchRows, rows, mergeRows]);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let backoffMs = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        pollCounterRef.current += 1;
        const shouldRunFull = rows.length === 0 || pollCounterRef.current % 7 === 0;
        const ok = shouldRunFull ? await load(false) : await refreshLiveQuotes();
        if (ok) backoffMs = 0;
        else backoffMs = Math.min(backoffMs ? backoffMs * 2 : 5000, 20_000);
      } finally {
        inFlight = false;
      }
    };

    void tick();

    if (!settings.autoRefresh) {
      return () => {
        alive = false;
        if (timer) clearTimeout(timer);
      };
    }

    const baseDelayMs = Math.max(6, settings.refreshSeconds) * 1000;

    const schedule = () => {
      if (!alive) return;
      const currentDelay = Math.max(baseDelayMs, backoffMs || baseDelayMs);
      timer = setTimeout(async () => {
        await tick();
        schedule();
      }, currentDelay);
    };

    schedule();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [load, refreshLiveQuotes, rows.length, settings.autoRefresh, settings.refreshSeconds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter((row) => row.symbol.toLowerCase().includes(q) || row.name.toLowerCase().includes(q))
      : rows;
    const watchlistRows = savedOnly ? base.filter((row) => equitySymbols.includes(row.symbol)) : base;
    return [...watchlistRows].sort((a, b) => {
      const dir = sortDesc ? -1 : 1;
      if (sortKey === "rank") return ((rankBySymbol[a.symbol] ?? 9999) - (rankBySymbol[b.symbol] ?? 9999)) * dir;
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "change24") return (a.changePct - b.changePct) * dir;
      if (sortKey === "marketCap") return (a.marketCap - b.marketCap) * dir;
      return (a.volume - b.volume) * dir;
    });
  }, [rows, search, savedOnly, equitySymbols, sortDesc, sortKey, rankBySymbol]);

  const marketCap = useMemo(() => rows.reduce((sum, row) => sum + (row.marketCap || 0), 0), [rows]);
  const volume = useMemo(() => rows.reduce((sum, row) => sum + (row.volume || 0), 0), [rows]);
  const gainersCount = useMemo(() => rows.filter((row) => row.changePct > 0).length, [rows]);
  const avgMove = useMemo(() => (rows.length ? rows.reduce((sum, row) => sum + Math.abs(row.changePct), 0) / rows.length : 0), [rows]);

  const setSort = (next: SortKey) => {
    if (sortKey === next) setSortDesc((v) => !v);
    else {
      setSortKey(next);
      setSortDesc(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RefreshFeedback refreshing={refreshing} colors={colors} label={t("Refreshing stock feed...", "Aktien-Feed wird aktualisiert...")} />
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
          <View>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Stocks Live", "Aktien Live")}</Text>
            <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 1 }}>
              {filtered.length} {t("assets", "Assets")} • {gainersCount} {t("gainers", "Gewinner")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.subtext, fontSize: 11 }}>
              {formatMoney(marketCap, settings.currency, true, settings.language)}
            </Text>
          </View>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={(item) => item.symbol}
        onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 210)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void (async () => {
                setRefreshing(true);
                try {
                  await Promise.all([refreshLiveQuotes(), load(true)]);
                } finally {
                  setRefreshing(false);
                }
              })();
            }}
            {...refreshControlProps(colors, "Refreshing stock market...")}
          />
        }
        contentContainerStyle={{ paddingBottom: 118 }}
        ListHeaderComponent={
          <View>
            <TabHeader
              title={t("Stocks", "Aktien")}
              subtitle={t("Live updates in background", "Live-Updates im Hintergrund")}
            />

            <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
              <LinearGradient
                colors={colors.dark ? ["#1D1537", "#121426", "#0B0C14"] : ["#EFE9FF", "#F3F4FF", "#FAFAFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 22, padding: 16 }}
              >
                <Text style={{ color: colors.text, fontSize: 26, fontWeight: "900" }}>
                  {t("Stock Pulse", "Aktien-Puls")}
                </Text>
                {!!lastUpdatedAt && (
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>
                    {t("Updated", "Aktualisiert")} {new Date(lastUpdatedAt).toLocaleTimeString(settings.language)}
                  </Text>
                )}

                {!!error && (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#60303A",
                      backgroundColor: "#2F1920",
                    }}
                  >
                    <Text style={{ color: "#FFB8C0" }}>{error}</Text>
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>
                      {t("Market Cap", "Marktkapitalisierung")}
                    </Text>
                    <Text style={{ color: colors.text, marginTop: 4, fontWeight: "800" }}>
                      {formatMoney(marketCap, settings.currency, settings.compactNumbers, settings.language)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("24h Volume", "24h Volumen")}</Text>
                    <Text style={{ color: colors.text, marginTop: 4, fontWeight: "800" }}>
                      {formatMoney(volume, settings.currency, settings.compactNumbers, settings.language)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Gainers", "Gewinner")}</Text>
                    <Text style={{ color: "#45D09F", marginTop: 4, fontWeight: "800" }}>
                      {gainersCount}/{rows.length}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>
                      {t("Avg Abs Move", "Durchschn. abs. Bewegung")}
                    </Text>
                    <Text style={{ color: "#F7D18A", marginTop: 4, fontWeight: "800" }}>{avgMove.toFixed(2)}%</Text>
                  </View>
                </View>
              </LinearGradient>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("Search symbols or names", "Symbole oder Namen suchen")}
                placeholderTextColor={colors.subtext}
                style={{
                  marginTop: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              />

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 10 }}>
                {([
                  ["rank", t("Rank", "Rang")],
                  ["price", t("Price", "Preis")],
                  ["change24", "24h %"],
                  ["marketCap", t("MCap", "Marktkap.")],
                  ["volume", t("Volume", "Volumen")],
                ] as const).map(([value, label]) => {
                  const active = sortKey === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setSort(value)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? "#5F43B2" : colors.border,
                        backgroundColor: pressed
                          ? colors.dark
                            ? "#151522"
                            : "#EDF2FF"
                          : active
                            ? colors.dark
                              ? "#17132A"
                              : "#EEE8FF"
                            : colors.surface,
                      })}
                    >
                      <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "600", fontSize: 12 }}>
                        {label}
                        {active ? (sortDesc ? " ↓" : " ↑") : ""}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => setSavedOnly((v) => !v)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: savedOnly ? "#5F43B2" : colors.border,
                    backgroundColor: pressed
                      ? colors.dark
                        ? "#151522"
                        : "#EDF2FF"
                      : savedOnly
                        ? colors.dark
                          ? "#17132A"
                          : "#EEE8FF"
                        : colors.surface,
                  })}
                >
                  <Text style={{ color: savedOnly ? "#7E5CE6" : colors.subtext, fontWeight: "600", fontSize: 12 }}>
                    {savedOnly ? t("Saved only", "Nur gespeichert") : t("All stocks", "Alle Aktien")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setRowDensity((prev) => (prev === "compact" ? "expanded" : "compact"))}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: rowDensity === "expanded" ? "#5F43B2" : colors.border,
                    backgroundColor: pressed
                      ? colors.dark
                        ? "#151522"
                        : "#EDF2FF"
                      : rowDensity === "expanded"
                        ? colors.dark
                          ? "#17132A"
                          : "#EEE8FF"
                        : colors.surface,
                  })}
                >
                  <Text style={{ color: rowDensity === "expanded" ? "#7E5CE6" : colors.subtext, fontWeight: "600", fontSize: 12 }}>
                    {rowDensity === "expanded" ? t("Expanded rows", "Erweiterte Zeilen") : t("Compact rows", "Kompakte Zeilen")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 44 }}>
              <ActivityIndicator size="large" color="#8B5CF6" />
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => {
          const isUp = item.changePct >= 0;
          const rank = rankBySymbol[item.symbol] ?? "-";
          const dayRangePct =
            Number.isFinite(item.low24h) && Number.isFinite(item.high24h) && (item.low24h ?? 0) > 0
              ? (((item.high24h ?? 0) - (item.low24h ?? 0)) / (item.low24h ?? 1)) * 100
              : 0;
          const volToCap = item.marketCap > 0 ? (item.volume / item.marketCap) * 100 : 0;
          const kindLabel = item.kind === "etf" ? "ETF" : "Stock";
          const logoFailed = Boolean(failedLogos[item.symbol]);

          if (rowDensity === "compact") {
            return (
              <Pressable
                onPress={() =>
                  router.push(
                    `/chart/custom?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}&kind=${encodeURIComponent(item.kind)}`
                  )
                }
                style={({ pressed }) => ({
                  marginHorizontal: SCREEN_HORIZONTAL_PADDING,
                  backgroundColor: pressed ? (colors.dark ? "#121525" : "#E6EDFB") : colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {!logoFailed ? (
                    <Image
                      source={{ uri: item.logoUrl }}
                      onError={() => setFailedLogos((prev) => ({ ...prev, [item.symbol]: true }))}
                      style={{ width: 26, height: 26, borderRadius: 13 }}
                    />
                  ) : (
                    <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.dark ? "#1A2237" : "#E7EEFF" }}>
                      <MaterialIcons name={item.kind === "etf" ? "pie-chart" : "show-chart"} size={13} color={item.kind === "etf" ? "#6FD6C8" : "#79B9FF"} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {item.symbol} • {item.name}
                    </Text>
                    <Text style={{ color: colors.subtext, marginTop: 1, fontSize: 12 }}>
                      #{rank} • {kindLabel}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {formatMoney(item.price, settings.currency, true, settings.language)}
                    </Text>
                    <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", fontWeight: "700", marginTop: 2 }}>
                      {formatPct(item.changePct)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              onPress={() =>
                router.push(
                  `/chart/custom?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}&kind=${encodeURIComponent(item.kind)}`
                )
              }
              style={({ pressed }) => ({
                marginHorizontal: SCREEN_HORIZONTAL_PADDING,
                backgroundColor: pressed ? (colors.dark ? "#121525" : "#E6EDFB") : colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 14,
              })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  {!logoFailed ? (
                    <Image
                      source={{ uri: item.logoUrl }}
                      onError={() => setFailedLogos((prev) => ({ ...prev, [item.symbol]: true }))}
                      style={{ width: 28, height: 28, borderRadius: 14 }}
                    />
                  ) : (
                    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.dark ? "#1A2237" : "#E7EEFF" }}>
                      <MaterialIcons name={item.kind === "etf" ? "pie-chart" : "show-chart"} size={14} color={item.kind === "etf" ? "#6FD6C8" : "#79B9FF"} />
                    </View>
                  )}
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", flex: 1 }}>
                    {item.name} ({item.symbol})
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Text style={{ color: colors.subtext, fontWeight: "700" }}>#{rank}</Text>
                  <Pressable
                    onPress={() => toggleEquity(item.symbol)}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isEquitySaved(item.symbol) ? "#5F43B2" : colors.border,
                      backgroundColor: pressed
                        ? colors.dark
                          ? "#161624"
                          : "#EDF2FF"
                        : isEquitySaved(item.symbol)
                          ? colors.dark
                            ? "#17132A"
                            : "#EEE8FF"
                          : colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: isEquitySaved(item.symbol) ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>
                      {isEquitySaved(item.symbol) ? t("Saved", "Gespeichert") : t("Save", "Speichern")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={() =>
                  router.push(
                    `/chart/custom?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}&kind=${encodeURIComponent(item.kind)}`
                  )
                }
              >
                <Text style={{ color: "#8B5CF6", fontSize: 27, fontWeight: "900", marginTop: 8 }}>
                  {formatMoney(item.price, settings.currency, settings.compactNumbers, settings.language)}
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
                <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", fontWeight: "700" }}>24h {formatPct(item.changePct)}</Text>
                <Text style={{ color: "#96A1C8", fontWeight: "700" }}>{kindLabel}</Text>
                <Text style={{ color: "#A4B1D9", fontWeight: "700" }}>
                  {item.exchange || "-"}
                </Text>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("Market Cap", "Marktkapitalisierung")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>{formatMoney(item.marketCap, settings.currency, true, settings.language)}</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("24h Volume", "24h Volumen")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>{formatMoney(item.volume, settings.currency, true, settings.language)}</Text>
                </View>
              </View>

              <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("Day Range", "Tagesbereich")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>
                    {formatMoney(item.low24h ?? NaN, settings.currency, true, settings.language)} - {formatMoney(item.high24h ?? NaN, settings.currency, true, settings.language)}
                  </Text>
                </View>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("Range + Flow", "Range + Flow")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>
                    {dayRangePct.toFixed(2)}% {t("range", "Range")} • {volToCap.toFixed(2)}% {t("vol/cap", "Vol/Kap")}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Pressable
                  onPress={() =>
                    router.push(
                      `/chart/custom?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}&kind=${encodeURIComponent(item.kind)}`
                    )
                  }
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Open chart", "Chart oeffnen")}</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const targetPrice = item.price * 1.05;
                    addAlert({
                      assetId: item.symbol.toUpperCase(),
                      symbol: item.symbol.toUpperCase(),
                      name: item.name,
                      kind: item.kind,
                      mode: "price",
                      targetPrice,
                      direction: "above",
                    });
                    Alert.alert(
                      t("Price alert added", "Preisalarm hinzugefuegt"),
                      `${item.name} ${t("alert set for", "Alarm gesetzt fuer")} ${formatMoney(targetPrice, settings.currency, false, settings.language)} (${t("above", "oberhalb")}).`
                    );
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
                    {t("Set +5% alert", "+5%-Alarm setzen")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
