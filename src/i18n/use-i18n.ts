import { useCallback } from "react";
import { useSettings } from "../state/settings";
import { translateUiText } from "./translate-ui";

export function useI18n() {
  const { settings } = useSettings();
  const isDe = settings.language === "de";
  const t = useCallback((en: string, de: string) => (isDe ? de : en), [isDe]);
  const tx = useCallback((text: string) => translateUiText(text, isDe), [isDe]);
  return { isDe, t, tx, language: settings.language };
}
