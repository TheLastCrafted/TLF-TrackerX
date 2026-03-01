import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getRouteAccessPolicy } from "../config/subscription";
import { useI18n } from "../i18n/use-i18n";
import { SCREEN_HORIZONTAL_PADDING } from "./tab-header";
import { useAppColors } from "./use-app-colors";

export function SubscriptionLockedScreen(props: { route: string; title?: string }) {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const router = useRouter();
  const { t } = useI18n();
  const policy = getRouteAccessPolicy(props.route);
  const title = props.title ?? policy?.label ?? "Feature";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: SCREEN_HORIZONTAL_PADDING, paddingTop: insets.top + 16, paddingBottom: 110 }}>
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MaterialIcons name="lock" size={20} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 20 }}>
            {title} {t("is Premium", "ist Premium")}
          </Text>
        </View>
        <Text style={{ color: colors.subtext, marginTop: 8, lineHeight: 20 }}>
          {policy?.note
            ? policy.note
            : t(
                "This module is currently available in the Premium plan.",
                "Dieses Modul ist aktuell im Premium-Plan verfuegbar."
              )}
        </Text>
        <Text style={{ color: colors.subtext, marginTop: 6, lineHeight: 20 }}>
          {t(
            "Open Account to review plan access and unlock this feature once billing is fully connected.",
            "Oeffne Konto, um den Plan-Zugang zu sehen und dieses Feature freizuschalten, sobald Billing voll verbunden ist."
          )}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={() => router.push("/account")}
            style={({ pressed }) => ({
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.accentBorder,
              backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
              paddingHorizontal: 12,
              paddingVertical: 9,
            })}
          >
            <Text style={{ color: colors.accent, fontWeight: "800" }}>{t("Open Account", "Konto oeffnen")}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            style={({ pressed }) => ({
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
              paddingHorizontal: 12,
              paddingVertical: 9,
            })}
          >
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Open Settings", "Einstellungen")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

