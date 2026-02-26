import { Text, TextInput, TextInputProps, View } from "react-native";
import { useI18n } from "../i18n/use-i18n";
import { translateUiText } from "../i18n/translate-ui";
import { useAppColors } from "./use-app-colors";

type FormInputProps = TextInputProps & {
  label: string;
  help?: string;
};

export function FormInput(props: FormInputProps) {
  const { label, help, style, ...inputProps } = props;
  const colors = useAppColors();
  const { isDe } = useI18n();
  const translatedLabel = translateUiText(label, isDe);
  const translatedHelp = help ? translateUiText(help, isDe) : undefined;
  const translatedPlaceholder =
    typeof inputProps.placeholder === "string"
      ? translateUiText(inputProps.placeholder, isDe)
      : inputProps.placeholder;

  return (
    <View>
      <Text style={{ color: colors.dark ? "#C7D3F3" : "#3F587F", fontSize: 12, fontWeight: "800", marginBottom: 5 }}>{translatedLabel}</Text>
      <TextInput
        {...inputProps}
        placeholder={translatedPlaceholder}
        placeholderTextColor={inputProps.placeholderTextColor ?? (colors.dark ? "#6B6B7A" : "#8A97B2")}
        style={[
          {
            borderRadius: 13,
            borderWidth: 1,
            borderColor: colors.dark ? "#2A3B5E" : "#C8D6EE",
            backgroundColor: colors.dark ? colors.surfaceAlt : "#F7FAFF",
            color: colors.text,
            paddingHorizontal: 12,
            paddingVertical: 11,
            fontWeight: "600",
            fontSize: 14,
          },
          style,
        ]}
      />
      {!!translatedHelp && <Text style={{ color: colors.dark ? "#8192BC" : "#7283A3", marginTop: 4, fontSize: 11 }}>{translatedHelp}</Text>}
    </View>
  );
}
