import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useI18n } from "../src/i18n/use-i18n";
import { useSettings } from "../src/state/settings";
import { useAppColors } from "../src/ui/use-app-colors";

function SectionCard(props: { title: string; subtitle?: string; children?: ReactNode }) {
  const colors = useAppColors();
  return (
    <View
      style={{
        marginTop: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 12,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{props.title}</Text>
      {!!props.subtitle && <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 3 }}>{props.subtitle}</Text>}
      {props.children}
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useAppColors();
  const { settings } = useSettings();
  const { t } = useI18n();

  const syncEnabled = settings.syncAcrossDevices;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 14,
          paddingBottom: Math.max(24, insets.bottom + 24),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.accentBorder,
              backgroundColor: colors.accentSoft,
              paddingHorizontal: 11,
              paddingVertical: 7,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MaterialIcons name="person-outline" size={18} color={colors.accent} />
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>{t("Account", "Konto")}</Text>
          </View>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceAlt : colors.surfaceElevated,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <MaterialIcons name="close" size={17} color={colors.text} />
          </Pressable>
        </View>

        <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>
          {t(
            "Profile, sync, and subscription controls live here.",
            "Profil-, Sync- und Abo-Steuerung befindet sich hier."
          )}
        </Text>

        <SectionCard
          title={t("Profile", "Profil")}
          subtitle={t("Use email sign-in later for cross-device sync.", "Spaeter E-Mail-Login fuer Geraete-Sync nutzen.")}
        >
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Account status", "Kontostatus")}</Text>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Guest", "Gast")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Cloud sync", "Cloud-Sync")}</Text>
              <Text style={{ color: syncEnabled ? "#4DD9A9" : "#F3C47A", fontWeight: "700", fontSize: 12 }}>
                {syncEnabled ? t("Enabled", "Aktiv") : t("Not enabled", "Nicht aktiv")}
              </Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard
          title={t("Subscription", "Abonnement")}
          subtitle={t(
            "Billing controls can be connected once App Store / Play Store release is ready.",
            "Abrechnungsfunktionen koennen verbunden werden, sobald App Store / Play Store bereit sind."
          )}
        >
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Plan", "Plan")}</Text>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Free", "Kostenlos")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Renewal", "Verlaengerung")}</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>-</Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard
          title={t("Shortcuts", "Schnellzugriffe")}
          subtitle={t("Open settings or command center directly.", "Einstellungen oder Command Center direkt oeffnen.")}
        >
          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => router.replace("/(tabs)/settings")}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                paddingVertical: 10,
                alignItems: "center",
              })}
            >
              <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}>
                {t("Open Settings", "Einstellungen")}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
                paddingVertical: 10,
                alignItems: "center",
              })}
            >
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>
                {t("Back to App", "Zur App")}
              </Text>
            </Pressable>
          </View>
        </SectionCard>
      </ScrollView>
    </View>
  );
}
