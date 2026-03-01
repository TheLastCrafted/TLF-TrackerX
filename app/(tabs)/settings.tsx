import type { ReactNode } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROUTE_ACCESS_POLICY } from "../../src/config/subscription";
import { AppSettings, useSettings } from "../../src/state/settings";
import { useI18n } from "../../src/i18n/use-i18n";
import { usePriceAlerts } from "../../src/state/price-alerts";
import { useSubscriptionAccess } from "../../src/state/subscription-access";
import { ActionButton } from "../../src/ui/action-button";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useHapticPress } from "../../src/ui/use-haptic-press";
import { useAppColors } from "../../src/ui/use-app-colors";

type ChoiceOption<T extends string | number> = { value: T; label: string };

function Section(props: { title: string; subtitle?: string; children: ReactNode }) {
  const colors = useAppColors();
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: colors.subtext, fontWeight: "700", marginBottom: 4 }}>{props.title}</Text>
      {!!props.subtitle && <Text style={{ color: colors.subtext, opacity: 0.8, marginBottom: 8 }}>{props.subtitle}</Text>}
      <View style={{ gap: 10 }}>{props.children}</View>
    </View>
  );
}

function ChoiceRow<T extends string | number>(props: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  dark?: boolean;
  onPressFeedback?: () => void;
}) {
  const colors = useAppColors();
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 12 }}>
      <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>{props.label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {props.options.map((option) => {
          const active = option.value === props.value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                props.onPressFeedback?.();
                props.onChange(option.value);
              }}
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.accentBorder : colors.border,
                backgroundColor: pressed ? colors.accentSoft : active ? colors.accentSoft : colors.surfaceAlt,
                paddingHorizontal: 10,
                paddingVertical: 6,
              })}
            >
              <Text style={{ color: active ? colors.accent : colors.subtext, fontWeight: "700", fontSize: 12 }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow(props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  dark?: boolean;
  onLabel?: string;
  offLabel?: string;
  onPressFeedback?: () => void;
}) {
  const colors = useAppColors();
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{props.label}</Text>
          {!!props.description && <Text style={{ color: colors.subtext, marginTop: 4 }}>{props.description}</Text>}
        </View>

        <Pressable
          onPress={() => {
            props.onPressFeedback?.();
            props.onChange(!props.value);
          }}
          style={({ pressed }) => ({
            borderRadius: 999,
            borderWidth: 1,
            borderColor: props.value ? colors.accentBorder : colors.border,
            backgroundColor: pressed ? colors.accentSoft : props.value ? colors.accentSoft : colors.surfaceAlt,
            paddingHorizontal: 10,
            paddingVertical: 6,
          })}
        >
          <Text style={{ color: props.value ? colors.accent : colors.subtext, fontWeight: "700", fontSize: 12 }}>
            {props.value ? (props.onLabel ?? "On") : (props.offLabel ?? "Off")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { effectiveTier, baseTier, isDeveloperOverride } = useSubscriptionAccess();
  const {
    alerts,
    removeAlert,
    clearTriggered,
    notificationPermission,
    requestNotificationAccess,
    sendTestNotification,
  } = usePriceAlerts();
  const colors = useAppColors();
  const haptic = useHapticPress();
  const [compactHeader, setCompactHeader] = useState(false);
  const versionTapRef = useRef<number[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const appVersion = Constants.expoConfig?.version ?? "dev";
  const extras = (Constants.expoConfig?.extra ?? {}) as {
    versionLabel?: string;
    buildIteration?: number | string;
    shortSha?: string;
  };
  const alphaLabel =
    typeof extras.versionLabel === "string" && extras.versionLabel.trim().length
      ? extras.versionLabel.trim()
      : `TLF-TrackerX v0.1 alpha.${String(extras.buildIteration ?? "1")}`;
  const iosBuild = Constants.expoConfig?.ios?.buildNumber ?? "-";
  const androidBuild = Constants.expoConfig?.android?.versionCode ? String(Constants.expoConfig.android.versionCode) : "-";
  const releaseTag =
    (typeof process !== "undefined" &&
      (process.env.EXPO_PUBLIC_RELEASE || process.env.EXPO_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA)) ||
    extras.shortSha ||
    "-";
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });
  const { t } = useI18n();

  const toggleKeys: { key: keyof AppSettings; label: string; description?: string }[] = [
    { key: "showVolumeOnProChart", label: t("Volume on Pro Chart", "Volumen im Pro-Chart") },
    { key: "showIndicatorsOnProChart", label: t("Indicators on Pro Chart", "Indikatoren im Pro-Chart") },
    { key: "compactNumbers", label: t("Compact Number Format", "Kompaktes Zahlenformat") },
    { key: "haptics", label: t("Haptics", "Haptik") },
    { key: "vibration", label: t("Vibration", "Vibration") },
    { key: "soundEffects", label: t("Sound Effects", "Soundeffekte") },
    { key: "autoRefresh", label: t("Auto Refresh", "Auto-Aktualisierung") },
    { key: "priceAlerts", label: t("Price Alerts", "Preisalarme") },
    { key: "newsAlerts", label: t("News Alerts", "News-Alarme") },
    { key: "syncAcrossDevices", label: t("Sync Across Devices", "Sync zwischen Geraeten") },
    { key: "privacyMode", label: t("Privacy Mode", "Privatsphaere-Modus") },
    { key: "analytics", label: t("Analytics", "Analytik") },
    { key: "crashReports", label: t("Crash Reports", "Crash-Reports") },
  ];

  const premiumFeatureCount = ROUTE_ACCESS_POLICY.filter((row) => row.tier === "premium").length;

  const onVersionCardTap = () => {
    const now = Date.now();
    const windowMs = 1400;
    const taps = [...versionTapRef.current.filter((ts) => now - ts <= windowMs), now];
    versionTapRef.current = taps;
    if (taps.length < 5) return;
    versionTapRef.current = [];
    if (!settings.developerMode) {
      update("developerMode", true);
      update("developerTier", "free");
      Alert.alert(
        t("Developer mode enabled", "Developer-Modus aktiviert"),
        t(
          "Testing mode is now active. You can switch between Free and Premium previews below.",
          "Testmodus ist jetzt aktiv. Du kannst unten zwischen Free- und Premium-Vorschau wechseln."
        )
      );
      return;
    }
    Alert.alert(
      t("Developer mode already active", "Developer-Modus bereits aktiv"),
      t("Use the Developer section below to switch tiers or exit test mode.", "Nutze den Developer-Bereich unten, um Tiers zu wechseln oder den Testmodus zu verlassen.")
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING, paddingBottom: 118 }}
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
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Settings", "Einstellungen")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("All options", "Alle Optionen")}</Text>
        </View>
      )}
      <TabHeader
        title={t("Settings", "Einstellungen")}
        subtitle={t("Localize app behavior, tune chart defaults, and configure alerts/privacy.", "Sprache, Chart-Defaults und Datenschutz-Einstellungen konfigurieren.")}
      />
      <Section title={t("Localization", "Lokalisierung")} subtitle={t("Language and currency format", "Sprache und Waehrungsformat")}>
        <ChoiceRow
          label={t("Workspace Mode", "Arbeitsbereichsmodus")}
          value={settings.workspaceMode}
          options={[
            { label: t("Hybrid", "Hybrid"), value: "hybrid" },
            { label: t("Institutional", "Institutionell"), value: "institutional" },
            { label: t("Personal Only", "Nur Personal"), value: "personal" },
          ]}
          onChange={(value) => {
            update("workspaceMode", value);
            update("institutionalMode", value === "institutional");
          }}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Language", "Sprache")}
          value={settings.language}
          options={[
            { label: t("English", "Englisch"), value: "en" },
            { label: t("German", "Deutsch"), value: "de" },
          ]}
          onChange={(value) => update("language", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Currency", "Waehrung")}
          value={settings.currency}
          options={[
            { label: "USD", value: "USD" },
            { label: "EUR", value: "EUR" },
          ]}
          onChange={(value) => update("currency", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("App Appearance", "App-Darstellung")}
          value={settings.appAppearance}
          options={[
            { label: t("System", "System"), value: "system" },
            { label: t("Dark", "Dunkel"), value: "dark" },
            { label: t("Light", "Hell"), value: "light" },
          ]}
          onChange={(value) => update("appAppearance", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Global Region Focus", "Region-Fokus")}
          value={settings.focusRegion}
          options={[
            { label: t("Global", "Global"), value: "Global" },
            { label: "US", value: "US" },
            { label: "EU", value: "EU" },
          ]}
          onChange={(value) => update("focusRegion", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />
      </Section>

      <Section title={t("Chart Engine", "Chart-Engine")} subtitle={t("Default chart profile for all chart pages", "Standard-Chartprofil fuer alle Chartseiten")}>
        <ChoiceRow
          label={t("Default Chart Mode", "Standard-Chartmodus")}
          value={settings.chartModeDefault}
          options={[
            { label: "Pro (TradingView)", value: "pro" },
            { label: "Simple", value: "simple" },
          ]}
          onChange={(value) => update("chartModeDefault", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Simple Chart Type", "Einfacher Charttyp")}
          value={settings.simpleChartTypeDefault}
          options={[
            { label: t("Line", "Linie"), value: "line" },
            { label: t("Bar", "Balken"), value: "bar" },
          ]}
          onChange={(value) => update("simpleChartTypeDefault", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Simple Chart Density", "Dichte einfacher Charts")}
          value={settings.simpleChartDensity}
          options={[
            { label: t("Low", "Niedrig"), value: "low" },
            { label: t("Medium", "Mittel"), value: "medium" },
            { label: t("High", "Hoch"), value: "high" },
          ]}
          onChange={(value) => update("simpleChartDensity", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Pro Chart Theme", "Pro-Chart-Theme")}
          value={settings.chartTheme}
          options={[
            { label: t("Dark", "Dunkel"), value: "dark" },
            { label: t("Light", "Hell"), value: "light" },
          ]}
          onChange={(value) => update("chartTheme", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Pro Chart Interval", "Pro-Chart-Intervall")}
          value={settings.chartInterval}
          options={[
            { label: "5m", value: "5" },
            { label: "15m", value: "15" },
            { label: "1h", value: "60" },
            { label: "4h", value: "240" },
            { label: "1D", value: "D" },
          ]}
          onChange={(value) => update("chartInterval", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />

        <ChoiceRow
          label={t("Simple Chart Default Timeframe", "Standard-Zeitrahmen einfacher Charts")}
          value={settings.defaultTimeframeDays}
          options={[
            { label: "1D", value: 1 },
            { label: "7D", value: 7 },
            { label: "30D", value: 30 },
            { label: "1Y", value: 365 },
            { label: "5Y", value: 1825 },
            { label: "10Y", value: 3650 },
            { label: "20Y", value: 7300 },
            { label: "50Y", value: 18250 },
          ]}
          onChange={(value) => update("defaultTimeframeDays", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />
      </Section>

      <Section title={t("Refresh", "Aktualisierung")} subtitle={t("Polling and live feed cadence", "Polling- und Feed-Intervall")}>
        <ChoiceRow
          label={t("Auto Refresh Interval", "Auto-Aktualisierungsintervall")}
          value={settings.refreshSeconds}
          options={[
            { label: "5s", value: 5 },
            { label: "10s", value: 10 },
            { label: "15s", value: 15 },
            { label: "30s", value: 30 },
          ]}
          onChange={(value) => update("refreshSeconds", value)}
          dark={colors.dark}
          onPressFeedback={() => haptic("light")}
        />
      </Section>

      <Section title={t("Toggles", "Schalter")} subtitle={t("Advanced options for UX, data, privacy, and alerts", "Erweiterte Optionen fuer UX, Daten, Datenschutz und Alerts")}>
        {toggleKeys.map((row) => (
          <ToggleRow
            key={row.key}
            label={row.label}
            description={row.description}
            value={Boolean(settings[row.key])}
            onChange={(value) => update(row.key, value as never)}
            onLabel={t("On", "An")}
            offLabel={t("Off", "Aus")}
            dark={colors.dark}
            onPressFeedback={() => haptic("light")}
          />
        ))}
      </Section>

      {settings.developerMode && (
        <Section
          title={t("Developer Mode", "Developer-Modus")}
          subtitle={t("Testing-only tier override. Remove before final public release.", "Nur fuer Tests: Tier-Override. Vor finalem Public-Release entfernen.")}
        >
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
            <Text style={{ color: colors.subtext }}>
              {t("Base tier", "Basis-Tier")}: <Text style={{ color: colors.text, fontWeight: "800" }}>{baseTier.toUpperCase()}</Text>
            </Text>
            <Text style={{ color: colors.subtext }}>
              {t("Effective tier", "Aktives Tier")}: <Text style={{ color: colors.accent, fontWeight: "900" }}>{effectiveTier.toUpperCase()}</Text>
            </Text>
            <Text style={{ color: colors.subtext }}>
              {premiumFeatureCount} {t("premium routes are currently gated for Free users.", "Premium-Routen sind aktuell fuer Free-Nutzer gesperrt.")}
            </Text>

            <ChoiceRow
              label={t("Tier Override", "Tier-Override")}
              value={settings.developerTier}
              options={[
                { label: t("Free Preview", "Free-Vorschau"), value: "free" },
                { label: t("Premium Preview", "Premium-Vorschau"), value: "premium" },
              ]}
              onChange={(value) => update("developerTier", value)}
              dark={colors.dark}
              onPressFeedback={() => haptic("light")}
            />

            <ActionButton
              label={t("Exit Developer Mode", "Developer-Modus verlassen")}
              onPress={() => {
                haptic("light");
                update("developerMode", false);
                update("developerTier", "free");
                Alert.alert(
                  t("Developer mode disabled", "Developer-Modus deaktiviert"),
                  t("App returned to normal subscription behavior.", "App ist zum normalen Abo-Verhalten zurueckgekehrt.")
                );
              }}
              style={{ alignSelf: "flex-start" }}
            />
            {isDeveloperOverride && (
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                {t(
                  "Developer override is active. This is test-only and must be removed before release.",
                  "Developer-Override ist aktiv. Das ist nur fuer Tests und muss vor Release entfernt werden."
                )}
              </Text>
            )}
          </View>
        </Section>
      )}

      <Section title={t("Price Alerts", "Preisalarme")} subtitle={t("Active and triggered portfolio/market alerts", "Aktive und ausgeloeste Portfolio-/Marktalarme")}>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {t("Notification permission", "Benachrichtigungsberechtigung")}: {notificationPermission}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <ActionButton
              label={t("Enable notifications", "Benachrichtigungen aktivieren")}
              onPress={async () => {
                haptic("light");
                const state = await requestNotificationAccess();
                Alert.alert(
                  t("Notification status", "Benachrichtigungsstatus"),
                  state === "granted"
                    ? t("Notifications enabled.", "Benachrichtigungen aktiviert.")
                    : t("Notifications are not enabled on this device.", "Benachrichtigungen sind auf diesem Geraet nicht aktiviert.")
                );
              }}
              style={{ minWidth: 180 }}
            />
            <ActionButton
              label={t("Send test notification", "Test-Benachrichtigung senden")}
              onPress={async () => {
                haptic("light");
                const ok = await sendTestNotification();
                Alert.alert(
                  t("Test notification", "Test-Benachrichtigung"),
                  ok
                    ? t("Sent. If system permissions are granted, you should receive it now.", "Gesendet. Bei aktiver Systemfreigabe solltest du sie jetzt erhalten.")
                    : t("Could not send. Check permission/device support.", "Konnte nicht gesendet werden. Bitte Berechtigung/Geraete-Support pruefen.")
                );
              }}
              style={{ minWidth: 180 }}
            />
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {t("Delivery: live in-app checks while the app is active.", "Auslieferung: Live-In-App-Pruefung, solange die App aktiv ist.")}
          </Text>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{t("Total alerts", "Alarme gesamt")}: {alerts.length}</Text>
          <ActionButton
            label={t("Clear triggered", "Ausgeloeste leeren")}
            onPress={() => {
              haptic("light");
              clearTriggered();
            }}
            style={{ alignSelf: "flex-start" }}
          />
          {alerts.map((alert) => (
            <View key={alert.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 9 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {alert.mode === "price"
                    ? `${alert.symbol} ${alert.direction === "above" ? ">" : "<"} ${(alert.targetPrice ?? 0).toFixed(2)}`
                    : `${alert.symbol} ${alert.direction === "above" ? "+" : "-"}${Math.abs(alert.relativeChangePct ?? 0).toFixed(2)}%`}
                </Text>
                <ActionButton
                  label={t("Remove", "Entfernen")}
                  onPress={() => {
                    haptic("light");
                    removeAlert(alert.id);
                  }}
                  style={{ minWidth: 96 }}
                />
              </View>
              <Text style={{ color: colors.subtext, marginTop: 3 }}>
                {alert.name} • {alert.triggered ? t("Triggered", "Ausgeloest") : t("Active", "Aktiv")}
                {Number.isFinite(alert.lastPrice) ? ` • ${t("Last", "Letzter")}: ${alert.lastPrice?.toFixed(4)}` : ""}
              </Text>
            </View>
          ))}
          {!alerts.length && <Text style={{ color: colors.subtext }}>{t("No alerts created yet.", "Noch keine Alarme erstellt.")}</Text>}
        </View>
      </Section>

      <Section
        title={t("Legal & Privacy", "Rechtliches & Datenschutz")}
        subtitle={t(
          "Terms, privacy details, and data-source transparency.",
          "AGB, Datenschutzdetails und Transparenz zu Datenquellen."
        )}
      >
        {[
          {
            label: t("Terms & Conditions", "Nutzungsbedingungen"),
            route: "/legal/terms",
            subtitle: t("How the app may be used and key limitations.", "Wie die App genutzt werden darf und zentrale Haftungshinweise."),
          },
          {
            label: t("Privacy Policy", "Datenschutzerklaerung"),
            route: "/legal/privacy",
            subtitle: t("What is stored, shared, and controlled on-device.", "Welche Daten lokal gespeichert, geteilt und kontrolliert werden."),
          },
          {
            label: t("Data & Sources", "Daten & Quellen"),
            route: "/legal/data",
            subtitle: t("Market feed sources, delays, and reliability notes.", "Marktdatenquellen, Verzoegerungen und Zuverlaessigkeitshinweise."),
          },
        ].map((item) => (
          <Pressable
            key={item.route}
            onPress={() => {
              haptic("light");
              router.push(item.route as never);
            }}
            style={({ pressed }) => ({
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceAlt : colors.surfaceElevated,
              paddingHorizontal: 12,
              paddingVertical: 11,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{item.label}</Text>
              <Text style={{ color: colors.subtext, marginTop: 2, fontSize: 11 }}>{item.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={colors.subtext} />
          </Pressable>
        ))}
      </Section>

      <Section
        title={t("App Version", "App-Version")}
        subtitle={t("Use this section to verify the currently running build.", "Nutze diesen Bereich, um den aktuell laufenden Build zu pruefen.")}
      >
        <Pressable
          onPress={onVersionCardTap}
          style={({ pressed }) => ({
            borderRadius: 14,
            borderWidth: 1,
            borderColor: settings.developerMode ? colors.accentBorder : colors.border,
            backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            padding: 12,
            gap: 6,
          })}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>{alphaLabel}</Text>
          <Text style={{ color: colors.subtext }}>
            {t("Expo version", "Expo-Version")}: {appVersion}
          </Text>
          <Text style={{ color: colors.subtext }}>
            iOS {t("Build", "Build")}: {iosBuild} • Android {t("Build", "Build")}: {androidBuild}
          </Text>
          <Text style={{ color: colors.subtext }}>
            {t("Release", "Release")}: {releaseTag}
          </Text>
          <Text style={{ color: settings.developerMode ? colors.accent : colors.subtext, fontSize: 11, marginTop: 2 }}>
            {settings.developerMode
              ? t("Developer mode active (testing only).", "Developer-Modus aktiv (nur Tests).")
              : t("Tap this card 5x quickly to enable developer test mode.", "Tippe diese Karte 5x schnell, um den Developer-Testmodus zu aktivieren.")}
          </Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}
