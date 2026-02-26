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
    background: dark ? (info ? "#090D18" : "#0B1020") : "#F6F8FF",
    surface: dark ? (info ? "#0F1629" : "#121B2F") : "#FFFFFF",
    surfaceElevated: dark ? (info ? "#131C33" : "#17243E") : "#FFFFFF",
    surfaceAlt: dark ? (info ? "#0D1528" : "#101B33") : "#F2F6FF",
    border: dark ? (info ? "#1E2A45" : "#243554") : "#D8E2F5",
    text: dark ? "#EEF2FF" : "#18243A",
    subtext: dark ? "#AAB6D8" : "#627393",
    accent: info ? "#9F85FF" : "#8E67E9",
    accentSoft: info ? (dark ? "#251F46" : "#F0EAFF") : (dark ? "#1D2442" : "#F2ECFF"),
    accentBorder: info ? "#755ED0" : "#6E55C5",
    accent2: info ? "#74BAFF" : "#6AD6C0",
    positive: "#5CE0AB",
    positiveSoft: dark ? "#17352C" : "#DDF7EC",
    negative: "#FF8497",
    negativeSoft: dark ? "#3A1C2A" : "#FFE2E8",
    infoBlue: "#83C8FF",
    warning: "#F5C77A",
    panelBlue: dark ? "#111F3C" : "#EAF2FF",
    panelMint: dark ? "#102A2A" : "#E9FBF6",
    panelRose: dark ? "#2D1A2B" : "#FFEFF4",
    panelAmber: dark ? "#2C2417" : "#FFF5E6",
  };
}
