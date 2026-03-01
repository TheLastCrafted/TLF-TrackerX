import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useIsFocused } from "@react-navigation/native";
import Svg, { Circle, G } from "react-native-svg";

import { FINANCIAL_ASSETS, FINANCIAL_ASSETS_BY_ID, FinancialAssetKind } from "../../src/catalog/financial-assets";
import { searchUniversalAssets, UniversalAsset } from "../../src/data/asset-search";
import { fetchCoinGeckoMarkets, resolveCoinGeckoIdBySymbol } from "../../src/data/coingecko";
import { fetchYahooQuotes } from "../../src/data/quotes";
import { useI18n } from "../../src/i18n/use-i18n";
import { mapRowsToPortfolioTransactions, pickLocalImportFile, readImportRowsFromAsset } from "../../src/lib/file-import";
import { usePriceAlerts } from "../../src/state/price-alerts";
import { useFinanceTools } from "../../src/state/finance-tools";
import { useSettings } from "../../src/state/settings";
import { useSubscriptionAccess } from "../../src/state/subscription-access";
import { FormInput } from "../../src/ui/form-input";
import { ActionButton } from "../../src/ui/action-button";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SubscriptionLockedScreen } from "../../src/ui/subscription-locked-screen";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function toMoney(value: number, currency: "USD" | "EUR", locale: "en" | "de"): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function parseLocaleNumber(input: string): number {
  const normalized = input.trim().replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function normalizeCurrency(input?: string | null): "USD" | "EUR" | null {
  const up = String(input ?? "").trim().toUpperCase();
  if (up === "USD" || up === "EUR") return up;
  return null;
}

function convertCurrencyAmount(value: number, from: "USD" | "EUR", to: "USD" | "EUR", usdPerEur: number): number {
  if (!Number.isFinite(value)) return NaN;
  if (from === to) return value;
  if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) return value;
  return from === "EUR" ? value * usdPerEur : value / usdPerEur;
}

type AssetFilter = "All" | FinancialAssetKind;
const COMMON_COINGECKO_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  BNB: "binancecoin",
  MATIC: "matic-network",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  ATOM: "cosmos",
  UNI: "uniswap",
};

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const { canAccessRoute } = useSubscriptionAccess();
  const { holdings, transactions, addHolding, updateHolding, removeHolding, addTransaction, removeTransaction } = useFinanceTools();
  const { settings } = useSettings();
  const colors = useAppColors();
  const { addAlert } = usePriceAlerts();
  const { t, tx } = useI18n();
  const isFocused = useIsFocused();

  const [compactHeader, setCompactHeader] = useState(false);
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("All");
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(FINANCIAL_ASSETS[0]?.id ?? "");
  const [selectedExternal, setSelectedExternal] = useState<UniversalAsset | null>(null);
  const [remoteResults, setRemoteResults] = useState<UniversalAsset[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [showTransactionsPanel, setShowTransactionsPanel] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showAllocationPie, setShowAllocationPie] = useState(true);
  const [showExpandedView, setShowExpandedView] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });
  const [quantity, setQuantity] = useState("1");
  const [avgCost, setAvgCost] = useState("0");
  const [purchaseCurrency, setPurchaseCurrency] = useState<"USD" | "EUR">(settings.currency);

  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
  const [equityPrices, setEquityPrices] = useState<Record<string, number>>({});
  const [equityPriceCurrency, setEquityPriceCurrency] = useState<Record<string, "USD" | "EUR">>({});
  const [usdPerEur, setUsdPerEur] = useState(1.08);
  const resolvedLiveRef = useRef<Set<string>>(new Set());
  const resolvingLiveRef = useRef<Set<string>>(new Set());
  const retryAfterRef = useRef<Map<string, number>>(new Map());
  const [txSymbol, setTxSymbol] = useState("");
  const [txSide, setTxSide] = useState<"buy" | "sell">("buy");
  const [txQty, setTxQty] = useState("1");
  const [txPrice, setTxPrice] = useState("0");
  const [txFee, setTxFee] = useState("0");
  const [addStatus, setAddStatus] = useState<string | null>(null);

  useEffect(() => {
    setPurchaseCurrency(settings.currency);
  }, [settings.currency]);

  const pollCryptoPrices = useMemo(() => {
    return async (aliveCheck?: () => boolean) => {
      const isAlive = () => (aliveCheck ? aliveCheck() : true);
      const mappedIds = holdings
        .filter((h) => h.kind === "crypto")
        .map((h) => h.coinGeckoId || FINANCIAL_ASSETS_BY_ID[h.assetId ?? ""]?.coinGeckoId)
        .filter((id): id is string => Boolean(id));
      const unresolved = holdings.filter((h) => h.kind === "crypto" && !(h.coinGeckoId || FINANCIAL_ASSETS_BY_ID[h.assetId ?? ""]?.coinGeckoId));
      const ids = Array.from(new Set(mappedIds));
      if (!ids.length) {
        if (isAlive()) setCryptoPrices({});
      } else {
        try {
          const rows = await fetchCoinGeckoMarkets({ ids, vsCurrency: settings.currency.toLowerCase() as "usd" | "eur", useCache: true, cacheTtlMs: 10000 });
          if (!isAlive()) return;
          const fresh = Object.fromEntries(rows.map((r) => [r.id, r.current_price]));
          setCryptoPrices((prev) => {
            const next: Record<string, number> = {};
            for (const id of ids) {
              const value = fresh[id];
              if (Number.isFinite(value)) next[id] = value;
              else if (Number.isFinite(prev[id])) next[id] = prev[id];
            }
            return next;
          });
        } catch {
          // Keep last known values on transient failures/rate limits.
        }
      }

      // Resolve missing CoinGecko IDs in background; do not block live price fetch.
      for (const h of unresolved) {
        const key = `cg:${h.id}`;
        if (resolvedLiveRef.current.has(key) || resolvingLiveRef.current.has(key)) continue;
        const retryAt = retryAfterRef.current.get(key) ?? 0;
        if (Date.now() < retryAt) continue;
        resolvingLiveRef.current.add(key);
        void (async () => {
          try {
            const directId = COMMON_COINGECKO_BY_SYMBOL[h.symbol.trim().toUpperCase()];
            if (directId) {
              updateHolding(h.id, { coinGeckoId: directId });
              resolvedLiveRef.current.add(key);
              retryAfterRef.current.delete(key);
              return;
            }
            const resolved = await resolveCoinGeckoIdBySymbol(h.symbol, h.name);
            if (resolved) {
              updateHolding(h.id, { coinGeckoId: resolved });
              resolvedLiveRef.current.add(key);
              retryAfterRef.current.delete(key);
              return;
            }
            const query = `${h.symbol} ${h.name}`.trim();
            const rows = await searchUniversalAssets(query, 8);
            const hit = rows.find((r) => r.kind === "crypto" && r.coinGeckoId);
            if (hit?.coinGeckoId) {
              updateHolding(h.id, { coinGeckoId: hit.coinGeckoId });
              resolvedLiveRef.current.add(key);
              retryAfterRef.current.delete(key);
              return;
            }
            retryAfterRef.current.set(key, Date.now() + 120_000);
          } catch {
            retryAfterRef.current.set(key, Date.now() + 120_000);
          } finally {
            resolvingLiveRef.current.delete(key);
          }
        })();
      }
    };
  }, [holdings, settings.currency, updateHolding]);

  const pollEquityPrices = useMemo(() => {
    return async (aliveCheck?: () => boolean) => {
      const isAlive = () => (aliveCheck ? aliveCheck() : true);
      const rowsNoCrypto = holdings.filter((h) => h.kind !== "crypto");
      let symbols = Array.from(new Set(rowsNoCrypto.map((h) => (h.quoteSymbol || h.symbol).toUpperCase()).filter(Boolean)));
      if (!symbols.length) {
        if (isAlive()) setEquityPrices({});
        if (isAlive()) setEquityPriceCurrency({});
        return;
      }
      try {
        let rows = await fetchYahooQuotes(symbols);
        const found = new Set(rows.map((row) => row.symbol.toUpperCase()));
        const missing = rowsNoCrypto.filter((h) => !found.has((h.quoteSymbol || h.symbol).toUpperCase()));

        for (const h of missing) {
          const key = `yf:${h.id}`;
          if (resolvedLiveRef.current.has(key)) continue;
          const retryAt = retryAfterRef.current.get(key) ?? 0;
          if (Date.now() < retryAt) continue;
          try {
            const query = `${h.symbol} ${h.name}`.trim();
            const searchRows = await searchUniversalAssets(query, 10);
            const hit = searchRows.find((r) => r.kind !== "crypto" && r.symbol);
            if (hit?.symbol) {
              updateHolding(h.id, { quoteSymbol: hit.symbol.toUpperCase() });
              symbols.push(hit.symbol.toUpperCase());
              resolvedLiveRef.current.add(key);
              retryAfterRef.current.delete(key);
            }
          } catch {
            retryAfterRef.current.set(key, Date.now() + 120_000);
          }
        }
        symbols = Array.from(new Set(symbols));
        if (symbols.length !== found.size) {
          rows = await fetchYahooQuotes(symbols);
        }
        if (!isAlive()) return;
        const fresh = Object.fromEntries(rows.map((row) => [row.symbol.toUpperCase(), row.price]));
        const freshCurrency = Object.fromEntries(
          rows.map((row) => [row.symbol.toUpperCase(), normalizeCurrency(row.currency)])
        ) as Record<string, "USD" | "EUR" | null>;
        setEquityPrices((prev) => {
          const next: Record<string, number> = {};
          for (const symbol of symbols) {
            const value = fresh[symbol];
            if (Number.isFinite(value)) next[symbol] = value;
            else if (Number.isFinite(prev[symbol])) next[symbol] = prev[symbol];
          }
          return next;
        });
        setEquityPriceCurrency((prev) => {
          const next: Record<string, "USD" | "EUR"> = {};
          for (const symbol of symbols) {
            const fromLive = freshCurrency[symbol];
            if (fromLive === "USD" || fromLive === "EUR") {
              next[symbol] = fromLive;
            } else if (prev[symbol]) {
              next[symbol] = prev[symbol];
            }
          }
          return next;
        });
      } catch {
        // Keep last known values on transient failures.
      }
    };
  }, [holdings, updateHolding]);

  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    const isAlive = () => alive;
    void pollCryptoPrices(isAlive);
    const everyMs = 30_000;
    const timer = setInterval(() => void pollCryptoPrices(isAlive), everyMs);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isFocused, pollCryptoPrices]);

  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    const isAlive = () => alive;
    void pollEquityPrices(isAlive);
    const everyMs = 30_000;
    const timer = setInterval(() => void pollEquityPrices(isAlive), everyMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isFocused, pollEquityPrices]);

  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    const pollFx = async () => {
      try {
        const rows = await fetchYahooQuotes(["EURUSD=X"]);
        if (!alive) return;
        const rate = rows.find((r) => r.symbol.toUpperCase() === "EURUSD=X")?.price ?? rows[0]?.price;
        if (Number.isFinite(rate) && rate > 0) setUsdPerEur(rate);
      } catch {
        // Keep last known FX rate.
      }
    };
    void pollFx();
    const timer = setInterval(() => void pollFx(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isFocused]);

  const onManualRefresh = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await Promise.all([pollCryptoPrices(), pollEquityPrices()]);
    } finally {
      setManualRefreshing(false);
    }
  };

  const matchedAssets = useMemo(() => {
    const scoped = FINANCIAL_ASSETS.filter((asset) => (assetFilter === "All" ? true : asset.kind === assetFilter));
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((asset) => asset.symbol.toLowerCase().includes(q) || asset.name.toLowerCase().includes(q));
  }, [assetFilter, query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      setSearchLoading(false);
      return;
    }
    let alive = true;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void searchUniversalAssets(q, 30)
        .then((rows) => {
          if (!alive) return;
          const filtered = rows.filter((row) => (assetFilter === "All" ? true : row.kind === assetFilter));
          setRemoteResults(filtered);
        })
        .catch(() => {
          if (alive) setRemoteResults([]);
        })
        .finally(() => {
          if (alive) setSearchLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, assetFilter]);

  const selectedAsset = FINANCIAL_ASSETS_BY_ID[selectedAssetId];

  const rows = useMemo(() => {
    return holdings.map((holding) => {
      const catalogAsset = holding.assetId ? FINANCIAL_ASSETS_BY_ID[holding.assetId] : undefined;
      const asset = {
        kind: holding.kind,
        symbol: holding.symbol,
        name: holding.name,
        coinGeckoId: holding.coinGeckoId || catalogAsset?.coinGeckoId,
      };
      const holdingCostCurrency = normalizeCurrency(holding.costCurrency) ?? settings.currency;
      const isLivePrice = asset.kind === "crypto"
        ? Boolean(asset.coinGeckoId && Number.isFinite(cryptoPrices[asset.coinGeckoId]))
        : Number.isFinite(equityPrices[(holding.quoteSymbol || asset.symbol).toUpperCase()]);
      const quoteSymbol = (holding.quoteSymbol || asset.symbol).toUpperCase();
      const marketPriceRaw = asset.kind === "crypto"
        ? (asset.coinGeckoId ? cryptoPrices[asset.coinGeckoId] : undefined)
        : equityPrices[quoteSymbol] ?? holding.manualPrice;
      const marketCurrency = asset.kind === "crypto" ? settings.currency : (equityPriceCurrency[quoteSymbol] ?? settings.currency);
      const avgCostDisplay = convertCurrencyAmount(holding.avgCost, holdingCostCurrency, settings.currency, usdPerEur);
      const marketPrice = Number.isFinite(marketPriceRaw ?? NaN)
        ? convertCurrencyAmount(Number(marketPriceRaw), marketCurrency, settings.currency, usdPerEur)
        : undefined;
      const cost = holding.quantity * avgCostDisplay;
      const value = holding.quantity * (marketPrice ?? avgCostDisplay);
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return { holding, asset, marketPrice, avgCostDisplay, cost, value, pnl, pnlPct, isLivePrice };
    });
  }, [holdings, cryptoPrices, equityPrices, equityPriceCurrency, settings.currency, usdPerEur]);

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const livePriceCount = rows.filter((r) => r.isLivePrice).length;
  const winners = rows.filter((r) => r.pnl >= 0).length;
  const winRate = rows.length ? (winners / rows.length) * 100 : 0;
  const realizedPnl = useMemo(() => {
    const bySymbol = new Map<string, { qty: number; price: number }[]>();
    let realized = 0;
    const ordered = [...transactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    for (const tx of ordered) {
      if (tx.side !== "buy" && tx.side !== "sell") continue;
      const key = tx.symbol.toUpperCase();
      const lots = bySymbol.get(key) ?? [];
      const txCurrency = normalizeCurrency(tx.currency) ?? settings.currency;
      const txPriceDisplay = convertCurrencyAmount(tx.price, txCurrency, settings.currency, usdPerEur);
      const txFeeDisplay = convertCurrencyAmount(tx.fee, txCurrency, settings.currency, usdPerEur);
      if (tx.side === "buy") {
        lots.push({ qty: tx.quantity, price: txPriceDisplay });
        bySymbol.set(key, lots);
        continue;
      }

      let sellQty = tx.quantity;
      let costBasis = 0;
      while (sellQty > 0 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, sellQty);
        costBasis += take * lot.price;
        lot.qty -= take;
        sellQty -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
      const matchedQty = tx.quantity - sellQty;
      if (matchedQty <= 0) continue;
      const proceeds = matchedQty * txPriceDisplay;
      realized += proceeds - costBasis - txFeeDisplay;
      bySymbol.set(key, lots);
    }
    return Number.isFinite(realized) ? realized : 0;
  }, [transactions, settings.currency, usdPerEur]);

  const allocation = useMemo(() => {
    if (totalValue <= 0) return [];
    return rows
      .map((row) => {
        const actual = (row.value / totalValue) * 100;
        return {
          id: row.holding.id,
          symbol: row.asset?.symbol ?? "-",
          name: row.asset?.name ?? row.holding.name,
          kind: row.asset?.kind ?? row.holding.kind,
          actual,
          value: row.value,
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [rows, totalValue]);
  const allocationByKind = useMemo(() => {
    if (totalValue <= 0) return [] as { kind: FinancialAssetKind; pct: number; value: number }[];
    const bucket: Record<FinancialAssetKind, number> = { stock: 0, etf: 0, crypto: 0 };
    for (const row of rows) {
      const kind = row.asset?.kind ?? row.holding.kind;
      bucket[kind] += row.value;
    }
    return (Object.keys(bucket) as FinancialAssetKind[])
      .map((kind) => ({ kind, value: bucket[kind], pct: (bucket[kind] / totalValue) * 100 }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [rows, totalValue]);
  const largest = allocation[0];
  const smallest = allocation[allocation.length - 1];
  const effectivePositions = useMemo(() => {
    if (totalValue <= 0) return 0;
    const hhi = rows.reduce((sum, row) => {
      const w = row.value / totalValue;
      return sum + w * w;
    }, 0);
    return hhi > 0 ? 1 / hhi : 0;
  }, [rows, totalValue]);
  const pieSegments = useMemo(() => {
    const palette = ["#8E63F0", "#79B9FF", "#6FD6C8", "#F4A261", "#F08BA1", "#A3C16F", "#B0A4FF", "#7DC4E4"];
    return allocation.slice(0, 8).map((row, index) => ({
      ...row,
      color: palette[index % palette.length],
    }));
  }, [allocation]);
  const pieRadius = 44;
  const pieStroke = 12;
  const pieCircumference = 2 * Math.PI * pieRadius;
  const largestAllocationPct = largest?.actual ?? 0;
  const avgPositionValue = rows.length ? totalValue / rows.length : 0;
  const missingLiveQuotes = Math.max(rows.length - livePriceCount, 0);
  const bestHoldings = useMemo(() => [...rows].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 3), [rows]);
  const weakestHoldings = useMemo(() => [...rows].sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 3), [rows]);
  const kindIcon = (kind: FinancialAssetKind): keyof typeof MaterialIcons.glyphMap => {
    if (kind === "crypto") return "currency-bitcoin";
    if (kind === "etf") return "pie-chart";
    return "show-chart";
  };

  const importTransactions = async () => {
    setImportStatus(null);
    setImportBusy(true);
    try {
      const picked = await pickLocalImportFile();
      if (!picked.ok) {
        setImportStatus(picked.message);
        return;
      }
      const loaded = await readImportRowsFromAsset(picked.asset);
      if (!loaded.ok) {
        setImportStatus(loaded.message);
        return;
      }
      const mapped = mapRowsToPortfolioTransactions(loaded.rows);
      mapped.transactions.forEach((tx) => addTransaction({ ...tx, currency: settings.currency }));
      setImportStatus(`${t("Imported", "Importiert")} ${mapped.transactions.length} ${t("transactions", "Transaktionen")}. ${t("Skipped", "Uebersprungen")}: ${mapped.skipped}.`);
    } catch {
      setImportStatus(t("Import failed. Try a broker CSV/XLSX export.", "Import fehlgeschlagen. Bitte Broker-CSV/XLSX verwenden."));
    } finally {
      setImportBusy(false);
    }
  };

  if (!canAccessRoute("portfolio")) return <SubscriptionLockedScreen route="portfolio" title="Portfolio" />;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={() => {
            void onManualRefresh();
          }}
          {...refreshControlProps(colors, t("Refreshing portfolio...", "Portfolio wird aktualisiert..."))}
        />
      }
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 120)}
      scrollEventThrottle={16}
    >
      <RefreshFeedback refreshing={manualRefreshing} colors={colors} label={t("Refreshing portfolio data...", "Portfolio-Daten werden aktualisiert...")} />
      {compactHeader && (
        <View
          style={{
            position: "absolute",
            top: insets.top + 6,
            left: SCREEN_HORIZONTAL_PADDING,
            right: SCREEN_HORIZONTAL_PADDING,
            zIndex: 30,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.dark ? "rgba(15,16,24,0.96)" : "rgba(255,255,255,0.96)",
            paddingHorizontal: 12,
            paddingVertical: 9,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>{tx("Portfolio")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{rows.length} {t("holdings", "Positionen")}</Text>
        </View>
      )}

      <TabHeader
        title={tx("Portfolio")}
        subtitle={t(
          "Track holdings, live value, P&L, and allocation across stocks, ETFs, and crypto.",
          "Verfolge Positionen, Live-Wert, P&L und Allokation ueber Aktien, ETFs und Krypto."
        )}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Portfolio Value", "Portfolio-Wert")}</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>{toMoney(totalValue, settings.currency, settings.language)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Live Coverage", "Live-Abdeckung")}</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>{livePriceCount}/{rows.length || 0} {t("holdings", "Positionen")}</Text>
          </View>
        </View>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Unrealized P&L", "Unrealisierte P&L")}</Text>
            <Text style={{ color: totalPnl >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>
              {toMoney(totalPnl, settings.currency, settings.language)} ({pct(totalPnlPct)})
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Realized P&L", "Realisierte P&L")}</Text>
            <Text style={{ color: realizedPnl >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>
              {toMoney(realizedPnl, settings.currency, settings.language)}
            </Text>
          </View>
        </View>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Win Rate", "Trefferquote")}</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>
              {rows.length ? `${winRate.toFixed(1)}%` : "-"}
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Diversification", "Diversifikation")}</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>
              {rows.length ? `${effectivePositions.toFixed(1)} ${t("effective positions", "effektive Positionen")}` : "-"}
            </Text>
          </View>
        </View>
        {!!allocation.length && (
          <View style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Allocation Breakdown", "Allokations-Aufschluesselung")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setShowExpandedView((v) => !v)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#8E63F0",
                    backgroundColor: pressed ? (colors.dark ? "#221A3E" : "#F0E9FF") : (colors.dark ? "#1A1630" : "#F5F0FF"),
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  })}
                >
                  <Text style={{ color: "#8E63F0", fontSize: 12, fontWeight: "700" }}>
                    {showExpandedView ? t("Hide expanded", "Erweitert ausblenden") : t("Expand view", "Ansicht erweitern")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowAllocationPie((v) => !v)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#8E63F0",
                    backgroundColor: pressed ? (colors.dark ? "#221A3E" : "#F0E9FF") : (colors.dark ? "#1A1630" : "#F5F0FF"),
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  })}
                >
                  <Text style={{ color: "#8E63F0", fontSize: 12, fontWeight: "700" }}>
                    {showAllocationPie ? t("Hide chart", "Chart ausblenden") : t("Show chart", "Chart anzeigen")}
                  </Text>
                </Pressable>
              </View>
            </View>
            <Text style={{ color: colors.subtext, marginTop: 3, fontSize: 12 }}>
              {t("Largest position", "Groesste Position")}: {largest?.symbol ?? "-"} ({largest ? `${largest.actual.toFixed(2)}%` : "-"})
            </Text>
            {showAllocationPie && (
              <View
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.dark ? "#111728" : "#F8FAFF",
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 104, height: 104, alignItems: "center", justifyContent: "center" }}>
                    <Svg width={104} height={104}>
                      <G rotation="-90" origin="52,52">
                        <Circle cx={52} cy={52} r={pieRadius} stroke={colors.dark ? "#1D2438" : "#E4EAF7"} strokeWidth={pieStroke} fill="none" />
                        {(() => {
                          let offset = 0;
                          return pieSegments.map((slice) => {
                            const arc = (slice.actual / 100) * pieCircumference;
                            const node = (
                              <Circle
                                key={`pie_${slice.id}`}
                                cx={52}
                                cy={52}
                                r={pieRadius}
                                stroke={slice.color}
                                strokeWidth={pieStroke}
                                strokeLinecap="round"
                                fill="none"
                                strokeDasharray={`${arc} ${pieCircumference - arc}`}
                                strokeDashoffset={-offset}
                              />
                            );
                            offset += arc;
                            return node;
                          });
                        })()}
                      </G>
                    </Svg>
                    <View style={{ position: "absolute", alignItems: "center" }}>
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>{allocation.length}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 10 }}>{t("assets", "Assets")}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    {pieSegments.map((slice) => (
                      <View key={`legend_${slice.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1, paddingRight: 6 }}>
                          <View style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: slice.color }} />
                          <MaterialIcons name={kindIcon(slice.kind)} size={12} color={colors.subtext} />
                          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "700", flexShrink: 1 }}>
                            {slice.symbol}
                          </Text>
                        </View>
                        <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: "700" }}>{slice.actual.toFixed(1)}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {showExpandedView && (
          <View style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Holdings Deep View", "Positionen-Detailansicht")}</Text>
            <Text style={{ color: colors.subtext, marginTop: 3, fontSize: 12 }}>
              {t(
                "Additional allocation, concentration, and per-holding health details.",
                "Zusaetzliche Allokations-, Konzentrations- und Positionsqualitaets-Details."
              )}
            </Text>

            <View style={{ marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <View style={{ flexBasis: "48%", flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#121A2C" : "#F6F9FF", padding: 9 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{t("Cost Basis", "Einstandswert")}</Text>
                <Text style={{ color: colors.text, marginTop: 3, fontWeight: "800" }}>{toMoney(totalCost, settings.currency, settings.language)}</Text>
              </View>
              <View style={{ flexBasis: "48%", flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#121A2C" : "#F6F9FF", padding: 9 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{t("Largest Position", "Groesste Position")}</Text>
                <Text style={{ color: colors.text, marginTop: 3, fontWeight: "800" }}>{largest ? `${largest.symbol} ${largestAllocationPct.toFixed(1)}%` : "-"}</Text>
              </View>
              <View style={{ flexBasis: "48%", flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#121A2C" : "#F6F9FF", padding: 9 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{t("Avg Position Size", "Durchschn. Positionsgroesse")}</Text>
                <Text style={{ color: colors.text, marginTop: 3, fontWeight: "800" }}>{toMoney(avgPositionValue, settings.currency, settings.language)}</Text>
              </View>
              <View style={{ flexBasis: "48%", flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#121A2C" : "#F6F9FF", padding: 9 }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{t("Missing Live Quotes", "Fehlende Live-Kurse")}</Text>
                <Text style={{ color: missingLiveQuotes > 0 ? "#F4A261" : "#5CE0AB", marginTop: 3, fontWeight: "800" }}>
                  {missingLiveQuotes}/{rows.length || 0}
                </Text>
              </View>
            </View>

            {!!allocationByKind.length && (
              <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#111728" : "#F8FAFF", padding: 9 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Allocation By Asset Class", "Allokation nach Asset-Klasse")}</Text>
                <View style={{ marginTop: 6, gap: 6 }}>
                  {allocationByKind.map((row) => (
                    <View key={`by_kind_${row.kind}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <MaterialIcons name={kindIcon(row.kind)} size={13} color={colors.subtext} />
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{row.kind.toUpperCase()}</Text>
                      </View>
                      <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: "700" }}>
                        {toMoney(row.value, settings.currency, settings.language)} • {row.pct.toFixed(1)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!!rows.length && (
              <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#111728" : "#F8FAFF", padding: 9 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Top / Bottom Holdings", "Beste / Schwaechste Positionen")}</Text>
                <View style={{ marginTop: 7, gap: 7 }}>
                  {bestHoldings.map((row) => (
                    <View key={`best_${row.holding.id}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 12, fontWeight: "700" }}>{row.asset.symbol} • {row.asset.name}</Text>
                      <Text style={{ color: "#5CE0AB", fontSize: 12, fontWeight: "800" }}>{pct(row.pnlPct)}</Text>
                    </View>
                  ))}
                  {weakestHoldings.map((row) => (
                    <View key={`weak_${row.holding.id}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 12, fontWeight: "700" }}>{row.asset.symbol} • {row.asset.name}</Text>
                      <Text style={{ color: "#FF8497", fontSize: 12, fontWeight: "800" }}>{pct(row.pnlPct)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!!rows.length && (
              <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.dark ? "#111728" : "#F8FAFF", padding: 9 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Holdings Detail", "Positionsdetails")}</Text>
                <Text style={{ color: colors.subtext, marginTop: 3, fontSize: 11 }}>
                  {largest ? `${t("Most concentrated", "Staerkste Konzentration")}: ${largest.symbol}` : "-"} • {smallest ? `${t("Smallest", "Kleinste")}: ${smallest.symbol}` : "-"}
                </Text>
                <View style={{ marginTop: 7, gap: 7 }}>
                  {rows.map((row) => {
                    const alloc = totalValue > 0 ? (row.value / totalValue) * 100 : 0;
                    return (
                      <View key={`detail_${row.holding.id}`} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "800", flex: 1 }}>
                            {row.asset.symbol} • {row.asset.name}
                          </Text>
                          <Text style={{ color: row.isLivePrice ? "#5CE0AB" : "#F4A261", fontSize: 11, fontWeight: "700" }}>
                            {row.isLivePrice ? t("Live", "Live") : t("Fallback", "Fallback")}
                          </Text>
                        </View>
                        <Text style={{ color: colors.subtext, marginTop: 4, fontSize: 11 }}>
                          {t("Value", "Wert")} {toMoney(row.value, settings.currency, settings.language)} • {t("Allocation", "Allokation")} {alloc.toFixed(2)}%
                        </Text>
                        <Text style={{ color: row.pnl >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 2, fontSize: 11, fontWeight: "700" }}>
                          {t("PnL", "P&L")} {toMoney(row.pnl, settings.currency, settings.language)} ({pct(row.pnlPct)})
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        <ActionButton
          label={showHoldingForm ? t("Close Add Position", "Position-Hinzufuegen schliessen") : t("Add Position", "Position hinzufuegen")}
          onPress={() => setShowHoldingForm((v) => !v)}
          style={{ marginBottom: 10 }}
        />

        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          {showHoldingForm ? (
            <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["All", "stock", "etf", "crypto"] as const).map((value) => {
              const active = assetFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setAssetFilter(value)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{value.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>

          <FormInput
            label={t("Universal Asset Search", "Universelle Asset-Suche")}
            value={query}
            onChangeText={setQuery}
            placeholder={t("Search symbol/name globally (stocks, ETFs, crypto)", "Symbol/Name global suchen (Aktien, ETFs, Krypto)")}
            help={t("Type ticker or name (e.g., AAPL, VOO, Bitcoin).", "Ticker oder Namen eingeben (z.B. AAPL, VOO, Bitcoin).")}
            style={{ marginTop: 8 }}
          />

          <Text style={{ color: colors.subtext, marginTop: 6, fontSize: 12 }}>
            {t(
              "Universal search uses Yahoo Finance + CoinGecko for broad coverage across major exchanges.",
              "Universelle Suche nutzt Yahoo Finance + CoinGecko fuer breite Abdeckung ueber grosse Boersen."
            )}
          </Text>

          {!!selectedExternal && (
            <Text style={{ color: colors.text, marginTop: 6, fontSize: 12 }}>
              {t("Selected from universal", "Aus universeller Suche gewaehlt")}: {selectedExternal.symbol} • {selectedExternal.name} • {selectedExternal.kind.toUpperCase()}
            </Text>
          )}

          <View style={{ marginTop: 8, maxHeight: 170 }}>
            <ScrollView nestedScrollEnabled>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {matchedAssets.slice(0, 80).map((asset) => {
                  const active = selectedAssetId === asset.id;
                  return (
                    <Pressable
                      key={asset.id}
                      onPress={() => {
                        setSelectedAssetId(asset.id);
                        setSelectedExternal(null);
                      }}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        borderWidth: 1,
                          borderColor: active ? "#6249BE" : colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#14192A" : "#EDF2FF") : active ? (colors.dark ? "#1B1534" : "#EEE8FF") : colors.surface,
                        paddingHorizontal: 9,
                        paddingVertical: 6,
                      })}
                    >
                      <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontSize: 11, fontWeight: "700" }}>{asset.symbol}</Text>
                    </Pressable>
                  );
                })}
                {remoteResults.slice(0, 40).map((asset) => {
                  const active = selectedExternal?.id === asset.id;
                  return (
                    <Pressable
                      key={asset.id}
                      onPress={() => {
                        setSelectedExternal(asset);
                        setSelectedAssetId("");
                        const externalCurrency = normalizeCurrency(asset.currency);
                        if (externalCurrency) setPurchaseCurrency(externalCurrency);
                        if (asset.lastPrice && Number.isFinite(asset.lastPrice)) {
                          setAvgCost(String(asset.lastPrice));
                        }
                      }}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? "#45A6D1" : colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#122233" : "#EAF5FF") : active ? (colors.dark ? "#102A3A" : "#E8F3FF") : colors.surface,
                        paddingHorizontal: 9,
                        paddingVertical: 6,
                      })}
                    >
                      <Text style={{ color: active ? "#2E7FAD" : colors.subtext, fontSize: 11, fontWeight: "700" }}>
                        {asset.symbol} ({asset.kind.toUpperCase()})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {searchLoading && (
                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color="#83C8FF" />
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Searching global listings...", "Suche globale Listings...")}</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {!!selectedAsset && (
            <Text style={{ color: colors.subtext, marginTop: 6 }}>{selectedAsset.symbol} • {selectedAsset.name} • {selectedAsset.kind.toUpperCase()}</Text>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <FormInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" label={t("Quantity", "Menge")} placeholder={t("e.g. 2.5", "z.B. 2,5")} help={t("How many units/shares you own.", "Wie viele Einheiten/Anteile du besitzt.")} style={{ flex: 1 }} />
            <FormInput
              value={avgCost}
              onChangeText={setAvgCost}
              keyboardType="decimal-pad"
              label={`${t("Average Cost Basis", "Durchschn. Einstandskurs")} (${purchaseCurrency})`}
              placeholder="e.g. 420.50"
              help={`${t("Purchase currency converts into portfolio display currency", "Kaufwaehrung wird automatisch in die Portfolio-Anzeigewaehrung umgerechnet")} (${settings.currency}).`}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ marginTop: 6, flexDirection: "row", gap: 8 }}>
            {(["USD", "EUR"] as const).map((cur) => {
              const active = purchaseCurrency === cur;
              return (
                <Pressable
                  key={`buy_cur_${cur}`}
                  onPress={() => setPurchaseCurrency(cur)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  })}
                >
                  <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{cur}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
            <ActionButton
              label={t("Add To Portfolio", "Zum Portfolio hinzufuegen")}
              onPress={() => {
                if (selectedExternal) {
                  const parsedQty = parseLocaleNumber(quantity);
                  const parsedAvg = parseLocaleNumber(avgCost);
                  if (!(parsedQty > 0) || !(parsedAvg >= 0)) {
                    setAddStatus(t("Enter a valid quantity and cost.", "Bitte gueltige Menge und Kosten eingeben."));
                    return;
                  }
                  const existing = holdings.find(
                    (h) => h.symbol === selectedExternal.symbol.toUpperCase() && h.kind === selectedExternal.kind
                  );
                  const targetCostCurrency = normalizeCurrency(existing?.costCurrency) ?? purchaseCurrency;
                  const avgCostStored = convertCurrencyAmount(parsedAvg, purchaseCurrency, targetCostCurrency, usdPerEur);
                  const lastPriceCurrency = normalizeCurrency(selectedExternal.currency) ?? purchaseCurrency;
                  const manualPrice = Number.isFinite(selectedExternal.lastPrice ?? NaN)
                    ? convertCurrencyAmount(Number(selectedExternal.lastPrice), lastPriceCurrency, settings.currency, usdPerEur)
                    : undefined;
                  addHolding({
                    symbol: selectedExternal.symbol,
                    quoteSymbol: selectedExternal.kind === "crypto" ? undefined : selectedExternal.symbol.toUpperCase(),
                    name: selectedExternal.name,
                    kind: selectedExternal.kind,
                    coinGeckoId: selectedExternal.coinGeckoId,
                    exchange: selectedExternal.exchange,
                    quantity: parsedQty,
                    avgCost: avgCostStored,
                    costCurrency: targetCostCurrency,
                    manualPrice: selectedExternal.kind === "crypto" ? undefined : manualPrice,
                  });
                  setAddStatus(`${t("Added", "Hinzugefuegt")}: ${selectedExternal.symbol.toUpperCase()} ${t("to portfolio.", "zum Portfolio.")}`);
                  setQuantity("1");
                  return;
                }
                if (!selectedAsset) {
                  setAddStatus(t("Select an asset first.", "Bitte zuerst ein Asset waehlen."));
                  return;
                }
                const parsedQty = parseLocaleNumber(quantity);
                const parsedAvg = parseLocaleNumber(avgCost);
                if (!(parsedQty > 0) || !(parsedAvg >= 0)) {
                  setAddStatus(t("Enter a valid quantity and cost.", "Bitte gueltige Menge und Kosten eingeben."));
                  return;
                }
                const existing = holdings.find(
                  (h) => h.symbol === selectedAsset.symbol.toUpperCase() && h.kind === selectedAsset.kind
                );
                const targetCostCurrency = normalizeCurrency(existing?.costCurrency) ?? purchaseCurrency;
                const avgCostStored = convertCurrencyAmount(parsedAvg, purchaseCurrency, targetCostCurrency, usdPerEur);
                  addHolding({
                    assetId: selectedAsset.id,
                    symbol: selectedAsset.symbol,
                    quoteSymbol: selectedAsset.symbol,
                    name: selectedAsset.name,
                    kind: selectedAsset.kind,
                    coinGeckoId: selectedAsset.coinGeckoId,
                    quantity: parsedQty,
                    avgCost: avgCostStored,
                    costCurrency: targetCostCurrency,
                });
                setAddStatus(`${t("Added", "Hinzugefuegt")}: ${selectedAsset.symbol.toUpperCase()} ${t("to portfolio.", "zum Portfolio.")}`);
                setQuantity("1");
              }}
            />
          </View>
          {!!addStatus && <Text style={{ color: colors.subtext, marginTop: 8 }}>{addStatus}</Text>}
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Transaction Tracker", "Transaktions-Tracker")}</Text>
            <View style={{ flexDirection: "row", gap: 8, flexShrink: 1 }}>
              <ActionButton
                label={showTransactionsPanel ? t("Collapse", "Einklappen") : t("Expand", "Ausklappen")}
                onPress={() => setShowTransactionsPanel((v) => !v)}
                style={{ minWidth: 98, minHeight: 38, paddingHorizontal: 10 }}
              />
              <ActionButton
                label={showTxForm ? t("Close", "Schliessen") : t("Add Tx", "Transaktion hinzufuegen")}
                onPress={() => setShowTxForm((v) => !v)}
                style={{ minWidth: 118, minHeight: 38, paddingHorizontal: 10 }}
              />
            </View>
          </View>
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: colors.subtext, fontSize: 12, flex: 1 }}>
              {t(
                "Import broker/exchange statement and auto-create portfolio transactions.",
                "Broker-/Boersen-Auszug importieren und Portfolio-Transaktionen automatisch erstellen."
              )}
            </Text>
            <ActionButton
              label={importBusy ? t("Importing...", "Importiere...") : t("Import File", "Datei importieren")}
              onPress={() => {
                if (importBusy) return;
                void importTransactions();
              }}
              style={{ minWidth: 104 }}
            />
          </View>
          {!!importStatus && <Text style={{ color: colors.subtext, marginTop: 6, fontSize: 12 }}>{importStatus}</Text>}
          {showTransactionsPanel && showTxForm ? (
            <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <FormInput value={txSymbol} onChangeText={setTxSymbol} label={t("Symbol", "Symbol")} placeholder="AAPL / BTC / VOO" style={{ flex: 1 }} />
            <FormInput value={txQty} onChangeText={setTxQty} label={t("Quantity", "Menge")} keyboardType="decimal-pad" placeholder="1" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <FormInput value={txPrice} onChangeText={setTxPrice} label={t("Price", "Preis")} keyboardType="decimal-pad" placeholder="100" style={{ flex: 1 }} />
            <FormInput value={txFee} onChangeText={setTxFee} label={t("Fee", "Gebuehr")} keyboardType="decimal-pad" placeholder="0" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {(["buy", "sell"] as const).map((side) => (
              <Pressable
                key={side}
                onPress={() => setTxSide(side)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: txSide === side ? "#5F43B2" : colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : txSide === side ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: txSide === side ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{side.toUpperCase()}</Text>
              </Pressable>
            ))}
            <ActionButton
              label={t("Add Transaction", "Transaktion hinzufuegen")}
              onPress={() => {
                const symbol = txSymbol.trim().toUpperCase();
                if (!symbol) return;
                const holding = holdings.find((h) => h.symbol === symbol);
                const parsedQty = parseLocaleNumber(txQty);
                const parsedPrice = parseLocaleNumber(txPrice);
                const parsedFee = parseLocaleNumber(txFee);
                const targetCurrency = normalizeCurrency(holding?.costCurrency) ?? settings.currency;
                addTransaction({
                  holdingId: holding?.id,
                  symbol,
                  kind: holding?.kind ?? "stock",
                  side: txSide,
                  quantity: Number.isFinite(parsedQty) ? parsedQty : 0,
                  price: convertCurrencyAmount(Number.isFinite(parsedPrice) ? parsedPrice : 0, settings.currency, targetCurrency, usdPerEur),
                  currency: targetCurrency,
                  fee: convertCurrencyAmount(Number.isFinite(parsedFee) ? parsedFee : 0, settings.currency, targetCurrency, usdPerEur),
                });
                setTxQty("1");
                setTxFee("0");
              }}
            />
          </View>
            </>
          ) : null}
          {showTransactionsPanel ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ color: colors.subtext, fontSize: 12, flex: 1, paddingRight: 8 }}>
                  {t("Showing", "Zeige")} {Math.min(transactions.length, showAllTransactions ? transactions.length : 20)} {t("of", "von")} {transactions.length}
                </Text>
                <Pressable
                  onPress={() => setShowAllTransactions((v) => !v)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#8E63F0",
                    backgroundColor: pressed ? (colors.dark ? "#221A3E" : "#F0E9FF") : (colors.dark ? "#1A1630" : "#F5F0FF"),
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  })}
                >
                  <Text style={{ color: "#8E63F0", fontSize: 12, fontWeight: "700" }}>
                    {showAllTransactions ? t("Show recent only", "Nur letzte anzeigen") : t("Show all", "Alle anzeigen")}
                  </Text>
                </Pressable>
              </View>
              <View style={{ gap: 7 }}>
                {(showAllTransactions ? transactions : transactions.slice(0, 20)).map((tx) => (
              <View key={tx.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 9 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <Text numberOfLines={2} style={{ color: colors.text, fontWeight: "700", flex: 1 }}>{tx.symbol} • {tx.side.toUpperCase()}</Text>
                  <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeTransaction(tx.id)} style={{ minWidth: 76, paddingHorizontal: 10 }} />
                </View>
                <Text style={{ color: colors.subtext, marginTop: 3 }}>
                  {t("Qty", "Menge")} {tx.quantity} • {t("Price", "Preis")} {toMoney(convertCurrencyAmount(tx.price, normalizeCurrency(tx.currency) ?? settings.currency, settings.currency, usdPerEur), settings.currency, settings.language)} • {t("Fee", "Gebuehr")} {toMoney(convertCurrencyAmount(tx.fee, normalizeCurrency(tx.currency) ?? settings.currency, settings.currency, usdPerEur), settings.currency, settings.language)}
                </Text>
              </View>
                ))}
                {!transactions.length && <Text style={{ color: colors.subtext, marginTop: 2 }}>{t("No transactions logged yet.", "Noch keine Transaktionen erfasst.")}</Text>}
              </View>

              <View style={{ marginTop: 12, marginBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Open Positions", "Offene Positionen")} ({rows.length})</Text>
              </View>
              <View style={{ gap: 8 }}>
                {rows.map((row) => (
                  <View key={row.holding.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <Text numberOfLines={2} style={{ color: colors.text, fontWeight: "800", flex: 1 }}>{row.asset?.symbol} • {row.asset?.name}</Text>
                      <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeHolding(row.holding.id)} style={{ minWidth: 76, paddingHorizontal: 10 }} />
                    </View>
                    <Text style={{ color: colors.subtext, marginTop: 4 }}>
                      {t("Qty", "Menge")} {row.holding.quantity} • {t("Avg", "Durchschn.")} {toMoney(row.avgCostDisplay, settings.currency, settings.language)} • {t("Market", "Markt")} {row.marketPrice == null ? "-" : toMoney(row.marketPrice, settings.currency, settings.language)}
                    </Text>
                    <Text style={{ color: row.pnl >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "700" }}>{t("Value", "Wert")} {toMoney(row.value, settings.currency, settings.language)} • {t("PnL", "P&L")} {toMoney(row.pnl, settings.currency, settings.language)} ({pct(row.pnlPct)})</Text>
                    <Text style={{ color: colors.subtext, marginTop: 2, fontSize: 12 }}>
                      Allocation {totalValue > 0 ? `${((row.value / totalValue) * 100).toFixed(2)}%` : "-"} • Cost Basis {toMoney(row.cost, settings.currency, settings.language)}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                      <Pressable
                        onPress={() => {
                          const currentPrice = row.marketPrice ?? row.avgCostDisplay;
                          addAlert({
                            assetId: row.holding.kind === "crypto" ? (row.holding.coinGeckoId || row.holding.symbol.toLowerCase()) : row.holding.symbol.toUpperCase(),
                            symbol: row.holding.symbol,
                            name: row.holding.name,
                            kind: row.holding.kind,
                            coinGeckoId: row.holding.coinGeckoId,
                            mode: "price",
                            targetPrice: currentPrice * 1.05,
                            direction: "above",
                          });
                        }}
                        style={({ pressed }) => ({
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: pressed ? (colors.dark ? "#151B28" : "#EAF0FF") : colors.surface,
                          paddingHorizontal: 9,
                          paddingVertical: 7,
                        })}
                      >
                        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>{t("Set +5% alert", "+5%-Alarm setzen")}</Text>
                      </Pressable>
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <FormInput
                        value={String(row.holding.annualYieldPct ?? 0)}
                        onChangeText={(v) => {
                          const parsed = parseLocaleNumber(v);
                          updateHolding(row.holding.id, { annualYieldPct: Number.isFinite(parsed) ? parsed : 0 });
                        }}
                        keyboardType="decimal-pad"
                        label={t("Yield % (Optional)", "Rendite % (optional)")}
                        placeholder="0"
                        help={t("Optional income estimate only. Does not affect portfolio tracking.", "Nur optionale Einkommensschaetzung. Beeinflusst Portfolio-Tracking nicht.")}
                        style={{ paddingVertical: 7 }}
                      />
                    </View>
                    {row.asset?.kind !== "crypto" && (
                      <FormInput
                        value={String(row.holding.manualPrice ?? row.marketPrice ?? row.avgCostDisplay)}
                        onChangeText={(v) => {
                          const parsed = parseLocaleNumber(v);
                          updateHolding(row.holding.id, { manualPrice: Number.isFinite(parsed) ? parsed : 0 });
                        }}
                        keyboardType="decimal-pad"
                        label={t("Manual Price Override", "Manuelle Preisueberschreibung")}
                        placeholder={t("Manual market price", "Manueller Marktpreis")}
                        help={t("Used when live quote is unavailable.", "Wird genutzt, wenn kein Live-Kurs verfuegbar ist.")}
                        style={{ marginTop: 6, paddingVertical: 7 }}
                      />
                    )}
                  </View>
                ))}
                {!rows.length && <Text style={{ color: colors.subtext }}>{t("No holdings yet.", "Noch keine Positionen vorhanden.")}</Text>}
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>{t("Transactions and positions collapsed.", "Transaktionen und Positionen eingeklappt.")}</Text>
          )}
        </View>

      </View>
    </ScrollView>
  );
}
