import { Pressable, Text, ViewStyle } from "react-native";
import { useI18n } from "../i18n/use-i18n";
import { translateUiText } from "../i18n/translate-ui";
import { useHapticPress } from "./use-haptic-press";
import { useAppColors } from "./use-app-colors";

export function ActionButton(props: {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const colors = useAppColors();
  const { isDe } = useI18n();
  const haptic = useHapticPress();
  const label = translateUiText(props.label, isDe);
  return (
    <Pressable
      onPress={() => {
        haptic("light");
        props.onPress();
      }}
      style={({ pressed }) => ({
        borderRadius: 13,
        borderWidth: 1,
        borderColor: colors.accentBorder,
        backgroundColor: pressed ? (colors.dark ? "#2B2550" : "#EEE7FF") : colors.accentSoft,
        minHeight: 40,
        minWidth: 96,
        maxWidth: "100%",
        paddingVertical: 9,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 1,
        shadowColor: colors.accent,
        shadowOpacity: colors.dark ? 0.16 : 0.09,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 1 },
        ...(props.style ?? {}),
      })}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.accent, fontWeight: "900", fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}
