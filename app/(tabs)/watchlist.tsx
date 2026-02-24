import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TRACKED_COINS_BY_ID } from "../../src/catalog/coins";
import { CHARTS } from "../../src/catalog/charts";
import { CoinMarket, fetchCoinGeckoMarkets } from "../../src/data/coingecko";
import { useI18n } from "../../src/i18n/use-i18n";
import { useWatchlist } from "../../src/state/watchlist";
import { ChartRow } from "../../src/ui/ChartRow";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function WatchlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { chartIds, coinIds, toggleChart, toggleCoin } = useWatchlist();
  const colors = useAppColors();
  const { t } = useI18n();

  const [coins, setCoins] = useState<CoinMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);

  const savedCharts = useMemo(
    () => chartIds.map((id) => CHARTS.find((chart) => chart.id === id)).filter(Boolean),
    [chartIds]
  );

  const loadCoins = useCallback(async () => {
    if (!coinIds.length) {
      setCoins([]);
      return;
    }

    try {
      setLoading(true);
      const rows = await fetchCoinGeckoMarkets({
        ids: coinIds,
        vsCurrency: "usd",
        useCache: false,
      });
      setCoins(rows);
    } finally {
      setLoading(false);
    }
  }, [coinIds]);

  useEffect(() => {
    void loadCoins();
  }, [loadCoins]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{coinIds.length} {t("coins", "Coins")} • {chartIds.length} {t("charts", "Charts")}</Text>
        </View>
      )}
      {!coinIds.length && !chartIds.length ? (
        <View style={{ flex: 1, paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
          <TabHeader
            title={t("Watchlist", "Watchlist")}
            subtitle={`${coinIds.length} ${t("coins", "Coins")} • ${chartIds.length} ${t("charts", "Charts")}`}
            bottomSpacing={8}
          />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("No saved items yet", "Noch keine gespeicherten Eintraege")}</Text>
            <Text style={{ color: colors.subtext, marginTop: 8, textAlign: "center", maxWidth: 300 }}>
              {t("Save coins in the Crypto tab and save charts from the Charts list or chart detail page.", "Speichere Coins im Krypto-Tab und speichere Charts aus der Chartliste oder der Chart-Detailseite.")}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING, paddingBottom: 28 }}
          onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 120)}
          scrollEventThrottle={16}
          data={savedCharts}
          keyExtractor={(item) => `chart-${item!.id}`}
          ListHeaderComponent={
            <View>
              <TabHeader
                title="Watchlist"
                subtitle={`${coinIds.length} coin${coinIds.length === 1 ? "" : "s"} • ${chartIds.length} chart${chartIds.length === 1 ? "" : "s"}`}
                bottomSpacing={8}
              />

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>Saved Coins</Text>
                <Pressable
                  onPress={() => {
                    void loadCoins();
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDF2FF") : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    marginBottom: 8,
                  })}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{t("Refresh", "Aktualisieren")}</Text>
                </Pressable>
              </View>

              {loading ? (
                <View style={{ paddingVertical: 18 }}>
                  <ActivityIndicator color="#8B5CF6" />
                </View>
              ) : (
                <View style={{ gap: 10, marginBottom: 14 }}>
                  {coins.map((coin) => (
                    <Pressable
                      key={coin.id}
                      onPress={() => router.push(`/chart/${coin.symbol.toLowerCase()}_price_usd`)}
                      style={({ pressed }) => ({
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#131523" : "#EDF3FF") : colors.surface,
                        padding: 12,
                      })}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: colors.text, fontWeight: "800" }}>
                          {coin.name} ({coin.symbol.toUpperCase()})
                        </Text>
                        <Pressable
                          onPress={() => toggleCoin(coin.id)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "#5F43B2",
                            backgroundColor: pressed ? (colors.dark ? "#161624" : "#EDE7FF") : (colors.dark ? "#17132A" : "#F3EEFF"),
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                          })}
                        >
                          <Text style={{ color: "#7E5CE6", fontSize: 12, fontWeight: "700" }}>{t("Remove", "Entfernen")}</Text>
                        </Pressable>
                      </View>
                      <Text style={{ color: "#8B5CF6", fontWeight: "900", fontSize: 22, marginTop: 8 }}>
                        {formatMoney(coin.current_price)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={{ color: colors.subtext, marginBottom: 8, fontWeight: "700" }}>{t("Saved Charts", "Gespeicherte Charts")}</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            if (!item) return null;
            return (
              <ChartRow
                title={item.title}
                subtitle={item.description ? `${item.category} • ${item.description}` : item.category}
                onPress={() => router.push(`/chart/${item.id}`)}
                isSaved
                onToggleSave={() => toggleChart(item.id)}
              />
            );
          }}
          ListFooterComponent={
            <View style={{ marginTop: 16 }}>
              {!!coinIds.length && (
                <Pressable
                  onPress={() => {
                    const firstCoin = TRACKED_COINS_BY_ID[coinIds[0]];
                    if (!firstCoin) return;
                    router.push(`/chart/${firstCoin.symbol.toLowerCase()}_price_usd`);
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#171729" : "#EDF2FF") : colors.surface,
                    padding: 12,
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{t("Open first saved coin chart", "Ersten gespeicherten Coin-Chart oeffnen")}</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}
