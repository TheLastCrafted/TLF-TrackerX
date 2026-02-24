import type { ReactNode } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../i18n/use-i18n";
import { translateUiText } from "../i18n/translate-ui";
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
  const { isDe } = useI18n();
  const title = translateUiText(props.title, isDe);
  const subtitle = props.subtitle ? translateUiText(props.subtitle, isDe) : undefined;

  const iconByTitle: Record<string, keyof typeof MaterialIcons.glyphMap> = {
    Home: "home",
    Charts: "show-chart",
    Crypto: "currency-bitcoin",
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
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 11,
            paddingVertical: 7,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <MaterialIcons name={icon} size={17} color={colors.subtext} />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{title}</Text>
        </View>
        {!!subtitle && <Text style={{ color: colors.subtext, marginTop: 4 }}>{subtitle}</Text>}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
        {!!props.right && <View>{props.right}</View>}
        {(props.showLogo ?? true) && (
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: 6,
              overflow: "hidden",
            }}
          >
            <Image
              source={require("../../assets/images/icon.png")}
              style={{ width: 31, height: 31, borderRadius: 999, opacity: 0.98, transform: [{ scale: 1.62 }] }}
              resizeMode="cover"
            />
          </View>
        )}
      </View>
    </View>
  );
}
