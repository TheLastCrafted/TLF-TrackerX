import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { translateRuntimeText } from "../../src/i18n/runtime-translation";
import { useNewsStore } from "../../src/state/news";
import { useI18n } from "../../src/i18n/use-i18n";
import { useAppColors } from "../../src/ui/use-app-colors";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function imageCanonicalKey(url: string): string {
  const clean = String(url || "").trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return clean.toLowerCase();
  }
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
  const uniqueImages = useMemo(() => {
    const list = article?.images ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of list) {
      const key = imageCanonicalKey(url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
    return out;
  }, [article]);
  const [translatedTitle, setTranslatedTitle] = useState("");
  const [translatedBody, setTranslatedBody] = useState("");

  useEffect(() => {
    let active = true;
    const title = article?.title ?? "";
    const rawBody = body || article?.summary || "";
    if (!title && !rawBody) {
      setTranslatedTitle("");
      setTranslatedBody("");
      return () => {
        active = false;
      };
    }

    if (language === "en") {
      setTranslatedTitle(title);
      setTranslatedBody(rawBody);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      const [nextTitle, nextBody] = await Promise.all([
        translateRuntimeText(title, language, { sourceLanguage: "auto", chunkSize: 550 }),
        translateRuntimeText(rawBody, language, { sourceLanguage: "auto", chunkSize: 800 }),
      ]);
      if (!active) return;
      setTranslatedTitle(nextTitle || title);
      setTranslatedBody(nextBody || rawBody);
    };
    void run();

    return () => {
      active = false;
    };
  }, [article, body, language]);

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
      <Text style={{ color: colors.text, fontSize: 25, fontWeight: "900" }}>
        {translatedTitle || article.title}
      </Text>
      <Text style={{ color: colors.subtext, marginTop: 6 }}>
        {article.source} • {article.pubDate ? new Date(article.pubDate).toLocaleString(language) : t("latest", "aktuell")}
      </Text>

      {!!uniqueImages.length && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {uniqueImages.map((url) => (
            <Image key={url} source={{ uri: url }} style={{ width: "100%", height: 210, borderRadius: 12 }} resizeMode="cover" />
          ))}
        </View>
      )}

      <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
        <Text style={{ color: colors.text, lineHeight: 21 }}>
          {translatedBody || body || article.summary}
        </Text>
      </View>

      {Platform.OS === "web" ? (
        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <Text style={{ color: colors.subtext, marginBottom: 8 }}>
            {t(
              "Full article preview on web may be blocked by publisher policies. Use open article to view directly.",
              "Die Vollansicht kann im Web durch Publisher-Richtlinien blockiert sein. Oeffne den Artikel direkt."
            )}
          </Text>
          <Pressable
            onPress={() => {
              void Linking.openURL(article.link);
            }}
            style={({ pressed }) => ({
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.accentBorder,
              backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignSelf: "flex-start",
            })}
          >
            <Text style={{ color: colors.accent, fontWeight: "800" }}>
              {t("Open full article", "Vollstaendigen Artikel oeffnen")}
            </Text>
          </Pressable>
          <View style={{ marginTop: 10, height: 560, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
            {/* Web fallback iframe for publishers that allow embedding */}
            <iframe
              src={article.link}
              title={article.title}
              style={{ width: "100%", height: "100%", border: "none" }}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </View>
        </View>
      ) : (
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const NativeWebView = require("react-native-webview").WebView as any;
          return (
            <View style={{ marginTop: 10, height: 1100, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              <NativeWebView source={{ uri: article.link }} startInLoadingState />
            </View>
          );
        })()
      )}
    </ScrollView>
  );
}
