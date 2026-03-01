import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchNewsByCategory, NewsArticle, NewsCategory } from "../../src/data/news";
import { useI18n } from "../../src/i18n/use-i18n";
import { translateRuntimeText } from "../../src/i18n/runtime-translation";
import { useNewsStore } from "../../src/state/news";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

type LocalizedSnippet = {
  sourceTitle: string;
  sourceSummary: string;
  title: string;
  summary: string;
};

type RegionFocus = "all" | "us" | "eu";

const US_REGION_HINTS = [
  " united states",
  " us ",
  " usa",
  "u.s.",
  "federal reserve",
  "fed ",
  "treasury",
  "wall street",
  "dow",
  "nasdaq",
  "s&p 500",
  "nyse",
  "washington",
  "new york",
];

const EU_REGION_HINTS = [
  " european",
  " eurozone",
  " eu ",
  "e.u.",
  "ecb",
  "brussels",
  "bund",
  "dax",
  "stoxx",
  "france",
  "germany",
  "italy",
  "spain",
  "netherlands",
  "euro ",
  "eur ",
];

function matchesRegion(row: NewsArticle, focus: RegionFocus): boolean {
  if (focus === "all") return true;
  const text = `${row.title} ${row.summary} ${row.source} ${row.link}`.toLowerCase();
  if (focus === "us") return US_REGION_HINTS.some((hint) => text.includes(hint));
  return EU_REGION_HINTS.some((hint) => text.includes(hint));
}

export default function NewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { saveMany } = useNewsStore();
  const { t, language } = useI18n();
  const isFocused = useIsFocused();
  const categories: { id: NewsCategory; label: string }[] = [
    { id: "global", label: t("Global", "Global") },
    { id: "stocks", label: t("Stocks", "Aktien") },
    { id: "macro", label: t("Macro", "Makro") },
    { id: "crypto", label: t("Crypto", "Krypto") },
  ];

  const [category, setCategory] = useState<NewsCategory>("global");
  const [rows, setRows] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [ageFilter, setAgeFilter] = useState<"all" | "24h" | "7d">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [regionFocus, setRegionFocus] = useState<RegionFocus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [localizedSnippets, setLocalizedSnippets] = useState<Record<string, LocalizedSnippet>>({});
  const localizedRef = useRef<Record<string, LocalizedSnippet>>({});
  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });

  const run = useCallback(async (opts?: { force?: boolean }) => {
    setLoading(true);
    try {
      const items = await fetchNewsByCategory(category, opts);
      setRows(items);
      saveMany(items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [category, saveMany]);

  useEffect(() => {
    if (!isFocused) return;
    void run();
    const timer = setInterval(() => {
      void run();
    }, 60_000);

    return () => {
      clearInterval(timer);
    };
  }, [isFocused, run]);

  const onManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await run({ force: true });
    } finally {
      setManualRefreshing(false);
    }
  }, [run]);

  useEffect(() => {
    setSourceFilter("all");
  }, [category]);

  useEffect(() => {
    setRegionFocus("all");
  }, [category]);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (ageFilter === "all") return true;
      const ts = new Date(row.pubDate).getTime();
      if (!Number.isFinite(ts)) return true;
      const delta = now - ts;
      if (ageFilter === "24h") return delta <= 24 * 60 * 60 * 1000;
      return delta <= 7 * 24 * 60 * 60 * 1000;
    })
      .filter((row) => (sourceFilter === "all" ? true : row.source === sourceFilter))
      .filter((row) => matchesRegion(row, regionFocus))
      .filter((row) => {
        if (!q) return true;
        const title = row.title.toLowerCase();
        const summary = row.summary.toLowerCase();
        const source = row.source.toLowerCase();
        return title.includes(q) || summary.includes(q) || source.includes(q);
      });
  }, [rows, ageFilter, regionFocus, searchQuery, sourceFilter]);

  const regionCounts = useMemo(() => {
    const us = rows.filter((row) => matchesRegion(row, "us")).length;
    const eu = rows.filter((row) => matchesRegion(row, "eu")).length;
    return { us, eu };
  }, [rows]);

  const topSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([source]) => source);
  }, [rows]);

  useEffect(() => {
    if (sourceFilter === "all") return;
    if (!topSources.includes(sourceFilter)) setSourceFilter("all");
  }, [topSources, sourceFilter]);

  const hero = useMemo(() => filteredRows[0], [filteredRows]);

  useEffect(() => {
    localizedRef.current = localizedSnippets;
  }, [localizedSnippets]);

  useEffect(() => {
    let active = true;
    if (language === "en") {
      setLocalizedSnippets({});
      return () => {
        active = false;
      };
    }

    const targetRows = filteredRows.slice(0, 45);
    const runTranslation = async () => {
      const updates: Record<string, LocalizedSnippet> = {};
      for (const row of targetRows) {
        const cached = localizedRef.current[row.id];
        if (cached && cached.sourceTitle === row.title && cached.sourceSummary === row.summary) continue;

        const [title, summary] = await Promise.all([
          translateRuntimeText(row.title, language, { sourceLanguage: "auto", chunkSize: 600 }),
          translateRuntimeText(row.summary, language, { sourceLanguage: "auto", chunkSize: 700 }),
        ]);
        if (!active) return;
        updates[row.id] = {
          sourceTitle: row.title,
          sourceSummary: row.summary,
          title,
          summary,
        };
      }
      if (!active || !Object.keys(updates).length) return;
      setLocalizedSnippets((prev) => ({ ...prev, ...updates }));
    };

    void runTranslation();
    return () => {
      active = false;
    };
  }, [filteredRows, language]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 140)}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={() => {
            void onManualRefresh();
          }}
          {...refreshControlProps(colors, t("Refreshing news feed...", "News-Feed wird aktualisiert..."))}
        />
      }
    >
      <RefreshFeedback refreshing={manualRefreshing} colors={colors} label={t("Refreshing headlines...", "Schlagzeilen werden aktualisiert...")} />
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
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("News Feed", "News-Feed")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{filteredRows.length} {t("headlines", "Schlagzeilen")}</Text>
        </View>
      )}

      <TabHeader title={t("News Feed", "News-Feed")} subtitle={t("Live headlines by category. Open any headline for full article view.", "Live-Schlagzeilen nach Kategorie. Oeffne eine Schlagzeile fuer die komplette Artikelansicht.")} />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {categories.map((cat) => {
            const active = category === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCategory(cat.id)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? "#5F43B2" : colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {(["all", ...topSources] as const).map((source) => {
            const active = sourceFilter === source;
            return (
              <Pressable
                key={source}
                onPress={() => setSourceFilter(source)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? "#5F43B2" : colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>
                  {source === "all" ? t("All sources", "Alle Quellen") : source.replace("r/", "")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {([
            ["24h", "24h"],
            ["7d", "7d"],
            ["all", t("All", "Alle")],
          ] as const).map(([value, label]) => {
            const active = ageFilter === value;
            return (
              <Pressable
                key={value}
                onPress={() => setAgeFilter(value)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? "#5F43B2" : colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <Pressable
            onPress={() => setRegionFocus("all")}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: regionFocus === "all" ? colors.accentBorder : colors.border,
              backgroundColor: pressed ? colors.accentSoft : regionFocus === "all" ? colors.accentSoft : colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 9,
            })}
          >
            <Text style={{ color: regionFocus === "all" ? colors.accent : colors.text, fontWeight: "800", fontSize: 12 }}>
              {t("All Regions", "Alle Regionen")} • {rows.length}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setRegionFocus("us")}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: regionFocus === "us" ? colors.accentBorder : colors.border,
              backgroundColor: pressed ? colors.accentSoft : regionFocus === "us" ? colors.accentSoft : colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 9,
            })}
          >
            <Text style={{ color: regionFocus === "us" ? colors.accent : colors.text, fontWeight: "800", fontSize: 12 }}>
              {t("US Focus", "US Fokus")} • {regionCounts.us}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setRegionFocus("eu")}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: regionFocus === "eu" ? colors.accentBorder : colors.border,
              backgroundColor: pressed ? colors.accentSoft : regionFocus === "eu" ? colors.accentSoft : colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 9,
            })}
          >
            <Text style={{ color: regionFocus === "eu" ? colors.accent : colors.text, fontWeight: "800", fontSize: 12 }}>
              {t("EU Focus", "EU Fokus")} • {regionCounts.eu}
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 10,
          }}
        >
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("Search headlines, source, or topic", "Schlagzeilen, Quelle oder Thema suchen")}
            placeholderTextColor={colors.subtext}
            style={{ color: colors.text, fontWeight: "600" }}
          />
        </View>

        {!!hero && (
          <Pressable
            onPress={() => router.push(`/news/${encodeURIComponent(hero.id)}`)}
            style={({ pressed }) => ({
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? (colors.dark ? "#141B2A" : "#EDF3FF") : colors.surface,
              padding: 12,
              marginBottom: 10,
            })}
          >
            {!!hero.images[0] && (
              <Image
                source={{ uri: hero.images[0] }}
                style={{ width: "100%", height: 170, borderRadius: 10, marginBottom: 8 }}
                resizeMode="cover"
              />
            )}
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17 }}>
              {localizedSnippets[hero.id]?.title ?? hero.title}
            </Text>
            <Text style={{ color: colors.subtext, marginTop: 6 }}>
              {localizedSnippets[hero.id]?.summary ?? hero.summary}
            </Text>
            <Text style={{ color: colors.subtext, marginTop: 6, fontSize: 12 }}>{hero.source}</Text>
          </Pressable>
        )}

        <View style={{ gap: 8 }}>
          {filteredRows.slice(1).map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/news/${encodeURIComponent(item.id)}`)}
              style={({ pressed }) => ({
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? (colors.dark ? "#141B2A" : "#EDF3FF") : colors.surface,
                padding: 11,
              })}
            >
              {!!item.images[0] ? (
                <Image
                  source={{ uri: item.images[0] }}
                  style={{ width: "100%", height: 120, borderRadius: 10, marginBottom: 8 }}
                  resizeMode="cover"
                />
              ) : null}

              <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={2}>
                {localizedSnippets[item.id]?.title ?? item.title}
              </Text>
              <Text style={{ color: colors.subtext, marginTop: 5 }} numberOfLines={2}>
                {localizedSnippets[item.id]?.summary ?? item.summary}
              </Text>
              <Text style={{ color: colors.subtext, marginTop: 5, fontSize: 12 }}>{item.source} • {item.pubDate ? new Date(item.pubDate).toLocaleString(language) : t("latest", "aktuell")}</Text>
            </Pressable>
          ))}
          {loading && <Text style={{ color: colors.subtext }}>{t("Loading feed...", "Feed wird geladen...")}</Text>}
          {!loading && !filteredRows.length && <Text style={{ color: colors.subtext }}>{t("No headlines available for this filter right now.", "Keine Schlagzeilen fuer diesen Filter verfuegbar.")}</Text>}
        </View>
      </View>
    </ScrollView>
  );
}
