import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { fetchCoinGeckoMarketChart } from "../../src/data/coingecko";
import { fetchFredSeries } from "../../src/data/macro";
import { fetchYahooSeries } from "../../src/data/quotes";
import { useI18n } from "../../src/i18n/use-i18n";
import { RefreshFeedback, refreshControlProps } from "../../src/ui/refresh-feedback";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

type WindowDays = 30 | 90 | 180;

type SeriesPoint = { x: number; y: number };

type Pair = {
  id: string;
  label: string;
  leftKey: string;
  rightKey: string;
};

function rollingCorrelation(a: number[], b: number[], window: number): number[] {
  const n = Math.min(a.length, b.length);
  if (n < window + 2) return [];
  const out: number[] = [];
  for (let i = window; i < n; i += 1) {
    const xa = a.slice(i - window, i);
    const xb = b.slice(i - window, i);
    const ma = xa.reduce((s, v) => s + v, 0) / window;
    const mb = xb.reduce((s, v) => s + v, 0) / window;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let j = 0; j < window; j += 1) {
      const pa = xa[j] - ma;
      const pb = xb[j] - mb;
      num += pa * pb;
      da += pa * pa;
      db += pb * pb;
    }
    out.push(da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0);
  }
  return out;
}

function alignByDay(left: SeriesPoint[], right: SeriesPoint[]): { left: number[]; right: number[] } {
  const key = (x: number) => Math.floor(x / 86_400_000);
  const leftMap = new Map<number, number>();
  for (const p of left) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    leftMap.set(key(p.x), p.y);
  }
  const rightMap = new Map<number, number>();
  for (const p of right) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    rightMap.set(key(p.x), p.y);
  }
  const days = Array.from(leftMap.keys()).filter((d) => rightMap.has(d)).sort((a, b) => a - b);
  return {
    left: days.map((d) => leftMap.get(d) as number),
    right: days.map((d) => rightMap.get(d) as number),
  };
}

export default function CorrelationsScreen() {
  const colors = useAppColors();
  const { t } = useI18n();
  const [windowDays, setWindowDays] = useState<WindowDays>(90);
  const [loading, setLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [results, setResults] = useState<Record<string, number>>({});

  const seriesLoaders = useMemo<Record<string, () => Promise<SeriesPoint[]>>>(
    () => ({
      btc: () => fetchCoinGeckoMarketChart({ coinId: "bitcoin", vsCurrency: "usd", days: 365, metric: "prices" }),
      eth: () => fetchCoinGeckoMarketChart({ coinId: "ethereum", vsCurrency: "usd", days: 365, metric: "prices" }),
      dxy: () => fetchFredSeries({ seriesId: "DTWEXBGS", days: 365 }),
      ust10: () => fetchFredSeries({ seriesId: "DGS10", days: 365 }),
      ust2: () => fetchFredSeries({ seriesId: "DGS2", days: 365 }),
      spx: () => fetchFredSeries({ seriesId: "SP500", days: 365 }),
      nasdaq: () => fetchFredSeries({ seriesId: "NASDAQCOM", days: 365 }),
      gold: async () => {
        const live = await fetchYahooSeries("XAUUSD=X", 365);
        if (live.length >= 40) return live;
        return fetchFredSeries({ seriesId: "GOLDAMGBD228NLBM", days: 365 });
      },
      real10: () => fetchFredSeries({ seriesId: "DFII10", days: 365 }),
      m2: () => fetchFredSeries({ seriesId: "WM2NS", days: 365 }),
      fedbs: () => fetchFredSeries({ seriesId: "WALCL", days: 365 }),
      vix: () => fetchFredSeries({ seriesId: "VIXCLS", days: 365 }),
      hy: () => fetchFredSeries({ seriesId: "BAMLH0A0HYM2", days: 365 }),
      wti: async () => {
        const live = await fetchYahooSeries("CL=F", 365);
        if (live.length >= 40) return live;
        return fetchFredSeries({ seriesId: "DCOILWTICO", days: 365 });
      },
      eurusd: () => fetchFredSeries({ seriesId: "DEXUSEU", days: 365 }),
      copper: async () => {
        const live = await fetchYahooSeries("HG=F", 365);
        if (live.length >= 40) return live;
        return fetchFredSeries({ seriesId: "PCOPPUSDM", days: 365 });
      },
      inflation: () => fetchFredSeries({ seriesId: "CPIAUCSL", days: 365 }),
      move_proxy: () => fetchFredSeries({ seriesId: "MORTGAGE30US", days: 365 }),
    }),
    []
  );

  const pairs = useMemo<Pair[]>(
    () => [
      {
        id: "btc_dxy",
        label: "BTC vs DXY",
        leftKey: "btc",
        rightKey: "dxy",
      },
      {
        id: "btc_10y",
        label: "BTC vs US 10Y",
        leftKey: "btc",
        rightKey: "ust10",
      },
      {
        id: "btc_2y",
        label: "BTC vs US 2Y",
        leftKey: "btc",
        rightKey: "ust2",
      },
      {
        id: "btc_spx",
        label: "BTC vs S&P 500",
        leftKey: "btc",
        rightKey: "spx",
      },
      {
        id: "btc_nasdaq",
        label: "BTC vs NASDAQ",
        leftKey: "btc",
        rightKey: "nasdaq",
      },
      {
        id: "btc_gold",
        label: "BTC vs Gold",
        leftKey: "btc",
        rightKey: "gold",
      },
      {
        id: "btc_real10",
        label: "BTC vs Real 10Y Yield",
        leftKey: "btc",
        rightKey: "real10",
      },
      {
        id: "btc_fedbs",
        label: "BTC vs Fed Balance Sheet",
        leftKey: "btc",
        rightKey: "fedbs",
      },
      {
        id: "btc_vix",
        label: "BTC vs VIX",
        leftKey: "btc",
        rightKey: "vix",
      },
      {
        id: "eth_btc",
        label: "ETH vs BTC",
        leftKey: "eth",
        rightKey: "btc",
      },
      {
        id: "eth_nasdaq",
        label: "ETH vs NASDAQ",
        leftKey: "eth",
        rightKey: "nasdaq",
      },
      {
        id: "nasdaq_m2",
        label: "NASDAQ vs M2",
        leftKey: "nasdaq",
        rightKey: "m2",
      },
      {
        id: "spx_m2",
        label: "S&P 500 vs M2",
        leftKey: "spx",
        rightKey: "m2",
      },
      {
        id: "spx_hy",
        label: "S&P 500 vs HY Spread",
        leftKey: "spx",
        rightKey: "hy",
      },
      {
        id: "spx_vix",
        label: "S&P 500 vs VIX",
        leftKey: "spx",
        rightKey: "vix",
      },
      {
        id: "nasdaq_ust10",
        label: "NASDAQ vs US 10Y",
        leftKey: "nasdaq",
        rightKey: "ust10",
      },
      {
        id: "nasdaq_ust2",
        label: "NASDAQ vs US 2Y",
        leftKey: "nasdaq",
        rightKey: "ust2",
      },
      {
        id: "dxy_ust10",
        label: "DXY vs US 10Y",
        leftKey: "dxy",
        rightKey: "ust10",
      },
      {
        id: "dxy_eurusd",
        label: "DXY vs EURUSD",
        leftKey: "dxy",
        rightKey: "eurusd",
      },
      {
        id: "gold_real_yield",
        label: "Gold vs Real Yield",
        leftKey: "gold",
        rightKey: "real10",
      },
      {
        id: "gold_dxy",
        label: "Gold vs DXY",
        leftKey: "gold",
        rightKey: "dxy",
      },
      {
        id: "wti_inflation",
        label: "WTI Oil vs CPI",
        leftKey: "wti",
        rightKey: "inflation",
      },
      {
        id: "wti_dxy",
        label: "WTI Oil vs DXY",
        leftKey: "wti",
        rightKey: "dxy",
      },
      {
        id: "copper_ust10",
        label: "Copper vs US 10Y",
        leftKey: "copper",
        rightKey: "ust10",
      },
      {
        id: "hy_vix",
        label: "HY Spread vs VIX",
        leftKey: "hy",
        rightKey: "vix",
      },
      {
        id: "move_vix",
        label: "Rates Vol (proxy) vs VIX",
        leftKey: "move_proxy",
        rightKey: "vix",
      },
      {
        id: "eth_liq",
        label: "ETH vs Fed Balance Sheet",
        leftKey: "eth",
        rightKey: "fedbs",
      },
    ],
    []
  );

  const recompute = useCallback(async () => {
    setLoading(true);
    try {
      const next: Record<string, number> = {};
      const cache: Record<string, Promise<SeriesPoint[]>> = {};
      const getSeries = (key: string): Promise<SeriesPoint[]> => {
        const existing = cache[key];
        if (existing) return existing;
        const loader = seriesLoaders[key];
        const promise = loader ? loader().catch(() => []) : Promise.resolve([]);
        cache[key] = promise;
        return promise;
      };
      for (const pair of pairs) {
        const [left, right] = await Promise.all([getSeries(pair.leftKey), getSeries(pair.rightKey)]);
        const aligned = alignByDay(left, right);
        const l = aligned.left;
        const r = aligned.right;
        const roll = rollingCorrelation(l, r, windowDays);
        next[pair.id] = roll.length ? roll[roll.length - 1] : NaN;
      }
      setResults(next);
    } finally {
      setLoading(false);
    }
  }, [pairs, seriesLoaders, windowDays]);

  useEffect(() => {
    void recompute();
  }, [recompute]);

  const onManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await recompute();
    } finally {
      setManualRefreshing(false);
    }
  }, [recompute]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={() => {
            void onManualRefresh();
          }}
          {...refreshControlProps(colors, "Refreshing correlation matrix...")}
        />
      }
    >
      <RefreshFeedback refreshing={manualRefreshing} colors={colors} label={t("Recomputing correlation matrix...", "Korrelationsmatrix wird neu berechnet...")} />
      <TabHeader
        title={t("Correlations", "Korrelationen")}
        subtitle={t("Rolling cross-asset correlation engine with regime-flip visibility.", "Rollierende Cross-Asset-Korrelationen mit Regime-Flip-Signalen.")}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[30, 90, 180].map((days) => {
            const active = windowDays === days;
            return (
              <Pressable
                key={days}
                onPress={() => setWindowDays(days as WindowDays)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.accentBorder : colors.border,
                  backgroundColor: pressed ? colors.accentSoft : active ? colors.accentSoft : colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                })}
              >
                <Text style={{ color: active ? colors.accent : colors.subtext, fontWeight: "700" }}>{days}d</Text>
              </Pressable>
            );
          })}
        </View>

        {pairs.map((pair) => {
          const v = results[pair.id];
          const color = !Number.isFinite(v) ? colors.subtext : v > 0.35 ? colors.positive : v < -0.35 ? colors.negative : colors.warning;
          const flip = Number.isFinite(v) ? (Math.abs(v) < 0.15 ? "Potential regime flip" : "Stable regime") : "No data";
          return (
            <View key={pair.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{pair.label}</Text>
              <Text style={{ color, fontSize: 26, fontWeight: "900", marginTop: 2 }}>{Number.isFinite(v) ? v.toFixed(2) : "-"}</Text>
              <Text style={{ color: colors.subtext }}>{flip}</Text>
            </View>
          );
        })}

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 10 }}>
          <Text style={{ color: colors.subtext }}>{loading ? "Recomputing rolling matrix..." : "Heatmap + matrix expansion can be added from the same engine without UI churn."}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
