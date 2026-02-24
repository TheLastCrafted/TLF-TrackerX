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
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#5F43B2",
        backgroundColor: pressed ? (colors.dark ? "#2A2152" : "#EEE6FF") : (colors.dark ? "#21193F" : "#F4EEFF"),
        minHeight: 42,
        minWidth: 120,
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        ...(props.style ?? {}),
      })}
    >
      <Text style={{ color: "#CBB6FF", fontWeight: "900", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
