import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type CommandCenterContextValue = {
  open: boolean;
  openCenter: () => void;
  closeCenter: () => void;
  toggleCenter: () => void;
};

const CommandCenterContext = createContext<CommandCenterContextValue | null>(null);

export function CommandCenterProvider(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const value = useMemo<CommandCenterContextValue>(() => {
    return {
      open,
      openCenter: () => setOpen(true),
      closeCenter: () => setOpen(false),
      toggleCenter: () => setOpen((v) => !v),
    };
  }, [open]);

  return <CommandCenterContext.Provider value={value}>{props.children}</CommandCenterContext.Provider>;
}

export function useCommandCenter() {
  const ctx = useContext(CommandCenterContext);
  if (!ctx) throw new Error("useCommandCenter must be used inside CommandCenterProvider");
  return ctx;
}
