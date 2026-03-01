import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { searchUniversalAssets, UniversalAsset } from "../../src/data/asset-search";
import { fetchCoinGeckoMarketChart } from "../../src/data/coingecko";
import { getResearchMaterials, type ResearchTopic } from "../../src/data/research-materials";
import { useResearchNotes } from "../../src/state/research-notes";
import { useSubscriptionAccess } from "../../src/state/subscription-access";
import { ActionButton } from "../../src/ui/action-button";
import { HapticPressable as Pressable } from "../../src/ui/haptic-pressable";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { SubscriptionLockedScreen } from "../../src/ui/subscription-locked-screen";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const xa = a.slice(-n);
  const xb = b.slice(-n);
  const ma = xa.reduce((s, v) => s + v, 0) / n;
  const mb = xb.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const pa = xa[i] - ma;
    const pb = xb[i] - mb;
    num += pa * pb;
    da += pa * pa;
    db += pb * pb;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

export default function ResearchScreen() {
  const router = useRouter();
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const { canAccessRoute } = useSubscriptionAccess();
  const { notes, addNote, removeNote } = useResearchNotes();

  const [query, setQuery] = useState("BTC");
  const [rows, setRows] = useState<UniversalAsset[]>([]);
  const [selected, setSelected] = useState<UniversalAsset | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [topic, setTopic] = useState<ResearchTopic>("indicators");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [volatility, setVolatility] = useState<number | null>(null);
  const [betaProxy, setBetaProxy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAssetConsole, setShowAssetConsole] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void searchUniversalAssets(q, 20).then((res) => {
        if (alive) setRows(res);
      });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    if (!selected || selected.kind !== "crypto" || !selected.coinGeckoId) {
      setVolatility(null);
      setBetaProxy(null);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [asset, btc] = await Promise.all([
          fetchCoinGeckoMarketChart({ coinId: selected.coinGeckoId!, vsCurrency: "usd", days: 365, metric: "prices" }),
          fetchCoinGeckoMarketChart({ coinId: "bitcoin", vsCurrency: "usd", days: 365, metric: "prices" }),
        ]);
        const ra = asset.slice(1).map((p, i) => Math.log(p.y / Math.max(asset[i].y, 1e-9)));
        const rb = btc.slice(1).map((p, i) => Math.log(p.y / Math.max(btc[i].y, 1e-9)));
        const vol = Math.sqrt(365) * Math.sqrt(ra.reduce((s, v) => s + v * v, 0) / Math.max(ra.length, 1));
        const c = corr(ra, rb);
        if (alive) {
          setVolatility(vol * 100);
          setBetaProxy(Number.isFinite(c) ? c : null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  const selectedNotes = useMemo(
    () => notes.filter((n) => n.symbol === (selected?.symbol ?? "").toUpperCase()),
    [notes, selected?.symbol]
  );

  const topicCards = useMemo(() => {
    if (topic === "indicators") {
      return [
        {
          title: "RSI (Relative Strength Index)",
          body: "0-100 momentum oscillator. >70 can signal overbought and <30 oversold, but trend context matters.",
        },
        {
          title: "MACD",
          body: "EMA spread and signal line track momentum shifts. Histogram shows acceleration and deceleration.",
        },
        {
          title: "Bollinger Bands",
          body: "Volatility bands around moving average. Expansion shows regime shift; compression often precedes breakouts.",
        },
        {
          title: "Moving Average Structure",
          body: "Price vs 50/200-day MAs maps trend regime. Crossovers lag; validate with breadth and volume.",
        },
      ];
    }
    if (topic === "macro") {
      return [
        {
          title: "Yield Curve Mechanics",
          body: "10Y-2Y and 10Y-3M spreads proxy growth expectations and policy tightness. Persistent inversion raises recession risk.",
        },
        {
          title: "Inflation Transmission",
          body: "CPI/PCE trend influences real rates, valuation multiples, and policy path expectations.",
        },
        {
          title: "Liquidity Regime",
          body: "Rates, balance-sheet policy (QE/QT), and dollar strength drive cross-asset risk appetite.",
        },
      ];
    }
    if (topic === "crypto") {
      return [
        {
          title: "Tokenomics Core",
          body: "Supply issuance, unlock schedules, burns, and treasury emissions define dilution pressure.",
        },
        {
          title: "On-Chain Demand Signals",
          body: "Active users, fees, stablecoin flows, and transaction growth help distinguish utility from speculation.",
        },
        {
          title: "Leverage & Structure",
          body: "Funding rates, basis, and open interest reveal fragility and potential liquidation cascades.",
        },
      ];
    }
    if (topic === "risk") {
      return [
        {
          title: "Volatility Targeting",
          body: "Position size scales inversely with volatility to stabilize drawdown risk across assets.",
        },
        {
          title: "Correlation Clusters",
          body: "Correlations rise during stress. Test diversification against crisis windows, not normal periods.",
        },
        {
          title: "Scenario Discipline",
          body: "Build base/bull/bear trees with explicit invalidation and liquidity plans before taking risk.",
        },
      ];
    }
    return [
      {
        title: "Trend Playbook",
        body: "Trade with structure and continuation signals. Add on pullbacks, reduce on momentum divergence.",
      },
      {
        title: "Mean Reversion Playbook",
        body: "Works in ranges, not strong trends. Require volatility contraction + reversal confirmation.",
      },
      {
        title: "Event-Driven Playbook",
        body: "Map outcomes for CPI/FOMC/ECB and define sizing/hedges before the event window.",
      },
    ];
  }, [topic]);

  const materialLibrary = useMemo(() => getResearchMaterials(topic), [topic]);

  const generateSummary = async () => {
    if (!selected) return;
    const symbol = selected.symbol.toUpperCase();
    const categoryLine =
      selected.kind === "crypto"
        ? "This asset should be evaluated through token utility, supply emissions, treasury behavior, exchange liquidity quality, and narrative durability across cycles."
        : "This asset should be evaluated through earnings durability, balance-sheet quality, valuation regime, and macro-rate sensitivity.";
    const riskLine =
      selected.kind === "crypto"
        ? `Observed 1Y volatility proxy is ${volatility?.toFixed(2) ?? "-"}%, with BTC correlation proxy at ${betaProxy?.toFixed(2) ?? "-"}.`
        : `Volatility and beta should be tested against broad index regimes and sector-specific shocks before sizing conviction positions.`;
    const notesLine = selectedNotes.length
      ? `You currently have ${selectedNotes.length} stored thesis notes for ${symbol}; use those as your internal baseline assumptions.`
      : `No thesis notes are currently stored for ${symbol}; define a clear base case, risk case, and invalidation level before execution.`;

    const text = [
      `${symbol} research framework: start by defining what would have to be true for this asset to outperform over the next 6-24 months, then map what would disprove that thesis early. ${categoryLine}`,
      `Primary diligence block: evaluate demand quality first, then valuation. For equities/ETFs that means revenue composition, margin trend, cash conversion, and sensitivity to rates and growth expectations. For crypto, it means organic network usage, fee behavior, user retention, token velocity, and whether on-chain demand is durable beyond short-term speculation.`,
      `Second block: supply and ownership structure. For equities, monitor share count trend, buyback quality, insider ownership shifts, and concentration risk in institutional holders. For crypto, monitor unlock schedules, emissions, treasury wallets, staking concentration, and exchange inventory pressure. Supply-side stress can invalidate otherwise strong demand narratives.`,
      `${riskLine} Build position sizing from downside tolerance, not upside imagination: define max loss per thesis, expected drawdown band, and liquidity assumptions under stress conditions. Use scenario bands (base, upside, downside) and only increase size when evidence improves, not when price alone moves.`,
      `Catalyst map: list the next 3-5 event windows that can change valuation quickly (earnings, CPI/FOMC/ECB, product launches, regulatory updates, token unlock clusters, funding-rate extremes). Predefine actions for each outcome before the event, including reduce/hold/add logic. This prevents discretionary drift during volatility.`,
      `Execution and review: track thesis checkpoints weekly. If the thesis is intact but market microstructure is weak, reduce size and wait for confirmation. If thesis improves and liquidity is healthy, scale in gradually. ${notesLine} Use your note archive as a living decision journal, and update it after each major catalyst.`,
    ].join("\n\n");

    setSummary(text);
  };

  if (!canAccessRoute("research")) return <SubscriptionLockedScreen route="research" title="Research" />;

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 118 }}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <TabHeader title="Research" subtitle="Fundamentals, tokenomics, risk metrics, and thesis notes for each asset." />
      </View>

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Asset Research Console</Text>
            <ActionButton
              label={showAssetConsole ? "Collapse" : "Expand"}
              onPress={() => setShowAssetConsole((v) => !v)}
              style={{ minWidth: 104, minHeight: 36, paddingHorizontal: 10 }}
            />
          </View>
          {showAssetConsole && (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search ticker or coin name"
                placeholderTextColor={colors.subtext}
                style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 8 }}
              />
              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {rows.map((row) => (
                  <Pressable
                    key={row.id}
                    onPress={() => setSelected(row)}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected?.id === row.id ? "#5F43B2" : colors.border,
                      backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : selected?.id === row.id ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                      paddingHorizontal: 9,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: selected?.id === row.id ? "#7E5CE6" : colors.subtext, fontSize: 11, fontWeight: "700" }}>
                      {row.symbol} ({row.kind.toUpperCase()})
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>

        {!!selected && (
          <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>{selected.name} ({selected.symbol})</Text>
            <Text style={{ color: colors.subtext }}>Category: {selected.kind.toUpperCase()}</Text>
            <Text style={{ color: colors.subtext }}>Fundamentals: revenue quality / token utility / liquidity depth / valuation context</Text>
            <Text style={{ color: colors.subtext }}>Market cap breakdown: large-cap leadership, mid-cap rotation, micro-cap risk premium</Text>
            <Text style={{ color: colors.subtext }}>Supply schedule: emission profile, unlock calendar, dilution or buyback pressure</Text>
            <Text style={{ color: colors.subtext }}>Risk metrics: volatility {volatility ? `${volatility.toFixed(2)}%` : "-"} • correlation {betaProxy?.toFixed(2) ?? "-"}</Text>
            {loading && <Text style={{ color: colors.subtext }}>Updating risk metrics...</Text>}
            <ActionButton
              label="Generate research summary"
              onPress={() => {
                void generateSummary();
              }}
              style={{ marginTop: 4, alignSelf: "flex-start" }}
            />
            {!!summary && <Text style={{ color: colors.subtext, marginTop: 6 }}>{summary}</Text>}
          </View>
        )}

        {!!selected && (
          <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Notes & Thesis Storage ({selected.symbol.toUpperCase()})</Text>
            <TextInput value={noteTitle} onChangeText={setNoteTitle} placeholder="Note title" placeholderTextColor={colors.subtext} style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 8 }} />
            <TextInput value={noteBody} onChangeText={setNoteBody} multiline placeholder="Thesis, risk cases, invalidation levels..." placeholderTextColor={colors.subtext} style={{ marginTop: 8, minHeight: 84, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 8, textAlignVertical: "top" }} />
            <ActionButton
              label="Save note"
              onPress={() => {
                addNote({ symbol: selected.symbol, title: noteTitle, body: noteBody });
                setNoteTitle("");
                setNoteBody("");
              }}
              style={{ marginTop: 8, alignSelf: "flex-start" }}
            />

            <View style={{ marginTop: 10, gap: 8 }}>
              {selectedNotes.map((note) => (
                <View key={note.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{note.title}</Text>
                    <ActionButton label="Remove" onPress={() => removeNote(note.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>{note.body}</Text>
                </View>
              ))}
              {!selectedNotes.length && <Text style={{ color: colors.subtext }}>No notes yet for this asset.</Text>}
            </View>
          </View>
        )}

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Research Academy (Material Library)</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>
            Structured, source-backed materials. Use this as reference, then attach your own thesis notes above.
          </Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([
              ["indicators", "Indicators"],
              ["macro", "Macro"],
              ["crypto", "Crypto"],
              ["risk", "Risk"],
              ["playbooks", "Playbooks"],
            ] as const).map(([id, label]) => {
              const active = topic === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setTopic(id)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  })}
                >
                  <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: 10, gap: 8 }}>
            {topicCards.map((card) => (
              <View key={card.title} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{card.title}</Text>
                <Text style={{ color: colors.subtext, marginTop: 4 }}>{card.body}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.text, fontWeight: "800", marginTop: 12 }}>Primary Reading Sources</Text>
          <View style={{ marginTop: 8, gap: 8 }}>
            {materialLibrary.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/research-material/${item.id}`)}
                style={({ pressed }) => ({
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? (colors.dark ? "#151B28" : "#EAF0FF") : colors.surface,
                  padding: 10,
                })}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>{item.title}</Text>
                <Text style={{ color: colors.subtext, marginTop: 3 }}>{item.source}</Text>
                <Text style={{ color: colors.subtext, marginTop: 3 }}>{item.why}</Text>
                <Text style={{ color: "#7E5CE6", marginTop: 6, fontWeight: "700" }}>Open explainer</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
