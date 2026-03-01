import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { fetchCoinGeckoMarkets } from "../data/coingecko";
import { fetchStockQuoteSnapshot } from "../data/stocks-live";
import { useSettings } from "./settings";

type WatchlistContextValue = {
  chartIds: string[];
  coinIds: string[];
  equitySymbols: string[];
  toggleChart: (chartId: string) => void;
  toggleCoin: (coinId: string) => void;
  toggleEquity: (symbol: string) => void;
  isChartSaved: (chartId: string) => boolean;
  isCoinSaved: (coinId: string) => boolean;
  isEquitySaved: (symbol: string) => boolean;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider(props: { children: ReactNode }) {
  const { settings } = useSettings();
  const [chartIds, setChartIds] = useState<string[]>([]);
  const [coinIds, setCoinIds] = useState<string[]>([]);
  const [equitySymbols, setEquitySymbols] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadPersistedJson<{ chartIds: string[]; coinIds: string[]; equitySymbols?: string[] }>("watchlist", {
        chartIds: [],
        coinIds: [],
        equitySymbols: [],
      });
      if (!alive) return;
      setChartIds(Array.isArray(saved.chartIds) ? saved.chartIds : []);
      setCoinIds(Array.isArray(saved.coinIds) ? saved.coinIds : []);
      setEquitySymbols(
        Array.isArray(saved.equitySymbols)
          ? saved.equitySymbols.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
          : []
      );
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePersistedJson("watchlist", { chartIds, coinIds, equitySymbols });
  }, [chartIds, coinIds, equitySymbols, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!settings.autoRefresh) return;
    let alive = true;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (!alive || inFlight) return;
      if (!coinIds.length && !equitySymbols.length) return;
      inFlight = true;
      try {
        const preferCache = Platform.OS === "web";
        await Promise.all([
          coinIds.length
            ? fetchCoinGeckoMarkets({
                ids: coinIds,
                vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
                useCache: preferCache,
              })
            : Promise.resolve([]),
          equitySymbols.length
            ? fetchStockQuoteSnapshot(equitySymbols, {
                useCache: preferCache,
                cacheTtlMs: preferCache ? 45_000 : 10_000,
                enrich: false,
              })
            : Promise.resolve([]),
        ]);
      } catch {
        // Best effort background refresh.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const everyMs = Math.max(Platform.OS === "web" ? 30 : 30, settings.refreshSeconds) * 1000;
    timer = setInterval(() => {
      void tick();
    }, everyMs);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [coinIds, equitySymbols, hydrated, settings.autoRefresh, settings.currency, settings.refreshSeconds]);

  const value = useMemo<WatchlistContextValue>(() => {
    return {
      chartIds,
      coinIds,
      equitySymbols,
      toggleChart: (chartId: string) => {
        setChartIds((prev) => (prev.includes(chartId) ? prev.filter((id) => id !== chartId) : [...prev, chartId]));
      },
      toggleCoin: (coinId: string) => {
        setCoinIds((prev) => (prev.includes(coinId) ? prev.filter((id) => id !== coinId) : [...prev, coinId]));
      },
      toggleEquity: (symbol: string) => {
        const key = symbol.trim().toUpperCase();
        if (!key) return;
        setEquitySymbols((prev) => (prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]));
      },
      isChartSaved: (chartId: string) => chartIds.includes(chartId),
      isCoinSaved: (coinId: string) => coinIds.includes(coinId),
      isEquitySaved: (symbol: string) => equitySymbols.includes(symbol.trim().toUpperCase()),
    };
  }, [chartIds, coinIds, equitySymbols]);

  return <WatchlistContext.Provider value={value}>{props.children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return ctx;
}
