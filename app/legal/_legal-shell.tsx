import type { ReactNode } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SCREEN_HORIZONTAL_PADDING } from "@/src/ui/tab-header";
import { useAppColors } from "@/src/ui/use-app-colors";

function Card(props: { title: string; children: ReactNode }) {
  const colors = useAppColors();
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 12,
        paddingVertical: 11,
        gap: 8,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{props.title}</Text>
      {props.children}
    </View>
  );
}

export function LegalParagraph(props: { children: string }) {
  const colors = useAppColors();
  return <Text style={{ color: colors.subtext, lineHeight: 21 }}>{props.children}</Text>;
}

export function LegalBullet(props: { children: string }) {
  const colors = useAppColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Text style={{ color: colors.accent, marginTop: 2 }}>•</Text>
      <Text style={{ color: colors.subtext, flex: 1, lineHeight: 21 }}>{props.children}</Text>
    </View>
  );
}

export function LegalShell(props: { title: string; subtitle: string; children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 10,
        paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
        paddingBottom: 120,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 24 }}>{props.title}</Text>
          <Text style={{ color: colors.subtext, marginTop: 2 }}>{props.subtitle}</Text>
        </View>
      </View>
      {props.children}
    </ScrollView>
  );
}

export function LegalCard(props: { title: string; children: ReactNode }) {
  return <Card title={props.title}>{props.children}</Card>;
}

// Non-routable helper file kept under app/ for shared legal screen UI.
export default function LegalShellHelperRoutePlaceholder() {
  return null;
}
