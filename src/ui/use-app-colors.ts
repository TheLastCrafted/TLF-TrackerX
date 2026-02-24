import { useColorScheme } from "react-native";

import { useAppMode } from "../state/app-mode";
import { useSettings } from "../state/settings";

export function useAppColors() {
  const { settings } = useSettings();
  const { mode: appMode } = useAppMode();
  const device = useColorScheme();
  const mode = settings.appAppearance === "system" ? (device ?? "dark") : settings.appAppearance;
  const dark = mode === "dark";
  const info = appMode === "informational";

  return {
    dark,
    background: dark ? "#090A11" : "#F4F7FF",
    surface: dark ? "#0F0F16" : "#FFFFFF",
    border: dark ? "#1A1A24" : "#D7E0F0",
    text: dark ? "#EEF1FF" : "#172338",
    subtext: dark ? "#AAB2CF" : "#5F6F8A",
    accent: info ? "#A98BFF" : "#8E63F0",
  };
}
