import { useMemo } from "react";
import { Image, Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CHARTS } from "../../src/catalog/charts";
import { getResearchMaterialById, getResearchTopicCharts } from "../../src/data/research-materials";
import { ActionButton } from "../../src/ui/action-button";
import { HapticPressable as Pressable } from "../../src/ui/haptic-pressable";
import { useAppColors } from "../../src/ui/use-app-colors";

export default function ResearchMaterialDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();

  const id = String(params.id ?? "");
  const material = useMemo(() => getResearchMaterialById(id), [id]);
  const charts = useMemo(() => {
    if (!material) return [];
    const ids = getResearchTopicCharts(material.topic);
    return ids.map((cid) => CHARTS.find((c) => c.id === cid)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [material]);

  if (!material) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12, paddingHorizontal: 14 }}>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 20 }}>Explainer not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: 24 }}>
      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 24 }}>{material.title}</Text>
      <Text style={{ color: colors.subtext, marginTop: 6 }}>{material.source}</Text>

      {!!material.imageUrl && (
        <Image source={{ uri: material.imageUrl }} resizeMode="cover" style={{ width: "100%", height: 180, borderRadius: 12, marginTop: 10 }} />
      )}

      <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>Why it matters</Text>
        <Text style={{ color: colors.subtext, marginTop: 5 }}>{material.why}</Text>
      </View>

      <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>Explainer</Text>
        <Text style={{ color: colors.subtext, marginTop: 5, lineHeight: 20 }}>{material.explainer}</Text>
      </View>

      {!!charts.length && (
        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Related Charts</Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {charts.map((chart) => (
              <Pressable
                key={chart.id}
                onPress={() => router.push(`/chart/${chart.id}`)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151B28" : "#EAF0FF") : colors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{chart.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <ActionButton
        label="Open Source"
        onPress={() => {
          void Linking.openURL(material.url);
        }}
        style={{ marginTop: 12, alignSelf: "flex-start" }}
      />
    </ScrollView>
  );
}
