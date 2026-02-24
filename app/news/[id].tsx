import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useNewsStore } from "../../src/state/news";
import { useI18n } from "../../src/i18n/use-i18n";
import { useAppColors } from "../../src/ui/use-app-colors";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default function NewsDetailScreen() {
  const params = useLocalSearchParams();
  const id = decodeURIComponent(String(params.id ?? ""));
  const { getById } = useNewsStore();
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();

  const article = getById(id);
  const body = useMemo(() => stripHtml(article?.contentHtml ?? article?.summary ?? ""), [article]);

  if (!article) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 14, paddingHorizontal: 14 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>{t("Article not found", "Artikel nicht gefunden")}</Text>
        <Text style={{ color: colors.subtext, marginTop: 8 }}>{t("Open the headline again from the News tab.", "Oeffne die Schlagzeile erneut aus dem News-Tab.")}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 14, paddingTop: insets.top + 10, paddingBottom: 24 }}>
      <Text style={{ color: colors.text, fontSize: 25, fontWeight: "900" }}>{article.title}</Text>
      <Text style={{ color: colors.subtext, marginTop: 6 }}>
        {article.source} • {article.pubDate ? new Date(article.pubDate).toLocaleString(language) : t("latest", "aktuell")}
      </Text>

      {!!article.images.length && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {article.images.map((url) => (
            <Image key={url} source={{ uri: url }} style={{ width: "100%", height: 210, borderRadius: 12 }} resizeMode="cover" />
          ))}
        </View>
      )}

      <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
        <Text style={{ color: colors.text, lineHeight: 21 }}>{body || article.summary}</Text>
      </View>

      <View style={{ marginTop: 10, height: 1100, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        <WebView source={{ uri: article.link }} startInLoadingState />
      </View>
    </ScrollView>
  );
}
