import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CHARTS, ChartCategory } from "../../src/catalog/charts";
import { FINANCIAL_ASSETS } from "../../src/catalog/financial-assets";
import { searchUniversalAssets, UniversalAsset } from "../../src/data/asset-search";
import { useI18n } from "../../src/i18n/use-i18n";
import { useSettings } from "../../src/state/settings";
import { useWatchlist } from "../../src/state/watchlist";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

const CATEGORY_ORDER: ("All" | ChartCategory)[] = ["All", "Crypto", "Macro", "EU", "Stocks"];
const SECTION_ORDER: ChartCategory[] = ["Crypto", "Macro", "EU", "Stocks"];
type FocusMode = "Mixed" | ChartCategory;
type AssetKindFilter = "all" | "stock" | "etf" | "crypto";

export default function ChartsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { chartIds, isChartSaved, toggleChart } = useWatchlist();
  const colors = useAppColors();
  const { t } = useI18n();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<"All" | ChartCategory>("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("Mixed");
  const [compactHeader, setCompactHeader] = useState(false);
  const [assetQuery, setAssetQuery] = useState("");
  const [assetKind, setAssetKind] = useState<AssetKindFilter>("all");
  const [assetSearchLoading, setAssetSearchLoading] = useState(false);
  const [assetSearchRows, setAssetSearchRows] = useState<UniversalAsset[]>([]);
  const [showLibraryControls, setShowLibraryControls] = useState(false);
  const [showAssetSearch, setShowAssetSearch] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<ChartCategory, boolean>>>({});

  const localAssetRows = useMemo(() => {
    const qLocal = assetQuery.trim().toLowerCase();
    const scoped = FINANCIAL_ASSETS.filter((row) => (assetKind === "all" ? true : row.kind === assetKind));
    const matched = !qLocal
      ? scoped
      : scoped.filter((row) => row.symbol.toLowerCase().includes(qLocal) || row.name.toLowerCase().includes(qLocal));
    return matched.slice(0, 18);
  }, [assetKind, assetQuery]);

  useEffect(() => {
    const qRemote = assetQuery.trim();
    if (qRemote.length < 2) {
      setAssetSearchRows([]);
      setAssetSearchLoading(false);
      return;
    }
    let alive = true;
    setAssetSearchLoading(true);
    const timer = setTimeout(() => {
      void searchUniversalAssets(qRemote, 24)
        .then((rows) => {
          if (!alive) return;
          setAssetSearchRows(rows.filter((row) => (assetKind === "all" ? true : row.kind === assetKind)));
        })
        .catch(() => {
          if (alive) setAssetSearchRows([]);
        })
        .finally(() => {
          if (alive) setAssetSearchLoading(false);
        });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [assetKind, assetQuery]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return CHARTS.filter((c) => {
      const qMatch = !s
        ? true
        : c.title.toLowerCase().includes(s) ||
          c.id.toLowerCase().includes(s) ||
          (c.description ?? "").toLowerCase().includes(s) ||
          c.category.toLowerCase().includes(s);

      const catMatch = category === "All" ? true : c.category === category;
      const watchlistMatch = savedOnly ? chartIds.includes(c.id) : true;

      return qMatch && catMatch && watchlistMatch;
    });
  }, [q, category, savedOnly, chartIds]);

  const grouped = useMemo(() => {
    const sections = focusMode === "Mixed" ? SECTION_ORDER : [focusMode];
    return sections.map((section) => ({
      section,
      rows: filtered.filter((item) => item.category === section),
    })).filter((group) => group.rows.length > 0);
  }, [filtered, focusMode]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 150)}
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
            backgroundColor: colors.dark ? "rgba(14,16,27,0.95)" : "rgba(255,255,255,0.96)",
            paddingHorizontal: 12,
            paddingVertical: 9,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Charts", "Charts")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{filtered.length} {t("results", "Ergebnisse")}</Text>
        </View>
      )}
      <TabHeader title={t("Charts", "Charts")} subtitle={`${filtered.length} ${t("charts", "Charts")} • ${chartIds.length} ${t("saved", "gespeichert")} • ${t("Focus", "Fokus")} ${focusMode}`} />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <LinearGradient
          colors={colors.dark ? ["#1A1334", "#101426", "#0A0B13"] : ["#EDE8FF", "#F3F4FF", "#FAFAFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 14 }}
        >
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>{t("Interactive Chart Library", "Interaktive Chart-Bibliothek")}</Text>
          <Text style={{ color: colors.subtext, marginTop: 5 }}>{t("Browse chart clusters with a cleaner control panel.", "Durchsuche Chart-Cluster mit einem aufgeraeumten Steuerbereich.")}</Text>

          <Pressable
            onPress={() => router.push("/chart/lab")}
            style={({ pressed }) => ({
              marginTop: 10,
              alignSelf: "flex-start",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.dark ? "#3A5A86" : "#BBD0EE",
              backgroundColor: pressed ? (colors.dark ? "#173053" : "#E7F0FF") : (colors.dark ? "#122745" : "#F5F9FF"),
              paddingHorizontal: 12,
              paddingVertical: 8,
            })}
          >
            <Text style={{ color: colors.dark ? "#CFE3FF" : "#355F98", fontWeight: "800", fontSize: 12 }}>{t("Open Chart Lab (Build Any Combination)", "Chart-Lab oeffnen (beliebige Kombination bauen)")}</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowLibraryControls((v) => !v)}
            style={({ pressed }) => ({
              marginTop: 10,
              alignSelf: "flex-start",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "#5F43B2",
              backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
              paddingHorizontal: 12,
              paddingVertical: 8,
            })}
          >
            <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>{showLibraryControls ? t("Hide filters", "Filter ausblenden") : t("Show filters", "Filter anzeigen")}</Text>
          </Pressable>

          {showLibraryControls && <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {(["Mixed", "Crypto", "Macro", "EU", "Stocks"] as const).map((value) => {
              const active = focusMode === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    setFocusMode(value);
                    if (value !== "Mixed") setCategory("All");
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#6D61C8" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#1A1D34" : "#EDF2FF") : active ? (colors.dark ? "#241F45" : "#EEE8FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: active ? "#7D5BE5" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{value}</Text>
                </Pressable>
              );
            })}
          </View>}

          {showLibraryControls && <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {(["Global", "US", "EU"] as const).map((region) => {
              const active = settings.focusRegion === region;
              return (
                <Pressable
                  key={region}
                  onPress={() => update("focusRegion", region)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#6D61C8" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#1A1D34" : "#EDF2FF") : active ? (colors.dark ? "#241F45" : "#EEE8FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: active ? "#7D5BE5" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{region}</Text>
                </Pressable>
              );
            })}
          </View>}
        </LinearGradient>

        {showLibraryControls && <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("Search charts, indicators, regions", "Charts, Indikatoren, Regionen suchen")}
          placeholderTextColor={colors.subtext}
          style={{
            marginTop: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
          }}
        />}

        <View style={{ marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{t("Asset Charts (On-Demand)", "Asset-Charts (On-Demand)")}</Text>
            <Pressable
              onPress={() => setShowAssetSearch((v) => !v)}
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#5F43B2",
                backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                paddingHorizontal: 10,
                paddingVertical: 6,
              })}
            >
              <Text style={{ color: "#B79DFF", fontWeight: "700", fontSize: 12 }}>{showAssetSearch ? t("Hide", "Ausblenden") : t("Open", "Oeffnen")}</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.subtext, marginTop: 3 }}>{t("Search any stock, ETF, or crypto and open a chart instantly.", "Suche jede Aktie, ETF oder Krypto und oeffne sofort einen Chart.")}</Text>

          {showAssetSearch && <TextInput
            value={assetQuery}
            onChangeText={setAssetQuery}
            placeholder={t("Search AAPL, NVDA, BTC, SPY...", "AAPL, NVDA, BTC, SPY suchen...")}
            placeholderTextColor={colors.subtext}
            style={{
              marginTop: 9,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.text,
            }}
          />}

          {showAssetSearch && <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["all", "stock", "etf", "crypto"] as const).map((k) => {
              const active = assetKind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setAssetKind(k)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                    paddingHorizontal: 9,
                    paddingVertical: 6,
                  })}
                >
                  <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{k.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>}

          {!!assetSearchLoading && showAssetSearch && <Text style={{ color: colors.subtext, marginTop: 7 }}>{t("Searching...", "Suche...")}</Text>}

          {showAssetSearch && <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {localAssetRows.map((asset) => (
              <Pressable
                key={`local_${asset.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/chart/custom",
                    params: { symbol: asset.symbol, name: asset.name, kind: asset.kind },
                  })
                }
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#161E2C" : "#EDF3FF") : colors.surface,
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 11 }}>{asset.symbol} ({asset.kind.toUpperCase()})</Text>
              </Pressable>
            ))}
            {assetSearchRows.slice(0, 18).map((asset) => (
              <Pressable
                key={`remote_${asset.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/chart/custom",
                    params: {
                      symbol: asset.symbol,
                      name: asset.name,
                      kind: asset.kind,
                      exchange: asset.exchange ?? "",
                    },
                  })
                }
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#3D6BA3",
                  backgroundColor: pressed ? (colors.dark ? "#163252" : "#E7F1FF") : (colors.dark ? "#10253D" : "#F2F8FF"),
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: colors.dark ? "#CFE3FF" : "#315F98", fontWeight: "700", fontSize: 11 }}>
                  {asset.symbol} ({asset.kind.toUpperCase()})
                </Text>
              </Pressable>
            ))}
          </View>}
        </View>

        {showLibraryControls && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 14 }}>
          {CATEGORY_ORDER.map((cat) => {
            const active = cat === category;
            return (
              <Pressable
                key={cat}
                onPress={() => {
                  setCategory(cat);
                  if (cat !== "All") setFocusMode("Mixed");
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? "#5F43B2" : colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                })}
              >
                <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{cat}</Text>
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
            <Text style={{ color: savedOnly ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>
              {savedOnly ? "Saved only" : "All charts"}
            </Text>
          </Pressable>
        </View>}

        <View style={{ gap: 14 }}>
          {grouped.map(({ section, rows }) => (
            <View key={section}>
              <Pressable
                onPress={() =>
                  setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }))
                }
                style={({ pressed }) => ({
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#5F43B2",
                  backgroundColor: pressed ? (colors.dark ? "#201A3C" : "#E9E0FF") : (colors.dark ? "#17132A" : "#EEE8FF"),
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                })}
              >
                <View>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{section}</Text>
                  <Text style={{ color: colors.subtext, marginTop: 2 }}>{rows.length} charts</Text>
                </View>
                    <Text style={{ color: "#B79DFF", fontWeight: "800" }}>
                  {collapsedSections[section] ? t("Expand", "Ausklappen") : t("Collapse", "Einklappen")}
                </Text>
              </Pressable>

              {!collapsedSections[section] && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {rows.map((item) => {
                  const saved = isChartSaved(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push(`/chart/${item.id}`)}
                      style={({ pressed }) => ({
                        width: "48.5%",
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#141D2A" : "#EDF3FF") : colors.surface,
                        padding: 12,
                        minHeight: 118,
                      })}
                    >
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{item.title}</Text>
                      <Text style={{ color: colors.subtext, marginTop: 6, fontSize: 12 }} numberOfLines={3}>
                        {item.description ?? `${item.category} chart`}
                      </Text>

                      <View style={{ marginTop: "auto", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: colors.dark ? "#7FA8FF" : "#4F78B5", fontWeight: "700", fontSize: 12 }}>{t("Open", "Oeffnen")}</Text>
                        <Pressable
                          onPress={() => toggleChart(item.id)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: saved ? "#654CC2" : colors.border,
                            backgroundColor: pressed ? (colors.dark ? "#161E2C" : "#EDF2FF") : saved ? (colors.dark ? "#21193D" : "#EFE9FF") : colors.surface,
                            paddingHorizontal: 9,
                            paddingVertical: 5,
                          })}
                        >
                          <Text style={{ color: saved ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 11 }}>
                            {saved ? t("Saved", "Gespeichert") : t("Save", "Speichern")}
                          </Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
              </View>}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
