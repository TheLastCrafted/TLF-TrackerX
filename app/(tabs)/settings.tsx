import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppSettings, useSettings } from "../../src/state/settings";
import { useI18n } from "../../src/i18n/use-i18n";
import { usePriceAlerts } from "../../src/state/price-alerts";
import { ActionButton } from "../../src/ui/action-button";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useHapticPress } from "../../src/ui/use-haptic-press";
import { useAppColors } from "../../src/ui/use-app-colors";

type ChoiceOption<T extends string | number> = { value: T; label: string };

function Section(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: "#A9A9BB", fontWeight: "700", marginBottom: 4 }}>{props.title}</Text>
      {!!props.subtitle && <Text style={{ color: "#72758B", marginBottom: 8 }}>{props.subtitle}</Text>}
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
  const dark = props.dark !== false;
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: dark ? "#1A1A24" : "#D7E0F0", backgroundColor: dark ? "#0F0F16" : "#FFFFFF", padding: 12 }}>
      <Text style={{ color: dark ? "#D7D7EA" : "#253550", fontWeight: "700", marginBottom: 8 }}>{props.label}</Text>
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
                borderColor: active ? "#5F43B2" : dark ? "#2A2A34" : "#CBD7EE",
                backgroundColor: pressed ? (dark ? "#161624" : "#EAEFFD") : active ? (dark ? "#17132A" : "#EEE8FF") : dark ? "#11111A" : "#F6F9FF",
                paddingHorizontal: 10,
                paddingVertical: 6,
              })}
            >
              <Text style={{ color: active ? "#B79DFF" : dark ? "#C8C8DA" : "#4E5F80", fontWeight: "700", fontSize: 12 }}>{option.label}</Text>
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
  const dark = props.dark !== false;
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: dark ? "#1A1A24" : "#D7E0F0", backgroundColor: dark ? "#0F0F16" : "#FFFFFF", padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: dark ? "#D7D7EA" : "#253550", fontWeight: "700" }}>{props.label}</Text>
          {!!props.description && <Text style={{ color: dark ? "#8F8FA1" : "#7485A2", marginTop: 4 }}>{props.description}</Text>}
        </View>

        <Pressable
          onPress={() => {
            props.onPressFeedback?.();
            props.onChange(!props.value);
          }}
          style={({ pressed }) => ({
            borderRadius: 999,
            borderWidth: 1,
            borderColor: props.value ? "#5F43B2" : dark ? "#2A2A34" : "#CBD7EE",
            backgroundColor: pressed ? (dark ? "#161624" : "#EAEFFD") : props.value ? (dark ? "#17132A" : "#EEE8FF") : dark ? "#11111A" : "#F6F9FF",
            paddingHorizontal: 10,
            paddingVertical: 6,
          })}
        >
          <Text style={{ color: props.value ? "#B79DFF" : dark ? "#C8C8DA" : "#4E5F80", fontWeight: "700", fontSize: 12 }}>
            {props.value ? (props.onLabel ?? "On") : (props.offLabel ?? "Off")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
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
  const { t } = useI18n();

  const toggleKeys: { key: keyof AppSettings; label: string; description?: string }[] = [
    { key: "showVolumeOnProChart", label: t("Volume on Pro Chart", "Volumen im Pro-Chart") },
    { key: "showIndicatorsOnProChart", label: t("Indicators on Pro Chart", "Indikatoren im Pro-Chart") },
    { key: "compactNumbers", label: t("Compact Number Format", "Kompaktes Zahlenformat") },
    { key: "haptics", label: t("Haptics", "Haptik") },
    { key: "autoRefresh", label: t("Auto Refresh", "Auto-Aktualisierung") },
    { key: "priceAlerts", label: t("Price Alerts", "Preisalarme") },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING, paddingBottom: 28 }}
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
    </ScrollView>
  );
}
