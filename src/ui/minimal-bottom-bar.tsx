import { useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useI18n } from "../i18n/use-i18n";
import { useAppMode } from "../state/app-mode";
import { useCommandCenter } from "../state/command-center";
import { useSettings } from "../state/settings";
import { useHapticPress } from "./use-haptic-press";
import { useAppColors } from "./use-app-colors";

type MenuItem = {
  route: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  mode: "informational" | "personal";
};

const INFO_ITEMS: MenuItem[] = [
  { route: "index", label: "Home", icon: "home", mode: "informational" },
  { route: "charts", label: "Charts", icon: "show-chart", mode: "informational" },
  { route: "crypto", label: "Crypto", icon: "currency-bitcoin", mode: "informational" },
  { route: "stocks", label: "Stocks", icon: "trending-up", mode: "informational" },
  { route: "explore", label: "Macro", icon: "public", mode: "informational" },
  { route: "liquidity", label: "Liquidity", icon: "water-drop", mode: "informational" },
  { route: "correlations", label: "Correlations", icon: "hub", mode: "informational" },
  { route: "scenario", label: "Scenario", icon: "science", mode: "informational" },
  { route: "watchlist", label: "Watchlist", icon: "star", mode: "informational" },
  { route: "news", label: "News", icon: "article", mode: "informational" },
  { route: "research", label: "Research", icon: "menu-book", mode: "informational" },
];

const PERSONAL_ITEMS: MenuItem[] = [
  { route: "tools", label: "Hub", icon: "dashboard", mode: "personal" },
  { route: "portfolio", label: "Portfolio", icon: "work", mode: "personal" },
  { route: "strategy", label: "Strategy", icon: "functions", mode: "personal" },
  { route: "budget", label: "Budget", icon: "account-balance-wallet", mode: "personal" },
  { route: "cashflow", label: "Cashflow", icon: "bar-chart", mode: "personal" },
];

export function MinimalBottomBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useAppMode();
  const { openCenter } = useCommandCenter();
  const { settings } = useSettings();
  const workspaceMode = settings.workspaceMode ?? (settings.institutionalMode ? "institutional" : "hybrid");
  const infoLocked = workspaceMode === "institutional";
  const personalLocked = workspaceMode === "personal";
  const colors = useAppColors();
  const { t } = useI18n();
  const haptic = useHapticPress();
  const [open, setOpen] = useState(false);

  const activeRoute = props.state.routes[props.state.index]?.name;
  const onSettingsRoute = activeRoute === "settings";
  const homeRoute = infoLocked ? "index" : personalLocked ? "tools" : mode === "informational" ? "index" : "tools";

  const switchMode = () => {
    if (infoLocked || personalLocked) return;
    haptic("medium");
    const next = mode === "informational" ? "personal" : "informational";
    setMode(next);
    props.navigation.navigate(next === "informational" ? "index" : "tools");
    setOpen(false);
  };

  const go = (item: MenuItem) => {
    haptic("light");
    if (item.mode === "informational" && personalLocked) return;
    if (item.mode === "personal" && infoLocked) return;
    if (mode !== item.mode) setMode(item.mode);
    props.navigation.navigate(item.route);
    setOpen(false);
  };

  const trLabel = (label: string) => {
    const map: Record<string, string> = {
      Home: "Start",
      Charts: "Charts",
      Crypto: "Krypto",
      Stocks: "Aktien",
      Macro: "Makro",
      Liquidity: "Liquiditaet",
      Correlations: "Korrelationen",
      Scenario: "Szenario",
      Watchlist: "Watchlist",
      News: "News",
      Research: "Forschung",
      Hub: "Hub",
      Portfolio: "Portfolio",
      Strategy: "Strategie",
      Budget: "Budget",
      Cashflow: "Cashflow",
    };
    return t(label, map[label] ?? label);
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      {open && (
        <Pressable
          onPress={() => setOpen(false)}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: -420, backgroundColor: colors.dark ? "rgba(6,8,14,0.38)" : "rgba(17,22,36,0.18)" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: 14,
              right: 14,
              bottom: 86 + insets.bottom,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: 12,
              shadowColor: colors.dark ? "#000000" : "#9FB0DB",
              shadowOpacity: colors.dark ? 0.28 : 0.16,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            }}
          >
            <Pressable
              onPress={() => {
                haptic("light");
                setOpen(false);
                openCenter();
              }}
              style={({ pressed }) => ({
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: pressed ? colors.accentSoft : colors.surfaceAlt,
                paddingVertical: 9,
                paddingHorizontal: 12,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              })}
            >
              <MaterialIcons name="dashboard-customize" size={15} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}>{t("Command Center", "Command Center")}</Text>
            </Pressable>
            {!personalLocked && (
              <>
                <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "800", marginBottom: 8 }}>{t("INFORMATION", "INFORMATION")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {INFO_ITEMS.map((item) => {
                    const active = activeRoute === item.route;
                    return (
                      <Pressable
                        key={item.route}
                        onPress={() => go(item)}
                        style={({ pressed }) => ({
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: active ? "#A98BFF" : colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#1A1E2E" : "#EEF2FF") : colors.surface,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          minWidth: 112,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        })}
                      >
                        <MaterialIcons name={item.icon} size={14} color={active ? "#A98BFF" : colors.subtext} />
                        <Text style={{ color: active ? "#A98BFF" : colors.text, fontWeight: "700", fontSize: 12 }}>{trLabel(item.label)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {!infoLocked && (
              <>
                <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "800", marginBottom: 8, marginTop: 12 }}>{t("PERSONAL", "PERSOENLICH")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PERSONAL_ITEMS.map((item) => {
                    const active = activeRoute === item.route;
                    return (
                      <Pressable
                        key={item.route}
                        onPress={() => go(item)}
                        style={({ pressed }) => ({
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: active ? "#8E63F0" : colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#1A1E2E" : "#EEF2FF") : colors.surface,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          minWidth: 112,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        })}
                      >
                        <MaterialIcons name={item.icon} size={14} color={active ? "#8E63F0" : colors.subtext} />
                        <Text style={{ color: active ? "#8E63F0" : colors.text, fontWeight: "700", fontSize: 12 }}>{trLabel(item.label)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      )}

      <View
        style={{
          marginHorizontal: 14,
          marginBottom: Math.max(8, insets.bottom),
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.dark ? "rgba(12,14,22,0.96)" : "rgba(255,255,255,0.98)",
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          shadowColor: colors.dark ? "#000000" : "#9FB0DB",
          shadowOpacity: colors.dark ? 0.24 : 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 7 },
          elevation: 5,
        }}
      >
        <Pressable
          onPress={switchMode}
          accessibilityLabel={t("Switch workspace mode", "Arbeitsbereich wechseln")}
          style={({ pressed }) => ({
            borderRadius: 12,
            borderWidth: 1,
            borderColor: infoLocked || personalLocked ? colors.border : mode === "informational" ? "#A98BFF" : "#8E63F0",
            backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : colors.surface,
            width: 38,
            height: 38,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <MaterialIcons
            name={infoLocked ? "account-balance" : personalLocked ? "person" : "swap-horiz"}
            size={18}
            color={infoLocked || personalLocked ? colors.subtext : mode === "informational" ? "#A98BFF" : "#8E63F0"}
          />
        </Pressable>

        <Pressable
          onPress={() => {
            haptic("medium");
            setOpen((v) => !v);
          }}
          style={({ pressed }) => ({
            width: 62,
            height: 62,
            borderRadius: 31,
            borderWidth: 2,
            borderColor: colors.dark ? "#CBB4FF" : "#8D63F1",
            backgroundColor: pressed ? "#7D57DE" : mode === "informational" ? "#9D77FF" : "#8B5EEB",
            alignItems: "center",
            justifyContent: "center",
            marginTop: -30,
            shadowColor: "#6F45D3",
            shadowOpacity: colors.dark ? 0.5 : 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          })}
        >
          <MaterialIcons name={open ? "close" : "apps"} size={25} color="#F7F2FF" />
        </Pressable>

        <Pressable
          onPress={() => {
            haptic("light");
            if (onSettingsRoute) {
              props.navigation.navigate(homeRoute);
            } else {
              props.navigation.navigate("settings");
            }
            setOpen(false);
          }}
          accessibilityLabel={
            onSettingsRoute
              ? t("Go to home", "Zur Startseite")
              : t("Open settings", "Einstellungen oeffnen")
          }
          style={({ pressed }) => ({
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : colors.surface,
            width: 38,
            height: 38,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <MaterialIcons
            name={onSettingsRoute ? "home" : "settings"}
            size={18}
            color={colors.subtext}
          />
        </Pressable>
      </View>
    </View>
  );
}
