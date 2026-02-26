import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { FINANCIAL_ASSETS, FinancialAsset, FinancialAssetKind } from "../../src/catalog/financial-assets";
import { useI18n } from "../../src/i18n/use-i18n";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function parseNum(v: string): number {
  const n = Number(v.replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

type Betas = {
  cpi: number;
  fed: number;
  yld: number;
  liq: number;
  cap: number;
};

const DEFAULT_SCENARIO_ASSET_SYMBOLS = ["SPY", "QQQ", "BTC", "ETH", "GLD", "DXY", "AAPL", "NVDA", "TLT", "XLE"];

const ASSET_BETAS: Record<string, Betas> = {
  SPY: { cpi: -1.4, fed: -1.2, yld: -0.9, liq: 0.8, cap: 14 },
  QQQ: { cpi: -1.8, fed: -1.4, yld: -1.2, liq: 1.1, cap: 18 },
  BTC: { cpi: -2.0, fed: -1.8, yld: -1.4, liq: 1.7, cap: 25 },
  ETH: { cpi: -2.1, fed: -1.9, yld: -1.5, liq: 1.8, cap: 28 },
  GLD: { cpi: 0.8, fed: -0.4, yld: -0.3, liq: 0.2, cap: 10 },
  DXY: { cpi: 0.7, fed: 0.8, yld: 0.6, liq: -0.5, cap: 8 },
  AAPL: { cpi: -1.6, fed: -1.3, yld: -1.0, liq: 0.9, cap: 17 },
  NVDA: { cpi: -2.0, fed: -1.6, yld: -1.4, liq: 1.3, cap: 24 },
  TLT: { cpi: -0.5, fed: -0.9, yld: -1.6, liq: 0.5, cap: 14 },
  XLE: { cpi: 0.9, fed: -0.2, yld: -0.2, liq: 0.3, cap: 16 },
};

function fallbackBetas(kind: FinancialAssetKind): Betas {
  if (kind === "crypto") return { cpi: -1.9, fed: -1.7, yld: -1.3, liq: 1.6, cap: 26 };
  if (kind === "etf") return { cpi: -1.3, fed: -1.0, yld: -0.9, liq: 0.7, cap: 15 };
  return { cpi: -1.4, fed: -1.2, yld: -1.0, liq: 0.8, cap: 16 };
}

function estimateReaction(asset: FinancialAsset, cpi: number, fed: number, yld: number, liq: number): number {
  const symbol = asset.symbol.toUpperCase();
  const betas = ASSET_BETAS[symbol] ?? fallbackBetas(asset.kind);
  const raw = -(cpi * betas.cpi) - (fed / 100) * betas.fed - (yld / 100) * betas.yld + liq * betas.liq;
  return clamp(raw, -betas.cap, betas.cap);
}

export default function ScenarioScreen() {
  const colors = useAppColors();
  const { t } = useI18n();
  const [cpiShock, setCpiShock] = useState("0.5");
  const [fedShock, setFedShock] = useState("25");
  const [yieldShock, setYieldShock] = useState("35");
  const [liquidityShock, setLiquidityShock] = useState("-3.0");
  const [assetQuery, setAssetQuery] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<string[]>(() => {
    const ids = DEFAULT_SCENARIO_ASSET_SYMBOLS
      .map((symbol) => FINANCIAL_ASSETS.find((row) => row.symbol.toUpperCase() === symbol)?.id)
      .filter((id): id is string => Boolean(id));
    return ids.slice(0, 10);
  });

  const selectedAssetRows = useMemo(
    () => selectedAssets.map((id) => FINANCIAL_ASSETS.find((row) => row.id === id)).filter((row): row is FinancialAsset => Boolean(row)),
    [selectedAssets]
  );

  const model = useMemo(() => {
    const cpi = parseNum(cpiShock);
    const fed = parseNum(fedShock);
    const yld = parseNum(yieldShock);
    const liq = parseNum(liquidityShock);

    const riskBand = clamp(50 + cpi * 6 + (fed / 25) * 5 + (yld / 25) * 4 - liq * 3, 10, 95);

    const analog = riskBand >= 75 ? "2022 tightening impulse" : riskBand <= 35 ? "2019 liquidity rebound" : "2023 range-compression regime";
    const reactions = selectedAssetRows
      .map((asset) => ({
        id: asset.id,
        symbol: asset.symbol.toUpperCase(),
        name: asset.name,
        reaction: estimateReaction(asset, cpi, fed, yld, liq),
      }))
      .sort((a, b) => Math.abs(b.reaction) - Math.abs(a.reaction));
    return { riskBand, analog, reactions };
  }, [cpiShock, fedShock, yieldShock, liquidityShock, selectedAssetRows]);

  const searchResults = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return FINANCIAL_ASSETS.filter((asset) => !selectedAssets.includes(asset.id))
      .filter((asset) => asset.symbol.toLowerCase().includes(q) || asset.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [assetQuery, selectedAssets]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 118 }}>
      <TabHeader
        title={t("Scenario", "Szenario")}
        subtitle={t("Shock simulator with analog mapping and cross-asset reaction ranges.", "Schock-Simulator mit Analog-Mapping und Cross-Asset-Reaktionsspannen.")}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING, gap: 10 }}>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 8 }}>Input Shocks</Text>
          {[
            { label: "CPI surprise (pp)", value: cpiShock, set: setCpiShock },
            { label: "Fed move (bps)", value: fedShock, set: setFedShock },
            { label: "10Y yield spike (bps)", value: yieldShock, set: setYieldShock },
            { label: "Liquidity shift (%)", value: liquidityShock, set: setLiquidityShock },
          ].map((row) => (
            <View key={row.label} style={{ marginBottom: 8 }}>
              <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 4 }}>{row.label}</Text>
              <TextInput
                value={row.value}
                onChangeText={row.set}
                keyboardType="decimal-pad"
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceAlt,
                  color: colors.text,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              />
            </View>
          ))}
        </View>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 6 }}>Asset Universe</Text>
          <Text style={{ color: colors.subtext, marginBottom: 8, fontSize: 12 }}>
            {selectedAssetRows.length} assets selected
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {selectedAssetRows.map((asset) => (
              <Pressable
                key={asset.id}
                onPress={() => setSelectedAssets((prev) => prev.filter((id) => id !== asset.id))}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
                  {asset.symbol.toUpperCase()} ×
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={assetQuery}
            onChangeText={setAssetQuery}
            placeholder={t("Search assets to add (e.g. AAPL, BTC, QQQ)", "Assets zum Hinzufuegen suchen (z.B. AAPL, BTC, QQQ)")}
            placeholderTextColor={colors.subtext}
            style={{
              marginTop: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          />
          {!!searchResults.length && (
            <View style={{ marginTop: 8, gap: 6 }}>
              {searchResults.map((asset) => (
                <Pressable
                  key={asset.id}
                  onPress={() => {
                    setSelectedAssets((prev) => (prev.includes(asset.id) || prev.length >= 30 ? prev : [...prev, asset.id]));
                    setAssetQuery("");
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{asset.symbol.toUpperCase()}</Text>
                  <Text style={{ color: colors.subtext, flex: 1, marginLeft: 8 }} numberOfLines={1}>
                    {asset.name}
                  </Text>
                  <Text style={{ color: colors.accent, fontWeight: "800" }}>Add</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 6 }}>Estimated Asset Reactions</Text>
          {model.reactions.map((row) => (
            <View key={row.id} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ color: colors.subtext }}>{row.symbol} • {row.name}</Text>
              <Text style={{ color: row.reaction >= 0 ? colors.positive : colors.negative, fontWeight: "800" }}>{row.reaction.toFixed(2)}%</Text>
            </View>
          ))}
        </View>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>Historical Analog Period</Text>
          <Text style={{ color: colors.text, fontWeight: "900", marginTop: 4 }}>{model.analog}</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>Risk distribution percentile: {model.riskBand.toFixed(0)} / 100</Text>
        </View>

        <Pressable
          style={({ pressed }) => ({
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
            paddingVertical: 10,
            alignItems: "center",
          })}
        >
          <Text style={{ color: colors.accent, fontWeight: "800" }}>Save Scenario Snapshot (next phase)</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
