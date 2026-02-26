import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useAppColors } from "./use-app-colors";

export function ChartRow(props: {
  title: string;
  subtitle?: string;
  preview?: string;
  onPress: () => void;
  onLongPress?: () => void;
  leading?: ReactNode;
  rightAccessory?: ReactNode;
  previewEmphasis?: boolean;
  isSaved?: boolean;
  onToggleSave?: () => void;
}) {
  const colors = useAppColors();

  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({
        paddingVertical: 15,
        paddingHorizontal: 15,
        borderRadius: 18,
        backgroundColor: pressed ? (colors.dark ? "#17192A" : "#F2F6FF") : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.dark ? "#000000" : "#95A9D8",
        shadowOpacity: colors.dark ? 0.2 : 0.14,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          {!!props.leading && <View>{props.leading}</View>}
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 }}>
            {props.title}
          </Text>
        </View>

        {!!props.rightAccessory && props.rightAccessory}
        {!props.rightAccessory && !!props.onToggleSave && (
          <Pressable
            onPress={props.onToggleSave}
            hitSlop={10}
            style={({ pressed }) => ({
              borderRadius: 999,
              borderWidth: 1,
              borderColor: props.isSaved ? "#4E3A8E" : colors.border,
              backgroundColor: pressed ? (colors.dark ? "#212238" : "#F0F4FF") : props.isSaved ? (colors.dark ? "#221A40" : "#F2ECFF") : colors.surface,
              paddingHorizontal: 11,
              paddingVertical: 7,
            })}
          >
            <Text style={{ color: props.isSaved ? "#7E5BE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>
              {props.isSaved ? "Saved" : "Save"}
            </Text>
          </Pressable>
        )}
      </View>

      {!!props.subtitle && (
        <Text style={{ color: colors.subtext, marginTop: 6, fontSize: 13 }}>
          {props.subtitle}
        </Text>
      )}

      {!!props.preview && (
        <Text
          style={{
            color: colors.accent2,
            marginTop: 6,
            fontSize: props.previewEmphasis ? 16 : 12,
            fontWeight: props.previewEmphasis ? "800" : "700",
          }}
        >
          {props.preview}
        </Text>
      )}
    </Pressable>
  );
}
