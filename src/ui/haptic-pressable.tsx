import { Pressable, type PressableProps } from "react-native";
import { useHapticPress } from "./use-haptic-press";

export function HapticPressable(props: PressableProps & { hapticStyle?: "light" | "medium" | "heavy" }) {
  const haptic = useHapticPress();

  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        haptic(props.hapticStyle ?? "light");
        props.onPressIn?.(e);
      }}
    />
  );
}
