import { useSettings } from "../state/settings";

export function useI18n() {
  const { settings } = useSettings();
  const isDe = settings.language === "de";
  const t = (en: string, de: string) => (isDe ? de : en);
  return { isDe, t, language: settings.language };
}

