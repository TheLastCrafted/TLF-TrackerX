import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";

type WatchlistContextValue = {
  chartIds: string[];
  coinIds: string[];
  toggleChart: (chartId: string) => void;
  toggleCoin: (coinId: string) => void;
  isChartSaved: (chartId: string) => boolean;
  isCoinSaved: (coinId: string) => boolean;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider(props: { children: ReactNode }) {
  const [chartIds, setChartIds] = useState<string[]>([]);
  const [coinIds, setCoinIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadPersistedJson<{ chartIds: string[]; coinIds: string[] }>("watchlist", {
        chartIds: [],
        coinIds: [],
      });
      if (!alive) return;
      setChartIds(Array.isArray(saved.chartIds) ? saved.chartIds : []);
      setCoinIds(Array.isArray(saved.coinIds) ? saved.coinIds : []);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePersistedJson("watchlist", { chartIds, coinIds });
  }, [chartIds, coinIds, hydrated]);

  const value = useMemo<WatchlistContextValue>(() => {
    return {
      chartIds,
      coinIds,
      toggleChart: (chartId: string) => {
        setChartIds((prev) => (prev.includes(chartId) ? prev.filter((id) => id !== chartId) : [...prev, chartId]));
      },
      toggleCoin: (coinId: string) => {
        setCoinIds((prev) => (prev.includes(coinId) ? prev.filter((id) => id !== coinId) : [...prev, coinId]));
      },
      isChartSaved: (chartId: string) => chartIds.includes(chartId),
      isCoinSaved: (coinId: string) => coinIds.includes(coinId),
    };
  }, [chartIds, coinIds]);

  return <WatchlistContext.Provider value={value}>{props.children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return ctx;
}
