import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Platform } from "react-native";
import { fetchCoinGeckoMarkets } from "../data/coingecko";
import { fetchYahooQuotes } from "../data/quotes";
import {
  getNotificationPermissionState,
  NotificationPermissionState,
  requestNotificationPermission,
  sendLocalNotification,
} from "../lib/notifications-safe";
import { useSettings } from "./settings";

export type PriceAlert = {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  kind: "crypto" | "stock" | "etf";
  mode: "price" | "relative_change";
  targetPrice?: number;
  direction: "above" | "below";
  relativeChangePct?: number;
  baselinePrice?: number;
  coinGeckoId?: string;
  triggered: boolean;
  triggerPrice?: number;
  lastPrice?: number;
  lastCheckedAt?: number;
  createdAt: number;
};

type PriceAlertContextValue = {
  alerts: PriceAlert[];
  addAlert: (input: {
    assetId: string;
    symbol: string;
    name: string;
    kind?: "crypto" | "stock" | "etf";
    mode?: "price" | "relative_change";
    targetPrice?: number;
    direction: "above" | "below";
    relativeChangePct?: number;
    baselinePrice?: number;
    coinGeckoId?: string;
  }) => void;
  removeAlert: (id: string) => void;
  markTriggered: (id: string) => void;
  clearTriggered: () => void;
  notificationPermission: NotificationPermissionState;
  requestNotificationAccess: () => Promise<NotificationPermissionState>;
  sendTestNotification: () => Promise<boolean>;
};

const PriceAlertContext = createContext<PriceAlertContextValue | null>(null);

let alertId = 1;
function nextId() {
  alertId += 1;
  return `price_alert_${alertId}`;
}

function formatMoney(value: number, currency: "USD" | "EUR", language: "en" | "de"): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

function formatPctCompact(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  return `${value >= 0 ? "+" : "-"}${abs.toFixed(abs >= 10 ? 1 : 2)}%`;
}

export function PriceAlertProvider(props: { children: ReactNode }) {
  const { settings } = useSettings();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>("unknown");

  useEffect(() => {
    void getNotificationPermissionState().then(setNotificationPermission);
  }, []);

  useEffect(() => {
    if (!settings.priceAlerts) return;
    if (!alerts.some((row) => !row.triggered)) return;

    let alive = true;
    let inFlight = false;
    const everyMs = Math.max(Platform.OS === "web" ? 60 : 15, settings.refreshSeconds) * 1000;

    async function pollAndCheck() {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const active = alerts.filter((row) => !row.triggered);
        if (!active.length) return;

        const cgIds = Array.from(
          new Set(
            active
              .filter((row) => row.kind === "crypto")
              .map((row) => row.coinGeckoId || row.assetId)
              .filter((id): id is string => Boolean(id))
          )
        );
        const equitySymbols = Array.from(new Set(active.filter((row) => row.kind !== "crypto").map((row) => row.symbol.trim().toUpperCase()).filter(Boolean)));

        const [cgRows, eqRows] = await Promise.allSettled([
          cgIds.length
            ? fetchCoinGeckoMarkets({
                ids: cgIds,
                vsCurrency: settings.currency.toLowerCase() as "usd" | "eur",
                useCache: true,
                cacheTtlMs: 20_000,
              })
            : Promise.resolve([]),
          equitySymbols.length ? fetchYahooQuotes(equitySymbols) : Promise.resolve([]),
        ]);

        const cgPriceById = new Map<string, number>(
          (cgRows.status === "fulfilled" ? cgRows.value : [])
            .filter((row) => Number.isFinite(row.current_price))
            .map((row) => [row.id, row.current_price])
        );
        const eqPriceBySymbol = new Map<string, number>(
          (eqRows.status === "fulfilled" ? eqRows.value : [])
            .filter((row) => Number.isFinite(row.price))
            .map((row) => [row.symbol.toUpperCase(), row.price])
        );

        const now = Date.now();
        const triggeredMessages: { title: string; body: string; data: Record<string, unknown> }[] = [];

        setAlerts((prev) =>
          prev.map((row) => {
            if (row.triggered) return row;

            const resolvedPrice =
              row.kind === "crypto"
                ? cgPriceById.get(row.coinGeckoId || row.assetId)
                : eqPriceBySymbol.get(row.symbol.toUpperCase());
            const currentPrice = Number(resolvedPrice);
            if (!Number.isFinite(currentPrice)) return row;

            let next = { ...row, lastPrice: currentPrice, lastCheckedAt: now };
            if (!Number.isFinite(next.baselinePrice)) {
              next = { ...next, baselinePrice: currentPrice };
            }

            let hit = false;
            if (next.mode === "price") {
              if (Number.isFinite(next.targetPrice)) {
                hit =
                  next.direction === "above"
                    ? currentPrice >= Number(next.targetPrice)
                    : currentPrice <= Number(next.targetPrice);
              }
            } else {
              const base = Number(next.baselinePrice);
              const threshold = Math.abs(Number(next.relativeChangePct ?? 0));
              if (base > 0 && threshold > 0) {
                const changePct = ((currentPrice - base) / base) * 100;
                hit = next.direction === "above" ? changePct >= threshold : changePct <= -threshold;
              }
            }

            if (!hit) return next;

            const comparator = next.direction === "above" ? ">=" : "<=";
            const targetText =
              next.mode === "price"
                ? `${comparator} ${formatMoney(Number(next.targetPrice), settings.currency, settings.language)}`
                : `${next.direction === "above" ? "+" : "-"}${Math.abs(Number(next.relativeChangePct)).toFixed(2)}%`;
            const title = `${next.symbol.toUpperCase()} Price Alert`;
            const body =
              next.mode === "price"
                ? `Target: ${targetText}\nNow: ${formatMoney(currentPrice, settings.currency, settings.language)}`
                : `Move: ${targetText} from baseline\nNow: ${formatMoney(currentPrice, settings.currency, settings.language)} (${formatPctCompact(((currentPrice - Number(next.baselinePrice || currentPrice)) / Math.max(Number(next.baselinePrice || currentPrice), 1e-9)) * 100)})`;
            triggeredMessages.push({
              title,
              body,
              data: {
                type: "price_alert",
                alertId: next.id,
                symbol: next.symbol,
                mode: next.mode,
                direction: next.direction,
                target: next.mode === "price" ? Number(next.targetPrice) : Number(next.relativeChangePct),
                currentPrice,
              },
            });
            return { ...next, triggered: true, triggerPrice: currentPrice };
          })
        );

        if (settings.priceAlerts && triggeredMessages.length) {
          let delivered = 0;
          for (const msg of triggeredMessages) {
            const ok = await sendLocalNotification({ title: msg.title, body: msg.body, data: msg.data });
            if (ok) delivered += 1;
          }
          if (delivered === 0) {
            const first = triggeredMessages[0];
            Alert.alert(first.title, first.body);
          }
        }
      } finally {
        inFlight = false;
      }
    }

    void pollAndCheck();
    const timer = setInterval(() => {
      void pollAndCheck();
    }, everyMs);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [alerts, settings.currency, settings.language, settings.priceAlerts, settings.refreshSeconds]);

  const value = useMemo<PriceAlertContextValue>(() => {
    return {
      alerts,
      addAlert: (input) => {
        if (!input.assetId) return;
        const mode = input.mode ?? "price";
        if (mode === "price" && (!Number.isFinite(input.targetPrice) || Number(input.targetPrice) <= 0)) return;
        if (mode === "relative_change" && (!Number.isFinite(input.relativeChangePct) || Math.abs(Number(input.relativeChangePct)) <= 0)) return;
        setAlerts((prev) => [
          ...prev,
          {
            id: nextId(),
            assetId: input.assetId,
            symbol: input.symbol,
            name: input.name,
            kind: input.kind ?? "crypto",
            mode,
            targetPrice: mode === "price" ? Number(input.targetPrice) : undefined,
            direction: input.direction,
            relativeChangePct: mode === "relative_change" ? Math.abs(Number(input.relativeChangePct)) : undefined,
            baselinePrice: Number.isFinite(input.baselinePrice) ? Number(input.baselinePrice) : undefined,
            coinGeckoId: input.coinGeckoId,
            triggered: false,
            createdAt: Date.now(),
          },
        ]);
      },
      removeAlert: (id) => {
        setAlerts((prev) => prev.filter((row) => row.id !== id));
      },
      markTriggered: (id) => {
        setAlerts((prev) => prev.map((row) => (row.id === id ? { ...row, triggered: true } : row)));
      },
      clearTriggered: () => {
        setAlerts((prev) => prev.filter((row) => !row.triggered));
      },
      notificationPermission,
      requestNotificationAccess: async () => {
        const state = await requestNotificationPermission();
        setNotificationPermission(state);
        return state;
      },
      sendTestNotification: async () => {
        let state = await getNotificationPermissionState();
        if (state !== "granted") {
          state = await requestNotificationPermission();
          setNotificationPermission(state);
        }
        if (state !== "granted") return false;

        const ok = await sendLocalNotification({
          title: "TrackerX Notifications",
          body: "Alerts are enabled and ready.",
          data: { type: "test" },
        });
        if (ok) return true;
        state = await getNotificationPermissionState();
        setNotificationPermission(state);
        return false;
      },
    };
  }, [alerts, notificationPermission]);

  return <PriceAlertContext.Provider value={value}>{props.children}</PriceAlertContext.Provider>;
}

export function usePriceAlerts() {
  const ctx = useContext(PriceAlertContext);
  if (!ctx) throw new Error("usePriceAlerts must be used inside PriceAlertProvider");
  return ctx;
}
