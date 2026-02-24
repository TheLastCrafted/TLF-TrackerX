import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TradingViewChart } from "../../src/ui/TradingViewChart";
import { useSettings } from "../../src/state/settings";
import { useAppColors } from "../../src/ui/use-app-colors";

function resolveTradingViewSymbol(args: { symbol: string; kind: string; exchange?: string; currency: "USD" | "EUR" }): string {
  const raw = args.symbol.trim().toUpperCase();
  if (!raw) return "";

  if (args.kind === "crypto") {
    return `BINANCE:${raw}${args.currency === "EUR" ? "EUR" : "USDT"}`;
  }

  const ex = (args.exchange ?? "").toUpperCase();
  if (ex.includes("NASDAQ")) return `NASDAQ:${raw}`;
  if (ex.includes("NYSE")) return `NYSE:${raw}`;
  if (ex.includes("ARCA") || ex.includes("AMEX")) return `AMEX:${raw}`;
  return raw;
}

export default function CustomChartScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const colors = useAppColors();

  const symbol = String(params.symbol ?? "");
  const name = String(params.name ?? symbol ?? "Custom Asset");
  const kind = String(params.kind ?? "stock").toLowerCase();
  const exchange = String(params.exchange ?? "");

  const tvSymbol = useMemo(
    () => resolveTradingViewSymbol({ symbol, kind, exchange, currency: settings.currency }),
    [symbol, kind, exchange, settings.currency]
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 14 }}>
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900" }}>{name}</Text>
          <Text style={{ color: colors.subtext, marginTop: 6 }}>
            {symbol.toUpperCase()} • {kind.toUpperCase()} • {exchange || "Global"}
          </Text>
          <Text style={{ color: colors.subtext, marginTop: 3 }}>
            Generated instantly from your search request.
          </Text>
        </View>

        {!tvSymbol ? (
          <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: "#6B3C46", backgroundColor: colors.dark ? "#2A171B" : "#FFEFF3", padding: 12 }}>
            <Text style={{ color: colors.dark ? "#FFC0CC" : "#A03D50", fontWeight: "700" }}>
              No TradingView symbol could be resolved for this asset.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <TradingViewChart
              symbol={tvSymbol}
              interval={settings.chartInterval}
              locale={settings.language}
              theme={settings.chartTheme}
              showVolume={settings.showVolumeOnProChart}
              showIndicators={settings.showIndicatorsOnProChart}
            />
          </View>
        )}

        <View
          style={{
            marginTop: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 12,
            paddingVertical: 8,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: colors.subtext, fontWeight: "700" }}>Symbol: {tvSymbol || "-"}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
