import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type AppMode = "informational" | "personal";

type AppModeContextValue = {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider(props: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>("informational");

  const value = useMemo<AppModeContextValue>(() => {
    return {
      mode,
      setMode,
      toggleMode: () => {
        setMode((prev) => (prev === "informational" ? "personal" : "informational"));
      },
    };
  }, [mode]);

  return <AppModeContext.Provider value={value}>{props.children}</AppModeContext.Provider>;
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (ctx) return ctx;
  return {
    mode: "informational" as AppMode,
    setMode: () => {},
    toggleMode: () => {},
  };
}
