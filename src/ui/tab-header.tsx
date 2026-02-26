import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { useRef } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../i18n/use-i18n";
import { translateUiText } from "../i18n/translate-ui";
import { useAppMode } from "../state/app-mode";
import { useAppColors } from "./use-app-colors";

export const SCREEN_HORIZONTAL_PADDING = 14;

export function TabHeader(props: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  bottomSpacing?: number;
  showLogo?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const router = useRouter();
  const { mode } = useAppMode();
  const didLongPressRef = useRef(false);
  const { isDe } = useI18n();
  const title = translateUiText(props.title, isDe);
  const subtitle = props.subtitle ? translateUiText(props.subtitle, isDe) : undefined;

  const iconByTitle: Record<string, keyof typeof MaterialIcons.glyphMap> = {
    Home: "home",
    Charts: "show-chart",
    Crypto: "currency-bitcoin",
    Stocks: "trending-up",
    Macro: "public",
    Watchlist: "star",
    Settings: "settings",
    Portfolio: "work",
    Strategy: "functions",
    Budget: "account-balance-wallet",
    Cashflow: "bar-chart",
    Research: "menu-book",
    News: "article",
    "Personal Hub": "dashboard",
  };
  const icon = iconByTitle[props.title] ?? "grid-view";

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
        paddingBottom: props.bottomSpacing ?? 10,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            alignSelf: "flex-start",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            backgroundColor: colors.dark ? "rgba(26,34,56,0.75)" : "#F2F6FF",
            paddingHorizontal: 10,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <MaterialIcons name={icon} size={17} color={colors.accent} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{title}</Text>
        </View>
        {!!subtitle && (
          <Text numberOfLines={1} style={{ color: colors.subtext, flexShrink: 1, marginTop: 6, fontSize: 12 }}>{subtitle}</Text>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
        {!!props.right && <View>{props.right}</View>}
        {(props.showLogo ?? true) && (
          <Pressable
            onPress={() => {
              if (didLongPressRef.current) {
                didLongPressRef.current = false;
                return;
              }
              router.push("/account");
            }}
            delayLongPress={240}
            onLongPress={() => {
              didLongPressRef.current = true;
              if (mode === "personal") {
                router.replace("/(tabs)/tools");
                return;
              }
              router.replace("/(tabs)");
            }}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              padding: 5,
              overflow: "hidden",
              shadowColor: colors.accent,
              shadowOpacity: colors.dark ? 0.2 : 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Image
              source={require("../../assets/images/icon-v2.png")}
              style={{ width: 31, height: 31, borderRadius: 999, opacity: 0.98, transform: [{ scale: 1.62 }] }}
              resizeMode="cover"
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
