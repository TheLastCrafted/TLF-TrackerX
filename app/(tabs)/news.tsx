import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchNewsByCategory, NewsArticle, NewsCategory } from "../../src/data/news";
import { useI18n } from "../../src/i18n/use-i18n";
import { useNewsStore } from "../../src/state/news";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

export default function NewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { saveMany } = useNewsStore();
  const { t, language } = useI18n();
  const categories: { id: NewsCategory; label: string }[] = [
    { id: "global", label: t("Global", "Global") },
    { id: "stocks", label: t("Stocks", "Aktien") },
    { id: "macro", label: t("Macro", "Makro") },
    { id: "crypto", label: t("Crypto", "Krypto") },
  ];

  const [category, setCategory] = useState<NewsCategory>("global");
  const [rows, setRows] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [ageFilter, setAgeFilter] = useState<"all" | "24h" | "7d">("24h");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        const items = await fetchNewsByCategory(category);
        if (!alive) return;
        setRows(items);
        saveMany(items);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    const timer = setInterval(() => {
      void run();
    }, 60_000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [category, saveMany]);

  useEffect(() => {
    setSourceFilter("all");
  }, [category]);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    return rows.filter((row) => {
      if (ageFilter === "all") return true;
      const ts = new Date(row.pubDate).getTime();
      if (!Number.isFinite(ts)) return true;
      const delta = now - ts;
      if (ageFilter === "24h") return delta <= 24 * 60 * 60 * 1000;
      return delta <= 7 * 24 * 60 * 60 * 1000;
    }).filter((row) => (sourceFilter === "all" ? true : row.source === sourceFilter));
  }, [rows, ageFilter, sourceFilter]);

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 140)}
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
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17 }}>{hero.title}</Text>
            <Text style={{ color: colors.subtext, marginTop: 6 }}>{hero.summary}</Text>
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

              <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={2}>{item.title}</Text>
              <Text style={{ color: colors.subtext, marginTop: 5 }} numberOfLines={2}>{item.summary}</Text>
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
