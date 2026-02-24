import { useCallback } from "react";
import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";

import { useSettings } from "../state/settings";

export function useHapticPress() {
  const { settings } = useSettings();

  return useCallback(
    (style: "light" | "medium" | "heavy" = "light") => {
      if (!settings.haptics) return;
      if (Platform.OS !== "ios" && Platform.OS !== "android") return;

      const impact =
        style === "heavy"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : style === "medium"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;
      void Haptics.impactAsync(impact).catch(() => {
        if (settings.vibration) Vibration.vibrate(10);
      });
      if (settings.vibration) {
        Vibration.vibrate(10);
      }
    },
    [settings.haptics, settings.vibration]
  );
}
