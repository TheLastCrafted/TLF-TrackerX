import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionButton } from "../../src/ui/action-button";
import { FormInput } from "../../src/ui/form-input";
import { useFinanceTools } from "../../src/state/finance-tools";
import type { DebtEntry } from "../../src/state/finance-tools";
import { useI18n } from "../../src/i18n/use-i18n";
import { useSettings } from "../../src/state/settings";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { SimpleSeriesChart } from "../../src/ui/simple-series-chart";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

type DebtMethod = "snowball" | "avalanche" | "custom" | "minimum";

type DebtPayoffPoint = {
  id: string;
  name: string;
  month: number | null;
  dateLabel: string;
  remaining: number;
};

type DebtBalancePoint = {
  month: number;
  remaining: number;
};

type DebtSimulation = {
  months: number;
  totalInterest: number;
  totalPaid: number;
  remainingBalance: number;
  stalled: boolean;
  debtFreeDateLabel: string;
  payoffTimeline: DebtPayoffPoint[];
  balanceSeries: DebtBalancePoint[];
};

const MAX_SIM_MONTHS = 600;
const EPS = 0.00001;
const DEBT_CATEGORIES = ["Credit Card", "Student Loan", "Auto Loan", "Mortgage", "Personal Loan", "Other"] as const;

function addMonths(start: Date, months: number) {
  const next = new Date(start);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toMoney(value: number, currency: "USD" | "EUR", language: "en" | "de") {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function parseLocaleNumber(raw: string): number {
  const txt = String(raw ?? "").trim();
  if (!txt) return NaN;
  const negative = txt.includes("(") && txt.includes(")");
  const cleaned = txt
    .replace(/[()]/g, "")
    .replace(/[^\d,.\-]/g, "")
    .replace(/(?!^)-/g, "");

  if (!cleaned) return NaN;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (comma > -1 && dot > -1) {
    if (comma > dot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (comma > -1 && dot === -1) {
    normalized = cleaned.replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -Math.abs(parsed) : parsed;
}

function orderOpenDebts(rows: DebtEntry[], method: DebtMethod): DebtEntry[] {
  const open = rows.filter((row) => row.balance > EPS);
  if (method === "avalanche") {
    return [...open].sort((a, b) => (b.aprPct - a.aprPct) || (a.balance - b.balance));
  }
  if (method === "custom") {
    return [...open].sort((a, b) => (a.priority - b.priority) || (a.balance - b.balance));
  }
  if (method === "minimum") {
    return [...open].sort((a, b) => b.balance - a.balance);
  }
  return [...open].sort((a, b) => (a.balance - b.balance) || (b.aprPct - a.aprPct));
}

function simulateDebts(
  debts: DebtEntry[],
  method: DebtMethod,
  globalExtra: number,
  language: "en" | "de"
): DebtSimulation {
  if (!debts.length) {
    return {
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      remainingBalance: 0,
      stalled: false,
      debtFreeDateLabel: language === "de" ? "Keine Schulden hinterlegt" : "No debts added",
      payoffTimeline: [],
      balanceSeries: [],
    };
  }

  const working = debts.map((row) => ({ ...row, balance: Math.max(0, row.balance) }));
  const initialOutstanding = working.reduce((sum, row) => sum + row.balance, 0);
  const balanceSeries: DebtBalancePoint[] = [{ month: 0, remaining: initialOutstanding }];
  const payoffMonthById = new Map<string, number>();
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  let stalled = false;
  let rollover = 0;

  const applyPayment = (row: DebtEntry, paymentCap: number) => {
    if (paymentCap <= EPS || row.balance <= EPS) return 0;
    const pay = Math.min(paymentCap, row.balance);
    row.balance = Math.max(0, row.balance - pay);
    totalPaid += pay;
    if (row.balance <= EPS && !payoffMonthById.has(row.id)) {
      row.balance = 0;
      payoffMonthById.set(row.id, months);
    }
    return pay;
  };

  for (let month = 1; month <= MAX_SIM_MONTHS; month += 1) {
    months = month;
    const openAtStart = working.filter((row) => row.balance > EPS);
    if (!openAtStart.length) break;

    let principalMoved = 0;
    let freedScheduled = 0;

    for (const row of openAtStart) {
      const monthlyRate = (Math.max(0, row.aprPct) / 100) / 12;
      const interest = row.balance * monthlyRate;
      row.balance += interest;
      totalInterest += interest;

      const scheduled = Math.max(0, row.minimumPayment) + Math.max(0, row.extraPayment);
      const paid = applyPayment(row, scheduled);
      principalMoved += Math.max(0, paid - interest);
      if (row.balance <= EPS) {
        freedScheduled += scheduled;
      }
    }

    let extraPool = Math.max(0, globalExtra) + Math.max(0, rollover);
    if (extraPool > EPS) {
      if (method === "minimum") {
        const open = working.filter((row) => row.balance > EPS);
        const totalOpen = open.reduce((sum, row) => sum + row.balance, 0);
        if (totalOpen > EPS) {
          let spent = 0;
          for (const row of open) {
            const before = row.balance;
            const share = (extraPool - spent) * (row.balance / totalOpen);
            const paid = applyPayment(row, share);
            principalMoved += paid;
            spent += paid;
            if (before > EPS && row.balance <= EPS) {
              freedScheduled += Math.max(0, row.minimumPayment) + Math.max(0, row.extraPayment);
            }
          }
          const stillOpen = orderOpenDebts(working, "minimum");
          let remainder = Math.max(0, extraPool - spent);
          if (remainder > EPS && stillOpen.length) {
            for (const row of stillOpen) {
              if (remainder <= EPS) break;
              const before = row.balance;
              const paid = applyPayment(row, remainder);
              principalMoved += paid;
              remainder -= paid;
              if (before > EPS && row.balance <= EPS) {
                freedScheduled += Math.max(0, row.minimumPayment) + Math.max(0, row.extraPayment);
              }
            }
          }
        }
      } else {
        while (extraPool > EPS) {
          const ranked = orderOpenDebts(working, method);
          if (!ranked.length) break;
          const target = ranked[0];
          const before = target.balance;
          const paid = applyPayment(target, extraPool);
          principalMoved += paid;
          extraPool -= paid;
          if (before > EPS && target.balance <= EPS) {
            freedScheduled += Math.max(0, target.minimumPayment) + Math.max(0, target.extraPayment);
          }
          if (paid <= EPS) break;
        }
      }
    }

    rollover += freedScheduled;
    const remaining = working.reduce((sum, row) => sum + row.balance, 0);
    balanceSeries.push({ month, remaining: Math.max(0, remaining) });
    if (remaining <= EPS) break;
    if (principalMoved <= EPS && Math.max(0, globalExtra) + Math.max(0, rollover) <= EPS) {
      stalled = true;
      break;
    }
  }

  const remainingBalance = working.reduce((sum, row) => sum + row.balance, 0);
  const debtFreeDateLabel =
    remainingBalance <= EPS
      ? addMonths(new Date(), months).toLocaleDateString(language === "de" ? "de-DE" : "en-US", {
          month: "short",
          year: "numeric",
        })
      : language === "de"
      ? "Nicht mit aktuellen Zahlungen erreichbar"
      : "Not reachable with current payments";

  const payoffTimeline: DebtPayoffPoint[] = debts.map((debt) => {
    const payoffMonth = payoffMonthById.get(debt.id) ?? null;
    const dateLabel =
      payoffMonth === null
        ? language === "de"
          ? "Nicht erreicht"
          : "Not reached"
        : addMonths(new Date(), payoffMonth).toLocaleDateString(language === "de" ? "de-DE" : "en-US", {
            month: "short",
            year: "numeric",
          });
    const remaining = working.find((row) => row.id === debt.id)?.balance ?? 0;
    return { id: debt.id, name: debt.name, month: payoffMonth, dateLabel, remaining };
  });

  payoffTimeline.sort((a, b) => {
    if (a.month === null && b.month === null) return a.name.localeCompare(b.name);
    if (a.month === null) return 1;
    if (b.month === null) return -1;
    return a.month - b.month;
  });

  return {
    months,
    totalInterest,
    totalPaid,
    remainingBalance,
    stalled,
    debtFreeDateLabel,
    payoffTimeline,
    balanceSeries,
  };
}

export default function DebtRepaymentScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const colors = useAppColors();
  const { t } = useI18n();
  const { settings } = useSettings();
  const { debts, addDebt, updateDebt, removeDebt } = useFinanceTools();

  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [repaymentMethod, setRepaymentMethod] = useState<DebtMethod>("snowball");
  const [globalExtraPayment, setGlobalExtraPayment] = useState("0");
  const [name, setName] = useState("Card A");
  const [category, setCategory] = useState<string>(DEBT_CATEGORIES[0]);
  const [balance, setBalance] = useState("5000");
  const [aprPct, setAprPct] = useState("19.9");
  const [minimumPayment, setMinimumPayment] = useState("150");
  const [extraPayment, setExtraPayment] = useState("0");
  const [priority, setPriority] = useState("1");
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"cumulativeDebt" | "debtFreeCount">("cumulativeDebt");
  const [timelineView, setTimelineView] = useState<"timeline" | "debtFree">("timeline");
  const [showDebtChart, setShowDebtChart] = useState(true);
  const [chartSelectedIndex, setChartSelectedIndex] = useState<number | null>(null);

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<string>(DEBT_CATEGORIES[0]);
  const [editBalance, setEditBalance] = useState("");
  const [editAprPct, setEditAprPct] = useState("");
  const [editMinimumPayment, setEditMinimumPayment] = useState("");
  const [editExtraPayment, setEditExtraPayment] = useState("");
  const [editPriority, setEditPriority] = useState("");

  const totalDebtBalance = useMemo(() => debts.reduce((sum, row) => sum + row.balance, 0), [debts]);
  const totalMinimum = useMemo(() => debts.reduce((sum, row) => sum + Math.max(0, row.minimumPayment + row.extraPayment), 0), [debts]);
  const weightedApr = useMemo(() => {
    if (totalDebtBalance <= 0) return NaN;
    const weighted = debts.reduce((sum, row) => sum + row.balance * row.aprPct, 0);
    return weighted / totalDebtBalance;
  }, [debts, totalDebtBalance]);

  const parsedGlobalExtra = parseLocaleNumber(globalExtraPayment);
  const extraPool = Number.isFinite(parsedGlobalExtra) ? Math.max(0, parsedGlobalExtra) : 0;
  const simulation = useMemo(
    () => simulateDebts(debts, repaymentMethod, extraPool, settings.language),
    [debts, repaymentMethod, extraPool, settings.language]
  );
  const payoffById = useMemo(() => new Map(simulation.payoffTimeline.map((row) => [row.id, row])), [simulation.payoffTimeline]);
  const debtSeriesValues = useMemo(() => simulation.balanceSeries.map((point) => point.remaining), [simulation.balanceSeries]);
  const debtFreeCountSeries = useMemo(() => {
    const paidMonths = simulation.payoffTimeline
      .map((row) => row.month)
      .filter((month): month is number => typeof month === "number" && month >= 0)
      .sort((a, b) => a - b);
    return simulation.balanceSeries.map((point) => {
      let count = 0;
      while (count < paidMonths.length && paidMonths[count] <= point.month) count += 1;
      return count;
    });
  }, [simulation.payoffTimeline, simulation.balanceSeries]);
  const chartValues = chartView === "cumulativeDebt" ? debtSeriesValues : debtFreeCountSeries;
  const chartColor = chartView === "cumulativeDebt" ? "#8D6AF0" : "#5CE0AB";
  const maxTimelineMonth = useMemo(() => {
    const settledMonths = simulation.payoffTimeline
      .map((row) => row.month ?? 0)
      .filter((month) => month > 0);
    const peak = settledMonths.length ? Math.max(...settledMonths) : 0;
    return Math.max(1, peak, simulation.months);
  }, [simulation.payoffTimeline, simulation.months]);
  const debtChartWidth = useMemo(
    () => Math.max(220, Math.floor(windowWidth - SCREEN_HORIZONTAL_PADDING * 2 - 40)),
    [windowWidth]
  );
  const chartYAxisWidth = 54;
  const chartHeight = 170;
  const chartPlotWidth = useMemo(() => Math.max(160, debtChartWidth - chartYAxisWidth - 6), [debtChartWidth]);
  const chartSeries = useMemo(
    () => simulation.balanceSeries.map((point, index) => ({ month: point.month, value: chartValues[index] ?? 0 })),
    [simulation.balanceSeries, chartValues]
  );
  const chartStats = useMemo(() => {
    if (!chartValues.length) return null;
    const min = Math.min(...chartValues);
    const max = Math.max(...chartValues);
    const range = Math.max(max - min, 1e-9);
    return { min, max, range };
  }, [chartValues]);
  const chartYTicks = useMemo(() => {
    if (!chartStats) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4;
      const value = chartStats.max - ratio * chartStats.range;
      return { value, topPct: ratio * 100 };
    });
  }, [chartStats]);
  const chartSelectedIndexClamped =
    chartSelectedIndex === null || !chartSeries.length
      ? null
      : Math.max(0, Math.min(chartSeries.length - 1, chartSelectedIndex));
  const chartSelectedPoint = chartSelectedIndexClamped === null ? null : chartSeries[chartSelectedIndexClamped];
  const chartSelectedX =
    chartSelectedIndexClamped === null || chartSeries.length < 2
      ? null
      : Math.round((chartSelectedIndexClamped / (chartSeries.length - 1)) * Math.max(chartPlotWidth - 1, 1));
  const chartSelectedY =
    chartSelectedPoint && chartStats
      ? chartHeight - ((chartSelectedPoint.value - chartStats.min) / chartStats.range) * chartHeight
      : null;
  const selectNearestDebtChartIndex = useCallback((x: number) => {
    if (!chartSeries.length) return;
    const clamped = Math.max(0, Math.min(chartPlotWidth, x));
    const idx = Math.round((clamped / Math.max(chartPlotWidth, 1)) * Math.max(chartSeries.length - 1, 0));
    setChartSelectedIndex(Math.max(0, Math.min(chartSeries.length - 1, idx)));
  }, [chartSeries, chartPlotWidth]);
  const chartStartMonthLabel = chartSeries.length ? `${t("Month", "Monat")} ${chartSeries[0].month}` : `${t("Month", "Monat")} 0`;
  const chartMidMonthLabel =
    chartSeries.length > 2 ? `${t("Month", "Monat")} ${chartSeries[Math.floor((chartSeries.length - 1) / 2)].month}` : "";
  const chartEndMonthLabel =
    chartSeries.length ? `${t("Month", "Monat")} ${chartSeries[chartSeries.length - 1].month}` : "-";
  const chartCardTitle =
    chartView === "cumulativeDebt"
      ? t("Outstanding Debt Trend", "Trend der Restschuld")
      : t("Debt-Free Progress", "Fortschritt schuldenfrei");
  const formatChartValue = useCallback((value: number) => {
    if (chartView === "cumulativeDebt") return toMoney(value, settings.currency, settings.language);
    return `${Math.round(value)} / ${debts.length}`;
  }, [chartView, settings.currency, settings.language, debts.length]);
  const settledRows = useMemo(
    () => simulation.payoffTimeline.filter((row) => row.month !== null),
    [simulation.payoffTimeline]
  );
  const openRows = useMemo(
    () => simulation.payoffTimeline.filter((row) => row.month === null),
    [simulation.payoffTimeline]
  );

  const methodSubtitle =
    repaymentMethod === "snowball"
      ? t("Lowest balance first. Fastest visible wins.", "Kleinster Kontostand zuerst. Schnell sichtbare Erfolge.")
      : repaymentMethod === "avalanche"
      ? t("Highest APR first. Lowest long-term interest.", "Hoechster Zins zuerst. Niedrigste Gesamtkosten.")
      : repaymentMethod === "custom"
      ? t("Manual priority rank. Lower rank gets paid first.", "Manuelle Prioritaet. Niedriger Rang wird zuerst bedient.")
      : t("Only minimums + extras. No priority rotation.", "Nur Mindestzahlungen + Extra. Keine Prioritaetsrotation.");

  const repaymentStrategyCard = (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{t("Repayment Strategy", "Rueckzahlungsstrategie")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          { id: "snowball", label: t("Snowball", "Snowball") },
          { id: "avalanche", label: t("Avalanche", "Avalanche") },
          { id: "custom", label: t("Custom Priority", "Eigene Prioritaet") },
          { id: "minimum", label: t("Minimum Only", "Nur Minimum") },
        ] as { id: DebtMethod; label: string }[]).map((option) => {
          const active = repaymentMethod === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setRepaymentMethod(option.id)}
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.accentBorder : colors.border,
                backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : active ? colors.accentSoft : colors.surfaceAlt,
                paddingHorizontal: 11,
                paddingVertical: 7,
              })}
            >
              <Text style={{ color: active ? colors.accent : colors.subtext, fontWeight: "800", fontSize: 12 }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.subtext, fontSize: 12 }}>{methodSubtitle}</Text>
      <FormInput
        value={globalExtraPayment}
        onChangeText={setGlobalExtraPayment}
        keyboardType="decimal-pad"
        label={t("Global Extra Payment / Month", "Globale Zusatzrate / Monat")}
        placeholder={t("e.g. 250", "z.B. 250")}
        help={t(
          "Applied on top of all minimums using the selected method. Decimals support both '.' and ','.",
          "Wird zusaetzlich zu allen Mindestraten nach gewaehlter Methode verteilt. Dezimalzahlen akzeptieren '.' und ','."
        )}
      />
    </View>
  );

  const beginEdit = (debt: DebtEntry) => {
    setEditingDebtId(debt.id);
    setEditName(debt.name);
    setEditCategory(debt.category);
    setEditBalance(String(debt.balance));
    setEditAprPct(String(debt.aprPct));
    setEditMinimumPayment(String(debt.minimumPayment));
    setEditExtraPayment(String(debt.extraPayment));
    setEditPriority(String(debt.priority));
  };

  const saveEdit = () => {
    if (!editingDebtId) return;
    const parsedPriority = parseLocaleNumber(editPriority);
    updateDebt(editingDebtId, {
      name: editName.trim() || t("Debt", "Schuld"),
      category: editCategory.trim() || t("Other", "Sonstiges"),
      balance: parseLocaleNumber(editBalance),
      aprPct: parseLocaleNumber(editAprPct),
      minimumPayment: parseLocaleNumber(editMinimumPayment),
      extraPayment: parseLocaleNumber(editExtraPayment),
      priority: Number.isFinite(parsedPriority) ? parsedPriority : 1,
    });
    setEditingDebtId(null);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
    >
      <TabHeader
        title={t("Debt", "Schulden")}
        subtitle={t(
          "Plan debt repayment with strategy routing, timeline, and interest impact.",
          "Plane Schuldenrueckzahlung mit Strategie-Routing, Zeitplan und Zinswirkung."
        )}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Total Debt", "Gesamtschulden")}</Text>
            <Text style={{ color: colors.text, marginTop: 3, fontWeight: "900", fontSize: 22 }}>
              {toMoney(totalDebtBalance, settings.currency, settings.language)}
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Weighted APR", "Gewichteter Zins")}</Text>
            <Text style={{ color: "#FFD787", marginTop: 3, fontWeight: "900", fontSize: 22 }}>
              {Number.isFinite(weightedApr) ? `${weightedApr.toFixed(2)}%` : "-"}
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Monthly Minimum", "Monatliche Mindestrate")}</Text>
            <Text style={{ color: "#8ED3FF", marginTop: 3, fontWeight: "900", fontSize: 20 }}>
              {toMoney(totalMinimum, settings.currency, settings.language)}
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Debts Tracked", "Erfasste Schulden")}</Text>
            <Text style={{ color: colors.text, marginTop: 3, fontWeight: "900", fontSize: 22 }}>{debts.length}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{t("Projected Outcome", "Prognose")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {t("Debt-free date", "Schuldenfrei am")}: {simulation.debtFreeDateLabel}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {t("Estimated months", "Geschaetzte Monate")}: {simulation.months}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {t("Total interest paid", "Gesamtzinskosten")}: {toMoney(simulation.totalInterest, settings.currency, settings.language)}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {t("Total payments", "Gesamtzahlungen")}: {toMoney(simulation.totalPaid, settings.currency, settings.language)}
          </Text>
          {!!simulation.remainingBalance && (
            <Text style={{ color: "#FF98AA", fontSize: 12 }}>
              {t("Remaining balance after simulation window", "Restschuld nach Simulationsfenster")}: {toMoney(simulation.remainingBalance, settings.currency, settings.language)}
            </Text>
          )}
          {simulation.stalled && (
            <Text style={{ color: "#FFD787", fontSize: 12 }}>
              {t(
                "Repayment stalled. Increase minimums or extra payments to avoid perpetual debt.",
                "Rueckzahlung stoppt. Erhoehe Mindestraten oder Zusatzraten, um Endlosschulden zu vermeiden."
              )}
            </Text>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{t("Debt Visual + Table", "Schulden-Visual + Tabelle")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {t("Balance bars and payoff speed snapshot by debt.", "Saldo-Balken und Rueckzahlungs-Tempo je Schuld.")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([
              { id: "cumulativeDebt", label: t("Cumulative Debt", "Kumulative Schulden") },
              { id: "debtFreeCount", label: t("Debt-Free Count", "Anzahl schuldenfrei") },
            ] as const).map((option) => {
              const active = chartView === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setChartView(option.id)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.accentBorder : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : active ? colors.accentSoft : colors.surfaceAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  })}
                >
                  <Text style={{ color: active ? colors.accent : colors.subtext, fontWeight: "700", fontSize: 12 }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: 10, gap: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{chartCardTitle}</Text>
              <Pressable
                onPress={() => setShowDebtChart((v) => !v)}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                  backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : colors.accentSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                })}
              >
                <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 11 }}>
                  {showDebtChart ? t("Close graph", "Graph schliessen") : t("Show graph", "Graph anzeigen")}
                </Text>
              </Pressable>
            </View>

            {!showDebtChart ? (
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                {t("Chart hidden. Use the button to show it again.", "Graph ausgeblendet. Mit dem Button wieder einblenden.")}
              </Text>
            ) : chartValues.length >= 2 && chartStats ? (
              <View style={{ width: debtChartWidth }}>
                <View style={{ flexDirection: "row", alignItems: "stretch", gap: 6 }}>
                  <View style={{ width: chartYAxisWidth, height: chartHeight, justifyContent: "space-between", paddingVertical: 2 }}>
                    {chartYTicks.map((tick, idx) => (
                      <Text key={`debt_y_${idx}`} style={{ color: colors.subtext, fontSize: 11, textAlign: "right" }}>
                        {formatChartValue(tick.value)}
                      </Text>
                    ))}
                  </View>

                  <View
                    style={{
                      width: chartPlotWidth,
                      height: chartHeight,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.dark ? "#252A3D" : "#D7E3F5",
                      backgroundColor: colors.dark ? "#0E1320" : "#F7FAFF",
                      overflow: "hidden",
                    }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) => selectNearestDebtChartIndex(e.nativeEvent.locationX)}
                    onResponderMove={(e) => selectNearestDebtChartIndex(e.nativeEvent.locationX)}
                  >
                    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                      {chartYTicks.map((tick, idx) => (
                        <View
                          key={`debt_hgrid_${idx}`}
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: `${tick.topPct}%`,
                            borderTopWidth: 1,
                            borderTopColor: colors.dark ? "rgba(130,140,170,0.22)" : "rgba(108,126,162,0.28)",
                          }}
                        />
                      ))}
                      {Array.from({ length: 5 }, (_, idx) => (
                        <View
                          key={`debt_vgrid_${idx}`}
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${(idx / 4) * 100}%`,
                            borderLeftWidth: 1,
                            borderLeftColor: colors.dark ? "rgba(130,140,170,0.18)" : "rgba(108,126,162,0.22)",
                          }}
                        />
                      ))}
                    </View>

                    <SimpleSeriesChart values={chartValues} width={chartPlotWidth} height={chartHeight} color={chartColor} />

                    {chartSelectedX !== null && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          left: Math.max(0, Math.min(chartPlotWidth - 1, chartSelectedX)),
                          top: 0,
                          bottom: 0,
                          borderLeftWidth: 1,
                          borderLeftColor: colors.dark ? "rgba(196,176,255,0.75)" : "rgba(95,67,178,0.7)",
                        }}
                      />
                    )}
                    {chartSelectedY !== null && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: Math.max(0, Math.min(chartHeight - 1, chartSelectedY)),
                          borderTopWidth: 1,
                          borderTopColor: colors.dark ? "rgba(196,176,255,0.55)" : "rgba(95,67,178,0.5)",
                        }}
                      />
                    )}

                    {!!chartSelectedPoint && chartSelectedX !== null && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          top: 8,
                          left: Math.max(6, Math.min(chartPlotWidth - 164, chartSelectedX - 78)),
                          width: 158,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.dark ? "#343C59" : "#C7D6ED",
                          backgroundColor: colors.dark ? "#121726" : "#FFFFFF",
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>
                          {formatChartValue(chartSelectedPoint.value)}
                        </Text>
                        <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>
                          {t("Month", "Monat")} {chartSelectedPoint.month}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", paddingLeft: chartYAxisWidth + 4 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>{chartStartMonthLabel}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>{chartMidMonthLabel}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>{chartEndMonthLabel}</Text>
                </View>
              </View>
            ) : (
              <Text style={{ color: colors.subtext, fontSize: 12 }}>-</Text>
            )}
          </View>
          {!debts.length ? (
            <Text style={{ color: colors.subtext }}>-</Text>
          ) : (
            debts
              .slice()
              .sort((a, b) => b.balance - a.balance)
              .map((debt) => {
                const payoff = payoffById.get(debt.id);
                const balanceShare = totalDebtBalance > 0 ? debt.balance / totalDebtBalance : 0;
                const timelineShare = payoff?.month ? payoff.month / maxTimelineMonth : 1;
                return (
                  <View key={`viz:${debt.id}`} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: 8, gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontWeight: "700" }}>{debt.name}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>{toMoney(debt.balance, settings.currency, settings.language)}</Text>
                    </View>
                    <View style={{ height: 7, borderRadius: 999, backgroundColor: colors.border }}>
                      <View
                        style={{
                          height: 7,
                          borderRadius: 999,
                          width: `${Math.max(4, Math.min(100, balanceShare * 100))}%`,
                          backgroundColor: "#5CE0AB",
                        }}
                      />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        APR {debt.aprPct.toFixed(2)}% • {t("Min", "Min")} {toMoney(debt.minimumPayment + debt.extraPayment, settings.currency, settings.language)}
                      </Text>
                      <Text style={{ color: payoff?.month === null ? "#FF98AA" : "#8ED3FF", fontSize: 12, fontWeight: "700" }}>
                        {payoff?.month === null ? t("Not reached", "Nicht erreicht") : `${t("Month", "Monat")} ${payoff?.month ?? "-"}`}
                      </Text>
                    </View>
                    <View style={{ height: 5, borderRadius: 999, backgroundColor: colors.border }}>
                      <View
                        style={{
                          height: 5,
                          borderRadius: 999,
                          width: `${Math.max(4, Math.min(100, timelineShare * 100))}%`,
                          backgroundColor: payoff?.month === null ? "#FF98AA" : "#8ED3FF",
                        }}
                      />
                    </View>
                  </View>
                );
              })
          )}
          {!!debts.length && (
            <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 5 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700", flex: 1.5 }}>{t("Name", "Name")}</Text>
                <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700", flex: 1, textAlign: "right" }}>APR</Text>
                <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700", flex: 1.2, textAlign: "right" }}>{t("Pay / Mo", "Rate / Mo")}</Text>
                <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700", flex: 1.5, textAlign: "right" }}>{t("Payoff", "Tilgung")}</Text>
              </View>
              {debts.map((debt) => {
                const payoff = payoffById.get(debt.id);
                return (
                  <View key={`table:${debt.id}`} style={{ flexDirection: "row", gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, flex: 1.5 }}>{debt.name}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, flex: 1, textAlign: "right" }}>{debt.aprPct.toFixed(2)}%</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, flex: 1.2, textAlign: "right" }}>
                      {toMoney(debt.minimumPayment + debt.extraPayment, settings.currency, settings.language)}
                    </Text>
                    <Text style={{ color: payoff?.month === null ? "#FF98AA" : "#5CE0AB", fontSize: 12, flex: 1.5, textAlign: "right" }}>
                      {payoff?.month === null ? t("Not reached", "Nicht erreicht") : `${t("Month", "Monat")} ${payoff?.month ?? "-"}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{t("Payoff Timeline", "Tilgungszeitplan")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([
              { id: "timeline", label: t("Timeline", "Zeitachse") },
              { id: "debtFree", label: t("Debt Free", "Schuldenfrei") },
            ] as const).map((option) => {
              const active = timelineView === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setTimelineView(option.id)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.accentBorder : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : active ? colors.accentSoft : colors.surfaceAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  })}
                >
                  <Text style={{ color: active ? colors.accent : colors.subtext, fontWeight: "700", fontSize: 12 }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {timelineView === "timeline" ? (
            <View style={{ gap: 6 }}>
              {simulation.payoffTimeline.map((row) => (
                <View key={row.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.subtext, flex: 1 }}>{row.name}</Text>
                  <Text style={{ color: row.month === null ? "#FF98AA" : "#5CE0AB", fontWeight: "700" }}>
                    {row.month === null
                      ? t("Not reached", "Nicht erreicht")
                      : `${t("Month", "Monat")} ${row.month} • ${row.dateLabel}`}
                  </Text>
                </View>
              ))}
              {!simulation.payoffTimeline.length ? <Text style={{ color: colors.subtext }}>-</Text> : null}
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                {t("Debts cleared", "Schulden getilgt")}: {settledRows.length} / {debts.length}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                {t("Still open", "Noch offen")}: {openRows.length}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                {t("Projected debt-free date", "Prognose schuldenfrei am")}: {simulation.debtFreeDateLabel}
              </Text>
              {settledRows.map((row) => (
                <View key={`settled:${row.id}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.subtext, flex: 1 }}>{row.name}</Text>
                  <Text style={{ color: "#5CE0AB", fontWeight: "700" }}>
                    {t("Month", "Monat")} {row.month ?? "-"} • {row.dateLabel}
                  </Text>
                </View>
              ))}
              {!settledRows.length ? (
                <Text style={{ color: colors.subtext, fontSize: 12 }}>
                  {t("No debt reaches zero with current setup.", "Mit der aktuellen Einstellung wird keine Schuld komplett getilgt.")}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View style={{ marginTop: 10 }}>
          {repaymentStrategyCard}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{t("Debt Inputs", "Schuldeneingaben")}</Text>
            <ActionButton
              label={showAddForm ? t("Close", "Schliessen") : t("Add Debt", "Schuld hinzufuegen")}
              onPress={() => setShowAddForm((v) => !v)}
            />
          </View>

          {showAddForm ? (
            <>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                {t("You can use '.' or ',' for decimals in all amount fields.", "Du kannst '.' oder ',' als Dezimaltrennzeichen in allen Betragsfeldern nutzen.")}
              </Text>
              <FormInput value={name} onChangeText={setName} label={t("Debt Name", "Schuldenname")} placeholder={t("e.g. Visa Card", "z.B. Visa Karte")} />
              <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Category", "Kategorie")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {DEBT_CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? colors.accentBorder : colors.border,
                        backgroundColor: pressed ? (colors.dark ? "#1A1F33" : "#EEF2FF") : active ? colors.accentSoft : colors.surfaceAlt,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      })}
                    >
                      <Text style={{ color: active ? colors.accent : colors.subtext, fontWeight: "700", fontSize: 12 }}>{cat}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <FormInput value={balance} onChangeText={setBalance} keyboardType="decimal-pad" label={t("Current Balance", "Aktueller Saldo")} placeholder="5000" style={{ flex: 1 }} />
                <FormInput value={aprPct} onChangeText={setAprPct} keyboardType="decimal-pad" label={t("APR %", "Zins %")} placeholder="19.9" style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <FormInput value={minimumPayment} onChangeText={setMinimumPayment} keyboardType="decimal-pad" label={t("Minimum / Month", "Minimum / Monat")} placeholder="150" style={{ flex: 1 }} />
                <FormInput value={extraPayment} onChangeText={setExtraPayment} keyboardType="decimal-pad" label={t("Extra / Month", "Extra / Monat")} placeholder="0" style={{ flex: 1 }} />
              </View>
              <FormInput
                value={priority}
                onChangeText={setPriority}
                keyboardType="number-pad"
                label={t("Priority Rank", "Prioritaetsrang")}
                placeholder="1"
                help={t("Only used for Custom Priority method. Lower rank pays first.", "Nur fuer Eigene Prioritaet. Niedriger Rang wird zuerst bezahlt.")}
              />
              <ActionButton
                label={t("Save Debt", "Schuld speichern")}
                onPress={() => {
                  const parsedPriority = parseLocaleNumber(priority);
                  addDebt({
                    name,
                    category,
                    balance: parseLocaleNumber(balance),
                    aprPct: parseLocaleNumber(aprPct),
                    minimumPayment: parseLocaleNumber(minimumPayment),
                    extraPayment: parseLocaleNumber(extraPayment),
                    priority: Number.isFinite(parsedPriority) ? parsedPriority : 1,
                  });
                }}
                style={{ alignSelf: "flex-start" }}
              />
            </>
          ) : null}

          {!debts.length ? (
            <Text style={{ color: colors.subtext }}>{t("No debts added yet.", "Noch keine Schulden hinzugefuegt.")}</Text>
          ) : (
            debts.map((debt) => {
              const payoff = payoffById.get(debt.id);
              const editing = editingDebtId === debt.id;
              return (
                <View
                  key={debt.id}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceAlt,
                    padding: 10,
                    marginTop: 2,
                    gap: 5,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <View style={{ flexShrink: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "900" }}>{debt.name}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>{debt.category}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <ActionButton label={editing ? t("Cancel", "Abbrechen") : t("Edit", "Bearbeiten")} onPress={() => (editing ? setEditingDebtId(null) : beginEdit(debt))} />
                      <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeDebt(debt.id)} />
                    </View>
                  </View>
                  {!editing ? (
                    <>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        {t("Balance", "Saldo")} {toMoney(debt.balance, settings.currency, settings.language)} • APR {debt.aprPct.toFixed(2)}%
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        {t("Minimum", "Minimum")} {toMoney(debt.minimumPayment, settings.currency, settings.language)} • {t("Extra", "Extra")} {toMoney(debt.extraPayment, settings.currency, settings.language)}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        {t("Priority", "Prioritaet")} {debt.priority} • {t("Projected payoff", "Prognose bezahlt")} {payoff?.dateLabel ?? "-"}
                      </Text>
                    </>
                  ) : (
                    <>
                      <FormInput value={editName} onChangeText={setEditName} label={t("Debt Name", "Schuldenname")} />
                      <FormInput value={editCategory} onChangeText={setEditCategory} label={t("Category", "Kategorie")} />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <FormInput value={editBalance} onChangeText={setEditBalance} keyboardType="decimal-pad" label={t("Balance", "Saldo")} style={{ flex: 1 }} />
                        <FormInput value={editAprPct} onChangeText={setEditAprPct} keyboardType="decimal-pad" label={t("APR %", "Zins %")} style={{ flex: 1 }} />
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <FormInput value={editMinimumPayment} onChangeText={setEditMinimumPayment} keyboardType="decimal-pad" label={t("Minimum", "Minimum")} style={{ flex: 1 }} />
                        <FormInput value={editExtraPayment} onChangeText={setEditExtraPayment} keyboardType="decimal-pad" label={t("Extra", "Extra")} style={{ flex: 1 }} />
                      </View>
                      <FormInput value={editPriority} onChangeText={setEditPriority} keyboardType="number-pad" label={t("Priority", "Prioritaet")} />
                      <ActionButton label={t("Save Changes", "Aenderungen speichern")} onPress={saveEdit} style={{ alignSelf: "flex-start" }} />
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: insets.bottom + 18 }} />
      </View>
    </ScrollView>
  );
}
