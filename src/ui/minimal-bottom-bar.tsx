import { useCallback, useMemo, useRef, useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Animated, Easing, PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useI18n } from "../i18n/use-i18n";
import { useAppMode } from "../state/app-mode";
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
  { route: "explore", label: "Macro", icon: "public", mode: "informational" },
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
  const { height: screenHeight } = useWindowDimensions();
  const { mode, setMode } = useAppMode();
  const colors = useAppColors();
  const { t } = useI18n();
  const haptic = useHapticPress();
  const [open, setOpen] = useState(false);
  const [leftEdgeY, setLeftEdgeY] = useState(0);
  const [rightEdgeY, setRightEdgeY] = useState(0);

  const activeRoute = props.state.routes[props.state.index]?.name;
  const leftEdgeProgress = useRef(new Animated.Value(0)).current;
  const rightEdgeProgress = useRef(new Animated.Value(0)).current;
  const leftEdgeDxRef = useRef(0);
  const rightEdgeDxRef = useRef(0);
  const edgeReturnRouteRef = useRef<string | null>(null);

  const animateEdgeTo = useCallback((progress: Animated.Value, toValue: number, duration = 140, cb?: () => void) => {
    Animated.timing(progress, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && cb) cb();
    });
  }, []);

  const edgePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.pageX <= 18,
        onMoveShouldSetPanResponder: (_evt, g) => g.dx > 10 && Math.abs(g.dy) < 24,
        onPanResponderMove: (evt, g) => {
          const dx = Math.max(0, g.dx);
          leftEdgeDxRef.current = dx;
          setLeftEdgeY(evt.nativeEvent.pageY);
          const progress = Math.max(0, Math.min(1, dx / 92));
          leftEdgeProgress.setValue(progress);
        },
        onPanResponderRelease: () => {
          const shouldNavigate = leftEdgeDxRef.current > 72;
          leftEdgeDxRef.current = 0;
          if (shouldNavigate) {
            animateEdgeTo(leftEdgeProgress, 1, 110, () => {
              if (activeRoute && activeRoute !== "index" && activeRoute !== "tools") {
                edgeReturnRouteRef.current = activeRoute;
              }
              props.navigation.navigate(mode === "informational" ? "index" : "tools");
              leftEdgeProgress.setValue(0);
            });
            return;
          }
          animateEdgeTo(leftEdgeProgress, 0, 130);
        },
        onPanResponderTerminate: () => {
          leftEdgeDxRef.current = 0;
          animateEdgeTo(leftEdgeProgress, 0, 130);
        },
      }),
    [activeRoute, animateEdgeTo, leftEdgeProgress, mode, props.navigation]
  );

  const rightEdgePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, g) => g.dx < -10 && Math.abs(g.dy) < 24,
        onPanResponderMove: (evt, g) => {
          const dx = Math.max(0, -g.dx);
          rightEdgeDxRef.current = dx;
          setRightEdgeY(evt.nativeEvent.pageY);
          const progress = Math.max(0, Math.min(1, dx / 92));
          rightEdgeProgress.setValue(progress);
        },
        onPanResponderRelease: () => {
          const shouldNavigate = rightEdgeDxRef.current > 72;
          rightEdgeDxRef.current = 0;
          const canReturn = Boolean(edgeReturnRouteRef.current) && (activeRoute === "index" || activeRoute === "tools");
          if (shouldNavigate && canReturn) {
            animateEdgeTo(rightEdgeProgress, 1, 110, () => {
              const target = edgeReturnRouteRef.current;
              if (target) props.navigation.navigate(target as never);
              rightEdgeProgress.setValue(0);
              edgeReturnRouteRef.current = null;
            });
            return;
          }
          animateEdgeTo(rightEdgeProgress, 0, 130);
        },
        onPanResponderTerminate: () => {
          rightEdgeDxRef.current = 0;
          animateEdgeTo(rightEdgeProgress, 0, 130);
        },
      }),
    [activeRoute, animateEdgeTo, props.navigation, rightEdgeProgress]
  );

  const edgeOverlayOpacity = leftEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.95],
  });
  const leftDropletX = leftEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-22, 8],
  });
  const leftDropletScaleX = leftEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 1.16],
  });
  const leftDropletScaleY = leftEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const rightEdgeOverlayOpacity = rightEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.95],
  });
  const rightDropletX = rightEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [22, -8],
  });
  const rightDropletScaleX = rightEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 1.16],
  });
  const rightDropletScaleY = rightEdgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const showLeftEdgeGesture = activeRoute !== "index" && activeRoute !== "tools";
  const showRightEdgeGesture = (activeRoute === "index" || activeRoute === "tools") && Boolean(edgeReturnRouteRef.current);

  const switchMode = () => {
    haptic("medium");
    const next = mode === "informational" ? "personal" : "informational";
    setMode(next);
    props.navigation.navigate(next === "informational" ? "index" : "tools");
    setOpen(false);
  };

  const go = (item: MenuItem) => {
    haptic("light");
    if (mode !== item.mode) setMode(item.mode);
    props.navigation.navigate(item.route);
    setOpen(false);
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      {showLeftEdgeGesture && (
        <>
          <View
            {...edgePan.panHandlers}
            pointerEvents="box-only"
            style={{ position: "absolute", left: 0, top: -900, bottom: 0, width: 22, zIndex: 82 }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              bottom: Math.max(0, screenHeight - Math.max(24, leftEdgeY) - 28),
              width: 56,
              height: 56,
              opacity: edgeOverlayOpacity,
              backgroundColor: colors.dark ? "#8E63F0" : "#7A58D6",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.dark ? "#A98BFF" : "#6E4BC4",
              transform: [{ translateX: leftDropletX }, { scaleX: leftDropletScaleX }, { scaleY: leftDropletScaleY }],
              alignItems: "center",
              justifyContent: "center",
              zIndex: 81,
            }}
          >
            <MaterialIcons name="arrow-back-ios-new" size={14} color={colors.dark ? "#EEE4FF" : "#5A3AAA"} />
          </Animated.View>
        </>
      )}
      {showRightEdgeGesture && (
        <>
          <View
            {...rightEdgePan.panHandlers}
            pointerEvents="box-only"
            style={{ position: "absolute", right: 0, top: -900, bottom: 0, width: 22, zIndex: 82 }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 0,
              bottom: Math.max(0, screenHeight - Math.max(24, rightEdgeY) - 28),
              width: 56,
              height: 56,
              opacity: rightEdgeOverlayOpacity,
              backgroundColor: colors.dark ? "#8E63F0" : "#7A58D6",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.dark ? "#A98BFF" : "#6E4BC4",
              transform: [{ translateX: rightDropletX }, { scaleX: rightDropletScaleX }, { scaleY: rightDropletScaleY }],
              alignItems: "center",
              justifyContent: "center",
              zIndex: 81,
            }}
          >
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.dark ? "#EEE4FF" : "#5A3AAA"} />
          </Animated.View>
        </>
      )}
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
                    <Text style={{ color: active ? "#A98BFF" : colors.text, fontWeight: "700", fontSize: 12 }}>{t(item.label, item.label === "Crypto" ? "Krypto" : item.label === "Macro" ? "Makro" : item.label)}</Text>
                  </Pressable>
                );
              })}
            </View>

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
                    <Text style={{ color: active ? "#8E63F0" : colors.text, fontWeight: "700", fontSize: 12 }}>{t(item.label, item.label === "Strategy" ? "Strategie" : item.label === "Cashflow" ? "Cashflow" : item.label === "Hub" ? "Hub" : item.label)}</Text>
                  </Pressable>
                );
              })}
            </View>
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
            borderColor: mode === "informational" ? "#A98BFF" : "#8E63F0",
            backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : colors.surface,
            width: 38,
            height: 38,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <MaterialIcons name="swap-horiz" size={18} color={mode === "informational" ? "#A98BFF" : "#8E63F0"} />
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
            props.navigation.navigate("settings");
            setOpen(false);
          }}
          accessibilityLabel={t("Open settings", "Einstellungen oeffnen")}
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
          <MaterialIcons name="settings" size={18} color={colors.subtext} />
        </Pressable>
      </View>
    </View>
  );
}
