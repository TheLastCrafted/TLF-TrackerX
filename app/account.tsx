import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROUTE_ACCESS_POLICY } from "../src/config/subscription";
import { useI18n } from "../src/i18n/use-i18n";
import { useAccountState } from "../src/state/account";
import { useSettings } from "../src/state/settings";
import { useSubscriptionAccess } from "../src/state/subscription-access";
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
  const {
    auth,
    subscription,
    appleSignInConfigured,
    isPro,
    prepareAppleSignIn,
    signInWithApple,
    signOut,
    activateProPreview,
    resetSubscription,
    restorePurchases,
  } = useAccountState();
  const { isDeveloperOverride } = useSubscriptionAccess();
  const { t } = useI18n();

  const syncEnabled = settings.syncAcrossDevices;
  const freeFeatures = ROUTE_ACCESS_POLICY.filter((row) => row.tier === "free");
  const premiumFeatures = ROUTE_ACCESS_POLICY.filter((row) => row.tier === "premium");

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
          subtitle={t("Framework-ready auth state for future Apple sign-in integration.", "Framework-bereiter Auth-Status fuer spaetere Apple-Sign-in-Integration.")}
        >
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Account status", "Kontostatus")}</Text>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
                {auth.status === "signed_in" ? t("Signed in", "Angemeldet") : t("Guest", "Gast")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Cloud sync", "Cloud-Sync")}</Text>
              <Text style={{ color: syncEnabled ? "#4DD9A9" : "#F3C47A", fontWeight: "700", fontSize: 12 }}>
                {syncEnabled ? t("Enabled", "Aktiv") : t("Not enabled", "Nicht aktiv")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Provider", "Provider")}</Text>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
                {auth.provider === "apple" ? "Apple" : t("None", "Keine")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              <Pressable
                onPress={() => {
                  prepareAppleSignIn();
                  Alert.alert(t("Apple sign-in prepared", "Apple-Sign-in vorbereitet"), t("Credential wiring can be connected later without changing this screen.", "Credential-Verknuepfung kann spaeter ohne Screen-Umbau erfolgen."));
                }}
                style={({ pressed }) => ({
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
                  {appleSignInConfigured ? t("Apple Ready", "Apple bereit") : t("Prepare Apple", "Apple vorbereiten")}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const res = await signInWithApple();
                  if (!res.ok) {
                    Alert.alert(
                      t("Sign-in unavailable", "Sign-in nicht verfuegbar"),
                      res.reason === "apple_signin_not_configured"
                        ? t("Prepare Apple sign-in first.", "Bitte zuerst Apple-Sign-in vorbereiten.")
                        : t("Sign-in could not be completed yet.", "Sign-in konnte noch nicht abgeschlossen werden.")
                    );
                  }
                }}
                style={({ pressed }) => ({
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                  backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>{t("Sign In (Framework)", "Sign In (Framework)")}</Text>
              </Pressable>
              {auth.status === "signed_in" && (
                <Pressable
                  onPress={() => signOut()}
                  style={({ pressed }) => ({
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Sign Out", "Abmelden")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </SectionCard>

        <SectionCard
          title={t("Subscription", "Abonnement")}
          subtitle={t(
            "Billing framework is prepared and can be connected to App Store products later.",
            "Billing-Framework ist vorbereitet und kann spaeter mit App-Store-Produkten verbunden werden."
          )}
        >
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Plan", "Plan")}</Text>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
                {subscription.plan === "free" ? t("Free", "Kostenlos") : subscription.plan}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Status", "Status")}</Text>
              <Text style={{ color: isPro ? "#4DD9A9" : colors.subtext, fontSize: 12, fontWeight: "700" }}>
                {subscription.status}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Renewal", "Verlaengerung")}</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                {subscription.renewsAt ? new Date(subscription.renewsAt).toLocaleDateString() : "-"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {settings.developerMode && (
                <>
                  <Pressable
                    onPress={() => activateProPreview("pro_monthly")}
                    style={({ pressed }) => ({
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.accentBorder,
                      backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    })}
                  >
                    <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>{t("Mock Pro Monthly", "Mock Pro Monthly")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => activateProPreview("pro_yearly")}
                    style={({ pressed }) => ({
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.accentBorder,
                      backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    })}
                  >
                    <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>{t("Mock Pro Yearly", "Mock Pro Yearly")}</Text>
                  </Pressable>
                </>
              )}
              <Pressable
                onPress={async () => {
                  const res = await restorePurchases();
                  if (!res.ok) {
                    Alert.alert(
                      t("Restore not connected", "Restore nicht verbunden"),
                      t("Purchase restore hook is ready but not yet connected to StoreKit backend.", "Restore-Hook ist vorbereitet, aber noch nicht mit StoreKit-Backend verbunden.")
                    );
                  }
                }}
                style={({ pressed }) => ({
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Restore Purchases", "Kaeufe wiederherstellen")}</Text>
              </Pressable>
              <Pressable
                onPress={() => resetSubscription()}
                style={({ pressed }) => ({
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceAlt,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Reset Plan", "Plan zuruecksetzen")}</Text>
              </Pressable>
            </View>
          </View>
        </SectionCard>

        <SectionCard
          title={t("Plan Access", "Plan-Zugang")}
          subtitle={t(
            "Rough model for which modules are included in Free vs Premium.",
            "Grobes Modell, welche Module in Free vs Premium enthalten sind."
          )}
        >
          <View style={{ marginTop: 8, gap: 10 }}>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "900", marginBottom: 6 }}>FREE</Text>
              <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 4 }}>
                {freeFeatures.map((row) => row.label).join(" • ")}
              </Text>
            </View>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surfaceAlt, padding: 10 }}>
              <Text style={{ color: colors.accent, fontWeight: "900", marginBottom: 6 }}>PREMIUM</Text>
              <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 4 }}>
                {premiumFeatures.map((row) => row.label).join(" • ")}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: 11 }}>
                {t("Visual lock indicators now appear on gated modules when not unlocked.", "Visuelle Sperr-Indikatoren erscheinen jetzt auf gesperrten Modulen, wenn sie nicht freigeschaltet sind.")}
              </Text>
            </View>
            {isDeveloperOverride && (
              <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>
                {t("Developer tier override is active (testing only).", "Developer-Tier-Override ist aktiv (nur Tests).")}
              </Text>
            )}
            <Pressable
              onPress={() =>
                Alert.alert(
                  t("Purchase flow placeholder", "Kauffluss-Platzhalter"),
                  t(
                    "This button is the visual purchase trigger placeholder. It will call StoreKit once billing integration is connected.",
                    "Dieser Button ist der visuelle Kauf-Trigger-Platzhalter. Er wird StoreKit nutzen, sobald Billing verbunden ist."
                  )
                )
              }
              style={({ pressed }) => ({
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                paddingHorizontal: 12,
                paddingVertical: 9,
                alignSelf: "flex-start",
              })}
            >
              <Text style={{ color: colors.accent, fontWeight: "800" }}>{t("Unlock Premium (Coming Soon)", "Premium freischalten (bald)")}</Text>
            </Pressable>
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
