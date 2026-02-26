import { ActivityIndicator, Text, View } from "react-native";

type RefreshPalette = {
  accent: string;
  subtext: string;
  border: string;
  surface: string;
  dark: boolean;
};

export function refreshControlProps(colors: RefreshPalette, title: string) {
  return {
    tintColor: colors.accent,
    colors: [colors.accent],
    progressBackgroundColor: colors.surface,
    title,
    titleColor: colors.subtext,
  };
}

export function RefreshFeedback(props: { refreshing: boolean; colors: RefreshPalette; label: string }) {
  if (!props.refreshing) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: 56,
        left: 0,
        right: 0,
        zIndex: 60,
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <View
        style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.colors.border,
        backgroundColor: props.colors.dark ? "#141A2A" : "#EEF4FF",
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        maxWidth: "90%",
      }}
      >
        <ActivityIndicator size="small" color={props.colors.accent} />
        <Text style={{ color: props.colors.subtext, fontWeight: "700", fontSize: 12 }}>{props.label}</Text>
      </View>
    </View>
  );
}
