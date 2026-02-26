import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TRACKED_COINS, TRACKED_COINS_BY_ID } from "../../src/catalog/coins";
import { searchUniversalAssets, UniversalAsset } from "../../src/data/asset-search";
import { CoinMarket, fetchCoinGeckoMarkets, fetchCoinGeckoSimplePrices, fetchCoinGeckoTopMarkets } from "../../src/data/coingecko";
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

export default function CryptoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { coinIds, isCoinSaved, toggleCoin } = useWatchlist();
  const { settings } = useSettings();
  const colors = useAppColors();
  const { addAlert } = usePriceAlerts();
  const { t } = useI18n();

  const [marketRows, setMarketRows] = useState<CoinMarket[]>([]);
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
  const listRef = useRef<FlatList<CoinMarket>>(null);
  const pollCounterRef = useRef(0);
  const marketIdsKey = useMemo(
    () => marketRows.map((row) => row.id).sort().join("|"),
    [marketRows]
  );
  const marketIdSet = useMemo(
    () => new Set(marketIdsKey ? marketIdsKey.split("|") : []),
    [marketIdsKey]
  );
  const marketIds = useMemo(
    () => (marketIdsKey ? marketIdsKey.split("|").filter(Boolean) : []),
    [marketIdsKey]
  );
  useLogoScrollToTop(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  });

  const refreshLivePrices = useCallback(async (): Promise<boolean> => {
    const ids = marketIds.slice(0, 220);
    if (!ids.length) return false;
    try {
      const quotes = await fetchCoinGeckoSimplePrices({
        ids,
        vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
        useCache: true,
        cacheTtlMs: 8_000,
      });
      if (!Object.keys(quotes).length) return false;
      const nowIso = new Date().toISOString();
      let changed = false;
      setMarketRows((prev) =>
        prev.map((row) => {
          const q = quotes[row.id];
          if (!q) return row;
          const nextPrice = Number.isFinite(q.current_price) ? Number(q.current_price) : row.current_price;
          const nextMcap = Number.isFinite(q.market_cap) ? Number(q.market_cap) : row.market_cap;
          const nextVol = Number.isFinite(q.total_volume) ? Number(q.total_volume) : row.total_volume;
          const nextChg = Number.isFinite(q.price_change_percentage_24h)
            ? Number(q.price_change_percentage_24h)
            : row.price_change_percentage_24h;
          const hasDiff =
            nextPrice !== row.current_price ||
            nextMcap !== row.market_cap ||
            nextVol !== row.total_volume ||
            nextChg !== row.price_change_percentage_24h;
          if (!hasDiff) return row;
          changed = true;
          return {
            ...row,
            current_price: nextPrice,
            market_cap: nextMcap,
            total_volume: nextVol,
            price_change_percentage_24h: nextChg,
            last_updated: nowIso,
          };
        })
      );
      if (changed) setLastUpdatedAt(Date.now());
      setError(null);
      return true;
    } catch {
      return false;
    }
  }, [marketIds, settings.currency]);

  const load = useCallback(
    async (isManualRefresh = false): Promise<boolean> => {
      try {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);

        const rows = await fetchCoinGeckoTopMarkets({
          vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
          page: 1,
          perPage: 200,
          // Stale-while-revalidate strategy to avoid blank board and reduce provider throttling.
          useCache: !isManualRefresh,
          cacheTtlMs: 15_000,
        });

        if (rows.length > 0) {
          setMarketRows(rows);
          setLastUpdatedAt(Date.now());
          setError(null);
          return true;
        }

        // Top 200 endpoint can return empty during provider throttling.
        // Immediately fail over to a smaller tracked set so the screen never sits blank.
        const fallback = await fetchCoinGeckoMarkets({
          ids: TRACKED_COINS.slice(0, 40).map((c) => c.id),
          vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
          useCache: !isManualRefresh,
          cacheTtlMs: 15_000,
        });
        if (fallback.length > 0) {
          setMarketRows((prev) => {
            if (!prev.length) return fallback;
            const byId = new Map(prev.map((row) => [row.id, row]));
            for (const row of fallback) byId.set(row.id, row);
            return [...byId.values()];
          });
          setLastUpdatedAt(Date.now());
          setError(t("Live feed delayed by provider rate limits. Showing fallback market set.", "Live-Feed verzoegert durch Rate-Limits. Fallback-Marktdaten werden angezeigt."));
          return true;
        }

        setError(t("Could not update prices. CoinGecko may be rate limiting right now.", "Preise konnten nicht aktualisiert werden. CoinGecko limitiert eventuell aktuell."));
        return marketRows.length > 0;
      } catch {
        try {
          const fallback = await fetchCoinGeckoMarkets({
            ids: TRACKED_COINS.slice(0, 40).map((c) => c.id),
            vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
            useCache: !isManualRefresh,
            cacheTtlMs: 15_000,
          });
          if (fallback.length > 0) {
            setMarketRows((prev) => {
              if (!prev.length) return fallback;
              const byId = new Map(prev.map((row) => [row.id, row]));
              for (const row of fallback) byId.set(row.id, row);
              return [...byId.values()];
            });
            setLastUpdatedAt(Date.now());
            setError(t("Live feed delayed by provider rate limits. Showing fallback market set.", "Live-Feed verzoegert durch Rate-Limits. Fallback-Marktdaten werden angezeigt."));
            return true;
          }
        } catch {}
        setError(t("Could not update prices. CoinGecko may be rate limiting right now.", "Preise konnten nicht aktualisiert werden. CoinGecko limitiert eventuell aktuell."));
        return marketRows.length > 0;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [settings.currency, t, marketRows.length]
  );

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setRemoteSearchRows([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void searchUniversalAssets(q, 24)
        .then((rows) => {
          if (!alive) return;
          setRemoteSearchRows(rows.filter((r) => r.kind === "crypto"));
        })
        .catch(() => {
          if (alive) setRemoteSearchRows([]);
        });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search]);

  useEffect(() => {
    const missingIds = remoteSearchRows
      .map((r) => r.coinGeckoId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => !marketIdSet.has(id))
      .slice(0, 20);
    if (!missingIds.length) return;
    let alive = true;
    (async () => {
      try {
        const extra = await fetchCoinGeckoMarkets({
          ids: missingIds,
          vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
          useCache: true,
          cacheTtlMs: 30_000,
        });
        if (!alive) return;
        setMarketRows((prev) => {
          const byId = new Map(prev.map((r) => [r.id, r]));
          for (const row of extra) byId.set(row.id, row);
          return [...byId.values()];
        });
      } catch {
      }
    })();
    return () => {
      alive = false;
    };
  }, [remoteSearchRows, settings.currency, marketIdSet]);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let backoffMs = 0;

    async function tick() {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        pollCounterRef.current += 1;
        const shouldRunFull = marketRows.length === 0 || pollCounterRef.current % 6 === 0;
        const ok = shouldRunFull ? await load(false) : await refreshLivePrices();
        if (ok) backoffMs = 0;
        else backoffMs = Math.min(backoffMs ? backoffMs * 2 : 5000, 15000);
      } finally {
        inFlight = false;
      }
    }

    void tick();

    if (!settings.autoRefresh) {
      return () => {
        alive = false;
      };
    }

    const baseDelayMs = Math.max(5, settings.refreshSeconds) * 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

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
  }, [load, marketRows.length, refreshLivePrices, settings.autoRefresh, settings.refreshSeconds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? marketRows.filter((row) => {
          const meta = TRACKED_COINS_BY_ID[row.id];
          return (
            row.name.toLowerCase().includes(q) ||
            row.symbol.toLowerCase().includes(q) ||
            meta?.symbol.toLowerCase().includes(q)
          );
        })
      : marketRows;

    const watchlistRows = savedOnly ? rows.filter((row) => coinIds.includes(row.id)) : rows;

    return [...watchlistRows].sort((a, b) => {
      const dir = sortDesc ? -1 : 1;
      if (sortKey === "rank") return ((a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999)) * dir;
      if (sortKey === "price") return (a.current_price - b.current_price) * dir;
      if (sortKey === "change24") {
        const av = a.price_change_percentage_24h ?? -999;
        const bv = b.price_change_percentage_24h ?? -999;
        return (av - bv) * dir;
      }
      if (sortKey === "marketCap") return (a.market_cap - b.market_cap) * dir;
      return (a.total_volume - b.total_volume) * dir;
    });
  }, [marketRows, search, sortKey, sortDesc, savedOnly, coinIds]);

  const totalMarketCap = useMemo(() => marketRows.reduce((sum, row) => sum + (row.market_cap || 0), 0), [marketRows]);
  const totalVolume = useMemo(() => marketRows.reduce((sum, row) => sum + (row.total_volume || 0), 0), [marketRows]);
  const gainersCount = useMemo(() => marketRows.filter((row) => (row.price_change_percentage_24h ?? 0) > 0).length, [marketRows]);
  const avgMove = useMemo(() => {
    if (!marketRows.length) return 0;
    return marketRows.reduce((sum, row) => sum + Math.abs(row.price_change_percentage_24h ?? 0), 0) / marketRows.length;
  }, [marketRows]);

  const setSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(next);
    setSortDesc(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RefreshFeedback refreshing={refreshing} colors={colors} label={t("Refreshing market feed...", "Marktdaten werden aktualisiert...")} />
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
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Crypto Live", "Krypto Live")}</Text>
            <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 1 }}>{filtered.length} {t("assets", "Assets")} • {gainersCount} {t("gainers", "Gewinner")}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.subtext, fontSize: 11 }}>{formatMoney(totalMarketCap, settings.currency, true, settings.language)}</Text>
          </View>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={(item) => item.id}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setCompactHeader(y > 210);
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void (async () => {
                setRefreshing(true);
                try {
                  // Manual refresh should always force at least one full fetch for fresh ranks + prices.
                  const [liveOk] = await Promise.all([refreshLivePrices(), load(true)]);
                  if (!liveOk) {
                    // load(true) already ran; keep this branch for clarity.
                  }
                } finally {
                  setRefreshing(false);
                }
              })();
            }}
            {...refreshControlProps(colors, "Refreshing crypto market...")}
          />
        }
        contentContainerStyle={{ paddingBottom: 118 }}
        ListHeaderComponent={
          <View>
            <TabHeader
              title={t("Crypto", "Krypto")}
              subtitle={t("Live updates in background", "Live-Updates im Hintergrund")}
            />

            <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
              <LinearGradient
                colors={colors.dark ? ["#1D1537", "#121426", "#0B0C14"] : ["#EFE9FF", "#F3F4FF", "#FAFAFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 22, padding: 16 }}
              >
                <Text style={{ color: colors.text, fontSize: 26, fontWeight: "900" }}>{t("Market Pulse", "Markt-Puls")}</Text>
                {!!lastUpdatedAt && (
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>
                    {t("Updated", "Aktualisiert")} {new Date(lastUpdatedAt).toLocaleTimeString(settings.language)}
                  </Text>
                )}

                {!!error && (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#60303A", backgroundColor: "#2F1920" }}>
                    <Text style={{ color: "#FFB8C0" }}>{error}</Text>
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Market Cap", "Marktkapitalisierung")}</Text>
                    <Text style={{ color: colors.text, marginTop: 4, fontWeight: "800" }}>{formatMoney(totalMarketCap, settings.currency, settings.compactNumbers, settings.language)}</Text>
                  </View>
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("24h Volume", "24h Volumen")}</Text>
                    <Text style={{ color: colors.text, marginTop: 4, fontWeight: "800" }}>{formatMoney(totalVolume, settings.currency, settings.compactNumbers, settings.language)}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Gainers", "Gewinner")}</Text>
                    <Text style={{ color: "#45D09F", marginTop: 4, fontWeight: "800" }}>{gainersCount}/{marketRows.length}</Text>
                  </View>
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Avg Abs Move", "Durchschn. abs. Bewegung")}</Text>
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
                        backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                      })}
                    >
                      <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "600", fontSize: 12 }}>
                        {label}{active ? (sortDesc ? " ↓" : " ↑") : ""}
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
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : savedOnly ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: savedOnly ? "#7E5CE6" : colors.subtext, fontWeight: "600", fontSize: 12 }}>
                    {savedOnly ? t("Saved only", "Nur gespeichert") : t("All coins", "Alle Coins")}
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
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : rowDensity === "expanded" ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
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
          const pct24 = item.price_change_percentage_24h;
          const isUp = (pct24 ?? 0) >= 0;
          const chartId = `${item.symbol.toLowerCase()}_price_usd`;
          const dayRangePct = item.low_24h > 0 ? ((item.high_24h - item.low_24h) / item.low_24h) * 100 : 0;
          const volToCap = item.market_cap > 0 ? (item.total_volume / item.market_cap) * 100 : 0;

          if (rowDensity === "compact") {
            return (
              <Pressable
                onPress={() => router.push(`/chart/${chartId}`)}
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
                  <Image source={{ uri: item.image }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>{item.symbol.toUpperCase()} • {item.name}</Text>
                    <Text style={{ color: colors.subtext, marginTop: 1, fontSize: 12 }}>#{item.market_cap_rank ?? "-"} • {new Date(item.last_updated).toLocaleTimeString(settings.language)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>{formatMoney(item.current_price, settings.currency, true, settings.language)}</Text>
                    <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", fontWeight: "700", marginTop: 2 }}>{formatPct(item.price_change_percentage_24h)}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              onPress={() => router.push(`/chart/${chartId}`)}
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
                  <Image source={{ uri: item.image }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", flex: 1 }}>
                    {item.name} ({item.symbol.toUpperCase()})
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Text style={{ color: colors.subtext, fontWeight: "700" }}>#{item.market_cap_rank ?? "-"}</Text>
                  <Pressable
                    onPress={() => toggleCoin(item.id)}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isCoinSaved(item.id) ? "#5F43B2" : colors.border,
                      backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : isCoinSaved(item.id) ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: isCoinSaved(item.id) ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>
                      {isCoinSaved(item.id) ? t("Saved", "Gespeichert") : t("Save", "Speichern")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={() => router.push(`/chart/${chartId}`)}>
                <Text style={{ color: "#8B5CF6", fontSize: 27, fontWeight: "900", marginTop: 8 }}>
                  {formatMoney(item.current_price, settings.currency, settings.compactNumbers, settings.language)}
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
                <Text style={{ color: isUp ? "#36D399" : "#FF6B6B", fontWeight: "700" }}>24h {formatPct(item.price_change_percentage_24h)}</Text>
                <Text style={{ color: "#96A1C8", fontWeight: "700" }}>1h {formatPct(item.price_change_percentage_1h_in_currency)}</Text>
                <Text style={{ color: "#A4B1D9", fontWeight: "700" }}>7d {formatPct(item.price_change_percentage_7d_in_currency)}</Text>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("Market Cap", "Marktkapitalisierung")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>{formatMoney(item.market_cap, settings.currency, true, settings.language)}</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("24h Volume", "24h Volumen")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>{formatMoney(item.total_volume, settings.currency, true, settings.language)}</Text>
                </View>
              </View>

              <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("Day Range", "Tagesbereich")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>
                    {formatMoney(item.low_24h, settings.currency, true, settings.language)} - {formatMoney(item.high_24h, settings.currency, true, settings.language)}
                  </Text>
                </View>
                <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#222638", backgroundColor: "#10131D", padding: 9 }}>
                  <Text style={{ color: "#7E88AA", fontSize: 11 }}>{t("Range + Flow", "Range + Flow")}</Text>
                  <Text style={{ color: "#D2DAF8", marginTop: 4, fontWeight: "700" }}>{dayRangePct.toFixed(2)}% {t("range", "Range")} • {volToCap.toFixed(2)}% {t("vol/cap", "Vol/Kap")}</Text>
                </View>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Pressable
                  onPress={() => {
                    router.push(`/chart/${chartId}`);
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
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Open chart", "Chart oeffnen")}</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const targetPrice = item.current_price * 1.05;
                    addAlert({
                      assetId: item.id,
                      symbol: item.symbol.toUpperCase(),
                      name: item.name,
                      kind: "crypto",
                      coinGeckoId: item.id,
                      mode: "price",
                      targetPrice,
                      direction: "above",
                    });
                    Alert.alert(t("Price alert added", "Preisalarm hinzugefuegt"), `${item.name} ${t("alert set for", "Alarm gesetzt fuer")} ${formatMoney(targetPrice, settings.currency, false, settings.language)} (${t("above", "oberhalb")}).`);
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
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Set +5% alert", "+5%-Alarm setzen")}</Text>
                </Pressable>

                <Text style={{ color: "#6F7390" }}>{new Date(item.last_updated).toLocaleTimeString(settings.language)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
