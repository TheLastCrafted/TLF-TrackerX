import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CHARTS } from "../../src/catalog/charts";
import { CoinMarket, fetchCoinGeckoMarkets } from "../../src/data/coingecko";
import { fetchStockQuoteSnapshot, fetchTopStocks, StockMarketRow } from "../../src/data/stocks-live";
import { useI18n } from "../../src/i18n/use-i18n";
import { useSettings } from "../../src/state/settings";
import { useWatchlist } from "../../src/state/watchlist";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function formatMoney(value: number, currency: "USD" | "EUR", compact: boolean, locale: "en" | "de"): string {
  if (!Number.isFinite(value)) return "-";
  if (compact) {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function WatchlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { chartIds, coinIds, equitySymbols, toggleChart, toggleCoin, toggleEquity } = useWatchlist();
  const colors = useAppColors();
  const { t } = useI18n();

  const [coins, setCoins] = useState<CoinMarket[]>([]);
  const [equities, setEquities] = useState<StockMarketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [failedEquityLogos, setFailedEquityLogos] = useState<Record<string, true>>({});
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });

  const savedCharts = useMemo(
    () => chartIds.map((id) => CHARTS.find((chart) => chart.id === id)).filter(Boolean),
    [chartIds]
  );

  const savedChartCoinIds = useMemo(
    () =>
      savedCharts
        .map((chart) => (chart?.type === "coingecko_market_chart" ? chart.params.coinId : ""))
        .filter(Boolean),
    [savedCharts]
  );

  const coinById = useMemo(() => {
    const next: Record<string, CoinMarket> = {};
    for (const row of coins) next[row.id] = row;
    return next;
  }, [coins]);

  const equityBySymbol = useMemo(() => {
    const next: Record<string, StockMarketRow> = {};
    for (const row of equities) next[row.symbol] = row;
    return next;
  }, [equities]);

  const savedCoinRows = useMemo(
    () => coinIds.map((id) => coinById[id]).filter(Boolean),
    [coinById, coinIds]
  );

  const savedEquityRows = useMemo(
    () => equitySymbols.map((symbol) => equityBySymbol[symbol]).filter(Boolean),
    [equityBySymbol, equitySymbols]
  );

  const summary = useMemo(() => {
    const totalTracked = coinIds.length + equitySymbols.length + chartIds.length;
    const coinMovers = savedCoinRows.filter((row) => (row.price_change_percentage_24h ?? 0) > 0).length;
    const equityMovers = savedEquityRows.filter((row) => row.changePct > 0).length;
    const aggregateCap =
      savedCoinRows.reduce((sum, row) => sum + (row.market_cap || 0), 0) +
      savedEquityRows.reduce((sum, row) => sum + (row.marketCap || 0), 0);
    return { totalTracked, coinMovers, equityMovers, aggregateCap };
  }, [chartIds.length, coinIds.length, equitySymbols.length, savedCoinRows, savedEquityRows]);

  const mergeEquityWithUniverse = useCallback(
    (liveRows: StockMarketRow[], topRows: StockMarketRow[]): StockMarketRow[] => {
      const liveBy = new Map(liveRows.map((row) => [row.symbol, row]));
      const topBy = new Map(topRows.map((row) => [row.symbol, row]));
      return equitySymbols
        .map((symbol) => {
          const live = liveBy.get(symbol);
          const top = topBy.get(symbol);
          if (!live && !top) return null;
          if (!live && top) return top;
          if (live && !top) return live;
          return {
            ...live!,
            changePct:
              Math.abs(live!.changePct || 0) < 0.0001 && Math.abs(top!.changePct || 0) > 0.0001
                ? top!.changePct
                : live!.changePct,
            marketCap: live!.marketCap > 0 ? live!.marketCap : top!.marketCap,
            volume: live!.volume > 0 ? live!.volume : top!.volume,
            averageVolume: live!.averageVolume ?? top!.averageVolume,
            high24h: live!.high24h ?? top!.high24h,
            low24h: live!.low24h ?? top!.low24h,
            exchange: live!.exchange || top!.exchange,
            currency: live!.currency || top!.currency,
          } satisfies StockMarketRow;
        })
        .filter((row): row is StockMarketRow => Boolean(row));
    },
    [equitySymbols]
  );

  const loadSavedRows = useCallback(async () => {
    const mergedIds = Array.from(new Set([...coinIds, ...savedChartCoinIds])).filter(Boolean);
    try {
      setLoading(true);
      setLoadNote(null);
      const [coinRows, equityRows] = await Promise.all([
        mergedIds.length
          ? withTimeout(
              fetchCoinGeckoMarkets({
                ids: mergedIds,
                vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
                useCache: true,
                cacheTtlMs: 20_000,
              }),
              4_500,
              [] as CoinMarket[]
            )
          : Promise.resolve([]),
        equitySymbols.length
          ? withTimeout(
              fetchStockQuoteSnapshot(equitySymbols, { useCache: true, cacheTtlMs: 20_000 }),
              4_000,
              [] as StockMarketRow[]
            )
          : Promise.resolve([]),
      ]);
      const topUniverseRows =
        equitySymbols.length > 0
          ? await withTimeout(fetchTopStocks({ count: 220, useCache: true, cacheTtlMs: 45_000 }), 4_000, [] as StockMarketRow[])
          : [];
      const mergedEquities = mergeEquityWithUniverse(equityRows, topUniverseRows);
      if (!mergedIds.length) setCoins([]);
      else if (coinRows.length) setCoins(coinRows);

      if (!equitySymbols.length) setEquities([]);
      else if (mergedEquities.length) setEquities(mergedEquities);

      const coinMiss = mergedIds.length > 0 && coinRows.length === 0;
      const equityMiss = equitySymbols.length > 0 && mergedEquities.length === 0;
      if (coinMiss || equityMiss) {
        setLoadNote(
          t(
            "Some watchlist quotes are delayed. Pull to refresh in a moment.",
            "Einige Watchlist-Kurse sind verzoegert. Bitte gleich erneut aktualisieren."
          )
        );
      }

      // Non-blocking revalidation: refresh from network after showing cache-backed data.
      void (async () => {
        const [coinFresh, equityFresh] = await Promise.all([
          mergedIds.length
            ? withTimeout(
                fetchCoinGeckoMarkets({
                  ids: mergedIds,
                  vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
                  useCache: false,
                }),
                10_000,
                [] as CoinMarket[]
              )
            : Promise.resolve([]),
          equitySymbols.length
            ? withTimeout(fetchStockQuoteSnapshot(equitySymbols, { useCache: false }), 8_000, [] as StockMarketRow[])
            : Promise.resolve([]),
        ]);
        const topFresh =
          equitySymbols.length > 0
            ? await withTimeout(fetchTopStocks({ count: 220, useCache: false, cacheTtlMs: 45_000 }), 8_000, [] as StockMarketRow[])
            : [];
        const mergedFreshEquities = mergeEquityWithUniverse(equityFresh, topFresh);

        if (coinFresh.length) setCoins(coinFresh);
        if (mergedFreshEquities.length) setEquities(mergedFreshEquities);
        if (coinFresh.length || mergedFreshEquities.length) setLoadNote(null);
      })();
    } finally {
      setLoading(false);
    }
  }, [coinIds, equitySymbols, mergeEquityWithUniverse, savedChartCoinIds, settings.currency, t]);

  useEffect(() => {
    void loadSavedRows();
  }, [loadSavedRows]);

  const onManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await loadSavedRows();
    } finally {
      setManualRefreshing(false);
    }
  }, [loadSavedRows]);

  const openRemoveCoinMenu = useCallback(
    (coin: CoinMarket) => {
      Alert.alert(coin.symbol.toUpperCase(), t("Manage watchlist item", "Watchlist-Eintrag verwalten"), [
        { text: t("Dismiss", "Schliessen"), style: "cancel" },
        {
          text: t("Remove from watchlist", "Aus Watchlist entfernen"),
          style: "destructive",
          onPress: () => toggleCoin(coin.id),
        },
      ]);
    },
    [t, toggleCoin]
  );

  const openRemoveEquityMenu = useCallback(
    (equity: StockMarketRow) => {
      Alert.alert(equity.symbol.toUpperCase(), t("Manage watchlist item", "Watchlist-Eintrag verwalten"), [
        { text: t("Dismiss", "Schliessen"), style: "cancel" },
        {
          text: t("Remove from watchlist", "Aus Watchlist entfernen"),
          style: "destructive",
          onPress: () => toggleEquity(equity.symbol),
        },
      ]);
    },
    [t, toggleEquity]
  );

  const openRemoveChartMenu = useCallback(
    (chartId: string, title: string) => {
      Alert.alert(title, t("Manage watchlist item", "Watchlist-Eintrag verwalten"), [
        { text: t("Dismiss", "Schliessen"), style: "cancel" },
        {
          text: t("Remove from watchlist", "Aus Watchlist entfernen"),
          style: "destructive",
          onPress: () => toggleChart(chartId),
        },
      ]);
    },
    [t, toggleChart]
  );

  const emptyState = !coinIds.length && !equitySymbols.length && !chartIds.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RefreshFeedback refreshing={manualRefreshing} colors={colors} label={t("Refreshing watchlist...", "Watchlist wird aktualisiert...")} />

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
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Watchlist", "Watchlist")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {coinIds.length} {t("coins", "Coins")} • {equitySymbols.length} {t("stocks", "Aktien")} • {chartIds.length}{" "}
            {t("charts", "Charts")}
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 120)}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
          paddingBottom: Math.max(120, insets.bottom + 90),
        }}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={() => {
              void onManualRefresh();
            }}
            {...refreshControlProps(colors, "Refreshing watchlist...")}
          />
        }
      >
        <TabHeader
          title={t("Watchlist", "Watchlist")}
          subtitle={`${coinIds.length} ${t("coins", "Coins")} • ${equitySymbols.length} ${t("stocks", "Aktien")} • ${chartIds.length} ${t("charts", "Charts")}`}
          bottomSpacing={8}
        />

        <LinearGradient
          colors={colors.dark ? ["#1D1537", "#121426", "#0B0C14"] : ["#EFE9FF", "#F3F4FF", "#FAFAFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, padding: 16 }}
        >
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: "900" }}>
            {t("Watchlist Pulse", "Watchlist-Puls")}
          </Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>
            {summary.totalTracked} {t("tracked", "verfolgt")} • {summary.coinMovers + summary.equityMovers}{" "}
            {t("positive movers", "positive Bewegungen")}
          </Text>
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
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Aggregate MCap", "Aggregate Marktkap.")}</Text>
              <Text style={{ color: colors.text, marginTop: 4, fontWeight: "800" }}>
                {formatMoney(summary.aggregateCap, settings.currency, true, settings.language)}
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
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Items", "Eintraege")}</Text>
              <Text style={{ color: colors.text, marginTop: 4, fontWeight: "800" }}>
                {coinIds.length + equitySymbols.length} {t("assets", "Assets")}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {loading && (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator color="#8B5CF6" />
          </View>
        )}
        {!!loadNote && (
          <View
            style={{
              marginTop: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{loadNote}</Text>
          </View>
        )}

        {emptyState ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 32 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
              {t("No saved items yet", "Noch keine gespeicherten Eintraege")}
            </Text>
            <Text style={{ color: colors.subtext, marginTop: 8, textAlign: "center", maxWidth: 320 }}>
              {t(
                "Save coins in Crypto, save stocks in Stocks, and save custom charts in chart detail.",
                "Speichere Coins im Krypto-Tab, Aktien im Aktien-Tab und Charts in der Chart-Detailansicht."
              )}
            </Text>
          </View>
        ) : (
          <>
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>
                {t("Saved Coins", "Gespeicherte Coins")}
              </Text>
              <View style={{ gap: 10 }}>
                {savedCoinRows.map((coin) => {
                  const isUp = (coin.price_change_percentage_24h ?? 0) >= 0;
                  return (
                    <Pressable
                      key={coin.id}
                      onPress={() => router.push(`/chart/${coin.symbol.toLowerCase()}_price_usd`)}
                      onLongPress={() => openRemoveCoinMenu(coin)}
                      style={({ pressed }) => ({
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#121525" : "#E6EDFB") : colors.surface,
                        padding: 12,
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        {coin.image ? (
                          <Image source={{ uri: coin.image }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                        ) : (
                          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.dark ? "#1A2237" : "#E7EEFF" }}>
                            <MaterialIcons name="currency-bitcoin" size={15} color="#9B80FF" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
                            {coin.name} ({coin.symbol.toUpperCase()})
                          </Text>
                          <Text style={{ color: colors.subtext, marginTop: 1, fontSize: 12 }}>#{coin.market_cap_rank || "-"}</Text>
                        </View>
                      </View>

                      <Text style={{ color: "#8B5CF6", fontSize: 27, fontWeight: "900", marginTop: 8 }}>
                        {formatMoney(coin.current_price, settings.currency, settings.compactNumbers, settings.language)}
                      </Text>

                      <View style={{ flexDirection: "row", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                        <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", fontWeight: "700" }}>
                          24h {formatPct(coin.price_change_percentage_24h)}
                        </Text>
                        <Text style={{ color: "#96A1C8", fontWeight: "700" }}>
                          {t("MCap", "Marktkap.")} {formatMoney(coin.market_cap, settings.currency, true, settings.language)}
                        </Text>
                        <Text style={{ color: "#A4B1D9", fontWeight: "700" }}>
                          {t("Vol", "Vol")} {formatMoney(coin.total_volume, settings.currency, true, settings.language)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                {!coinIds.length && (
                  <Text style={{ color: colors.subtext }}>{t("No saved coins", "Keine gespeicherten Coins")}</Text>
                )}
                {coinIds.length > 0 && !savedCoinRows.length && !loading && (
                  <Text style={{ color: colors.subtext }}>
                    {t("Coin quotes unavailable right now.", "Coin-Kurse aktuell nicht verfuegbar.")}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: 16 }}>
              <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>
                {t("Saved Stocks & ETFs", "Gespeicherte Aktien & ETFs")}
              </Text>
              <View style={{ gap: 10 }}>
                {equitySymbols.map((symbol) => {
                  const row = equityBySymbol[symbol];
                  if (!row) {
                    return (
                      <Pressable
                        key={symbol}
                        onLongPress={() =>
                          Alert.alert(symbol, t("Manage watchlist item", "Watchlist-Eintrag verwalten"), [
                            { text: t("Dismiss", "Schliessen"), style: "cancel" },
                            {
                              text: t("Remove from watchlist", "Aus Watchlist entfernen"),
                              style: "destructive",
                              onPress: () => toggleEquity(symbol),
                            },
                          ])
                        }
                        onPress={() => router.push(`/chart/custom?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(symbol)}&kind=stock`)}
                        style={({ pressed }) => ({
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#121525" : "#E6EDFB") : colors.surface,
                          padding: 12,
                        })}
                      >
                        <Text style={{ color: colors.text, fontWeight: "800" }}>{symbol}</Text>
                        <Text style={{ color: colors.subtext, marginTop: 6 }}>
                          {loading
                            ? t("Loading live quote...", "Live-Kurs wird geladen...")
                            : t("Live quote currently unavailable.", "Live-Kurs aktuell nicht verfuegbar.")}
                        </Text>
                      </Pressable>
                    );
                  }
                  const isUp = row.changePct >= 0;
                  const failed = Boolean(failedEquityLogos[row.symbol]);
                  return (
                    <Pressable
                      key={row.symbol}
                      onPress={() =>
                        router.push(
                          `/chart/custom?symbol=${encodeURIComponent(row.symbol)}&name=${encodeURIComponent(row.name)}&kind=${encodeURIComponent(row.kind)}`
                        )
                      }
                      onLongPress={() => openRemoveEquityMenu(row)}
                      style={({ pressed }) => ({
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#121525" : "#E6EDFB") : colors.surface,
                        padding: 12,
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        {!failed ? (
                          <Image
                            source={{ uri: row.logoUrl }}
                            onError={() => setFailedEquityLogos((prev) => ({ ...prev, [row.symbol]: true }))}
                            style={{ width: 30, height: 30, borderRadius: 15 }}
                          />
                        ) : (
                          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.dark ? "#1A2237" : "#E7EEFF" }}>
                            <MaterialIcons
                              name={row.kind === "etf" ? "pie-chart" : "show-chart"}
                              size={15}
                              color={row.kind === "etf" ? "#6FD6C8" : "#79B9FF"}
                            />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
                            {row.symbol} • {row.name}
                          </Text>
                          <Text style={{ color: colors.subtext, marginTop: 1, fontSize: 12 }}>{row.kind.toUpperCase()}</Text>
                        </View>
                      </View>

                      <Text style={{ color: "#8B5CF6", fontSize: 27, fontWeight: "900", marginTop: 8 }}>
                        {formatMoney(row.price, settings.currency, settings.compactNumbers, settings.language)}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                        <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", fontWeight: "700" }}>
                          24h {formatPct(row.changePct)}
                        </Text>
                        <Text style={{ color: "#96A1C8", fontWeight: "700" }}>
                          {t("MCap", "Marktkap.")} {formatMoney(row.marketCap, settings.currency, true, settings.language)}
                        </Text>
                        <Text style={{ color: "#A4B1D9", fontWeight: "700" }}>
                          {t("Vol", "Vol")} {formatMoney(row.volume, settings.currency, true, settings.language)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                {!equitySymbols.length && (
                  <Text style={{ color: colors.subtext }}>{t("No saved stocks", "Keine gespeicherten Aktien")}</Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: 16 }}>
              <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>
                {t("Saved Charts", "Gespeicherte Charts")}
              </Text>
              <View style={{ gap: 10 }}>
                {savedCharts.map((item) => {
                  const chart = item!;
                  const coin = chart.type === "coingecko_market_chart" ? coinById[chart.params.coinId] : undefined;
                  const stockSymbol =
                    chart.type === "fred_series" && chart.category === "Stocks"
                      ? chart.params.seriesId.toUpperCase()
                      : "";
                  const stock = stockSymbol ? equityBySymbol[stockSymbol] : undefined;
                  const chartPreview =
                    chart.type === "coingecko_market_chart" && coin
                      ? chart.params.metric === "prices"
                        ? formatMoney(coin.current_price, settings.currency, settings.compactNumbers, settings.language)
                        : chart.params.metric === "market_caps"
                          ? formatMoney(coin.market_cap, settings.currency, true, settings.language)
                          : formatMoney(coin.total_volume, settings.currency, true, settings.language)
                      : stock
                        ? formatMoney(stock.price, settings.currency, settings.compactNumbers, settings.language)
                        : "";

                  return (
                    <Pressable
                      key={chart.id}
                      onPress={() => router.push(`/chart/${chart.id}`)}
                      onLongPress={() => openRemoveChartMenu(chart.id, chart.title)}
                      style={({ pressed }) => ({
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#121525" : "#E6EDFB") : colors.surface,
                        padding: 12,
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.dark ? "#1A2237" : "#E7EEFF",
                          }}
                        >
                          <MaterialIcons
                            name={chart.category === "Crypto" ? "currency-bitcoin" : chart.category === "Stocks" ? "show-chart" : "bar-chart"}
                            size={15}
                            color={chart.category === "Crypto" ? "#9B80FF" : chart.category === "Stocks" ? "#79B9FF" : "#7EE2D5"}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
                            {chart.title}
                          </Text>
                          <Text style={{ color: colors.subtext, marginTop: 1, fontSize: 12 }}>
                            {chart.category} {chart.description ? `• ${chart.description}` : ""}
                          </Text>
                        </View>
                      </View>
                      {!!chartPreview && (
                        <Text style={{ color: "#8B5CF6", fontSize: 24, fontWeight: "900", marginTop: 8 }}>
                          {chartPreview}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
                {!chartIds.length && (
                  <Text style={{ color: colors.subtext }}>{t("No saved charts", "Keine gespeicherten Charts")}</Text>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
