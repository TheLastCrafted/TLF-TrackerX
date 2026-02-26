import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type AppLanguage = "en" | "de";
export type AppCurrency = "USD" | "EUR";
export type ChartMode = "simple" | "pro";
export type ChartTheme = "dark" | "light";
export type AppAppearance = "system" | "dark" | "light";
export type SimpleChartType = "line" | "bar";
export type SimpleDensity = "low" | "medium" | "high";
export type FocusRegion = "Global" | "US" | "EU";
export type WorkspaceMode = "hybrid" | "institutional" | "personal";

export type AppSettings = {
  language: AppLanguage;
  currency: AppCurrency;
  appAppearance: AppAppearance;
  chartModeDefault: ChartMode;
  chartTheme: ChartTheme;
  chartInterval: "5" | "15" | "60" | "240" | "D";
  focusRegion: FocusRegion;
  defaultTimeframeDays: 1 | 7 | 30 | 365 | 1825 | 3650 | 7300 | 18250;
  refreshSeconds: 5 | 10 | 15 | 30;
  simpleChartTypeDefault: SimpleChartType;
  simpleChartDensity: SimpleDensity;
  simpleChartArea: boolean;
  simpleChartCurved: boolean;
  simpleChartPoints: boolean;
  simpleChartNormalize: boolean;
  simpleChartShowLabels: boolean;
  showVolumeOnProChart: boolean;
  showIndicatorsOnProChart: boolean;
  showWatchlistFirst: boolean;
  showPortfolioCards: boolean;
  showMarketBreadth: boolean;
  compactNumbers: boolean;
  haptics: boolean;
  soundEffects: boolean;
  vibration: boolean;
  confirmDangerousActions: boolean;
  biometricLock: boolean;
  autoRefresh: boolean;
  priceAlerts: boolean;
  macroAlerts: boolean;
  newsAlerts: boolean;
  weeklyDigest: boolean;
  aiInsights: boolean;
  showAdvancedStats: boolean;
  showChartCrosshair: boolean;
  syncAcrossDevices: boolean;
  privacyMode: boolean;
  crashReports: boolean;
  analytics: boolean;
  institutionalMode: boolean;
  workspaceMode: WorkspaceMode;
};

type SettingsContextValue = {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

const defaultSettings: AppSettings = {
  language: "en",
  currency: "USD",
  appAppearance: "system",
  chartModeDefault: "pro",
  chartTheme: "dark",
  chartInterval: "60",
  focusRegion: "Global",
  defaultTimeframeDays: 30,
  refreshSeconds: 5,
  simpleChartTypeDefault: "line",
  simpleChartDensity: "medium",
  simpleChartArea: true,
  simpleChartCurved: true,
  simpleChartPoints: false,
  simpleChartNormalize: false,
  simpleChartShowLabels: true,
  showVolumeOnProChart: true,
  showIndicatorsOnProChart: true,
  showWatchlistFirst: false,
  showPortfolioCards: true,
  showMarketBreadth: true,
  compactNumbers: true,
  haptics: false,
  soundEffects: false,
  vibration: true,
  confirmDangerousActions: true,
  biometricLock: false,
  autoRefresh: true,
  priceAlerts: true,
  macroAlerts: true,
  newsAlerts: false,
  weeklyDigest: true,
  aiInsights: false,
  showAdvancedStats: true,
  showChartCrosshair: true,
  syncAcrossDevices: false,
  privacyMode: false,
  crashReports: true,
  analytics: true,
  institutionalMode: false,
  workspaceMode: "hybrid",
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider(props: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const value = useMemo<SettingsContextValue>(() => {
    return {
      settings,
      update: (key, value) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
      },
    };
  }, [settings]);

  return <SettingsContext.Provider value={value}>{props.children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
