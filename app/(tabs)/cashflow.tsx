import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPENDING_CATEGORIES, defaultBucketForCategory } from "../../src/catalog/spending-categories";
import { useI18n } from "../../src/i18n/use-i18n";
import { mapRowsToCashflow, pickLocalImportFile, readImportRowsFromAsset } from "../../src/lib/file-import";
import { useFinanceTools } from "../../src/state/finance-tools";
import { FormInput } from "../../src/ui/form-input";
import { ActionButton } from "../../src/ui/action-button";
import { useLogoScrollToTop } from "../../src/ui/logo-scroll-events";
import { SCREEN_HORIZONTAL_PADDING, TabHeader } from "../../src/ui/tab-header";
import { useAppColors } from "../../src/ui/use-app-colors";

function toMoney(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function CashflowScreen() {
  const insets = useSafeAreaInsets();
  const { incomes, expenses, addIncome, updateIncome, removeIncome, addExpense, updateExpense, removeExpense } = useFinanceTools();
  const colors = useAppColors();
  const { t, tx } = useI18n();

  const [compactHeader, setCompactHeader] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeLogs, setShowIncomeLogs] = useState(false);
  const [showExpenseLogs, setShowExpenseLogs] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });
  const [source, setSource] = useState("Salary");
  const [amount, setAmount] = useState("5000");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [expenseCategory, setExpenseCategory] = useState(SPENDING_CATEGORIES[1]?.name ?? "Food");
  const [expenseSubcategory, setExpenseSubcategory] = useState(SPENDING_CATEGORIES[1]?.subcategories[0] ?? "Dining");
  const [expenseAmount, setExpenseAmount] = useState("40");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseNote, setExpenseNote] = useState("");
  const selectedExpenseCategory = SPENDING_CATEGORIES.find((c) => c.name === expenseCategory) ?? SPENDING_CATEGORIES[0];

  const byMonth = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const row of incomes) {
      const key = row.date.slice(0, 7);
      const prev = map.get(key) ?? { income: 0, expense: 0 };
      map.set(key, { ...prev, income: prev.income + row.amount });
    }
    for (const row of expenses) {
      const key = row.date.slice(0, 7);
      const prev = map.get(key) ?? { income: 0, expense: 0 };
      map.set(key, { ...prev, expense: prev.expense + row.amount });
    }
    return [...map.entries()]
      .map(([month, values]) => ({ month, ...values, net: values.income - values.expense }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [incomes, expenses]);

  const latest = byMonth[0] ?? { income: 0, expense: 0, net: 0 };
  const avgIncome = byMonth.length ? byMonth.reduce((sum, row) => sum + row.income, 0) / byMonth.length : 0;
  const avgExpense = byMonth.length ? byMonth.reduce((sum, row) => sum + row.expense, 0) / byMonth.length : 0;
  const avgNet = avgIncome - avgExpense;
  const savingsRate = latest.income > 0 ? (latest.net / latest.income) * 100 : 0;

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenses) map.set(row.category, (map.get(row.category) ?? 0) + row.amount);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const incomeBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of incomes) map.set(row.source, (map.get(row.source) ?? 0) + row.amount);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [incomes]);

  const maxCategory = Math.max(1, ...expenseByCategory.map((x) => x.value));
  const maxSource = Math.max(1, ...incomeBySource.map((x) => x.value));

  const importStatement = async () => {
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
      const mapped = mapRowsToCashflow(loaded.rows);
      mapped.incomes.forEach((entry) => addIncome(entry));
      mapped.expenses.forEach((entry) => addExpense(entry));
      setImportStatus(
        `${t("Imported", "Importiert")} ${mapped.incomes.length + mapped.expenses.length} ${t("rows", "Zeilen")} ` +
        `(${mapped.incomes.length} ${t("income", "Einnahmen")}, ${mapped.expenses.length} ${t("expense", "Ausgaben")}). ` +
        `${t("Skipped", "Uebersprungen")}: ${mapped.skipped}.`
      );
    } catch {
      setImportStatus(t("Import failed. Try a clean CSV/XLSX export.", "Import fehlgeschlagen. Bitte eine saubere CSV/XLSX-Datei verwenden."));
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 118 }}
      onScroll={(e) => setCompactHeader(e.nativeEvent.contentOffset.y > 120)}
      scrollEventThrottle={16}
    >
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
          <Text style={{ color: colors.text, fontWeight: "800" }}>{tx("Cashflow")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{byMonth.length} {t("months tracked", "Monate erfasst")}</Text>
        </View>
      )}

      <TabHeader
        title={tx("Cashflow")}
        subtitle={t(
          "Track inflows and outflows with category analytics, trend bars, and source intelligence.",
          "Verfolge Ein- und Auszahlungen mit Kategorie-Analysen, Trendbalken und Quellen-Insights."
        )}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Import Statement", "Kontoauszug importieren")}</Text>
              <Text style={{ color: colors.subtext, marginTop: 2, fontSize: 12 }}>
                {t(
                  "Upload CSV/XLSX/JSON/TXT and auto-create income + expense entries with categories.",
                  "CSV/XLSX/JSON/TXT hochladen und Einnahmen + Ausgaben mit Kategorien automatisch erstellen."
                )}
              </Text>
            </View>
            <ActionButton
              label={importBusy ? t("Importing...", "Importiere...") : t("Import File", "Datei importieren")}
              onPress={() => {
                if (importBusy) return;
                void importStatement();
              }}
              style={{ minWidth: 106 }}
            />
          </View>
          {!!importStatus && <Text style={{ color: colors.subtext, marginTop: 7, fontSize: 12 }}>{importStatus}</Text>}
        </View>

        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Latest Net", "Letztes Netto")}</Text>
            <Text style={{ color: latest.net >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(latest.net)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Savings Rate", "Sparquote")}</Text>
            <Text style={{ color: savingsRate >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{savingsRate.toFixed(2)}%</Text>
          </View>
        </View>

        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Log Income", "Einnahme erfassen")}</Text>
            <ActionButton label={showIncomeForm ? t("Close", "Schliessen") : t("Add Income", "Einnahme hinzufuegen")} onPress={() => setShowIncomeForm((v) => !v)}/>
          </View>
          {showIncomeForm ? (
            <>
          <FormInput
            value={source}
            onChangeText={setSource}
            label={t("Income Source", "Einnahmequelle")}
            placeholder={t("e.g. Salary, Freelance, Dividends", "z.B. Gehalt, Freelance, Dividenden")}
            help={t("Where this income came from.", "Woher diese Einnahme stammt.")}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FormInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" label={t("Income Amount", "Einnahmebetrag")} placeholder={t("e.g. 5000", "z.B. 5000")} help={t("Gross amount received.", "Erhaltener Bruttobetrag.")} style={{ flex: 1 }} />
            <FormInput value={date} onChangeText={setDate} label={t("Income Date", "Einnahmedatum")} placeholder="YYYY-MM-DD" help={t("Entry date in ISO format.", "Eintragsdatum im ISO-Format.")} style={{ flex: 1 }} />
          </View>
          <ActionButton
            label={t("Add Income", "Einnahme hinzufuegen")}
            onPress={() => addIncome({ source, amount: Number(amount), date })}
            style={{ alignSelf: "flex-start" }}
          />
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Log Expense", "Ausgabe erfassen")}</Text>
            <ActionButton label={showExpenseForm ? t("Close", "Schliessen") : t("Add Expense", "Ausgabe hinzufuegen")} onPress={() => setShowExpenseForm((v) => !v)}/>
          </View>
          {showExpenseForm ? (
            <>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Expense Category", "Ausgabenkategorie")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SPENDING_CATEGORIES.map((cat) => {
              const active = expenseCategory === cat.name;
              return (
                <Pressable
                  key={cat.name}
                  onPress={() => {
                    setExpenseCategory(cat.name);
                    setExpenseSubcategory(cat.subcategories[0] ?? "General");
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{cat.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Expense Subcategory", "Ausgabe-Unterkategorie")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(selectedExpenseCategory?.subcategories ?? ["General"]).map((sub) => {
              const active = expenseSubcategory === sub;
              return (
                <Pressable
                  key={sub}
                  onPress={() => setExpenseSubcategory(sub)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#5F43B2" : colors.border,
                    backgroundColor: pressed ? (colors.dark ? "#151522" : "#EDF2FF") : active ? (colors.dark ? "#17132A" : "#EEE8FF") : colors.surface,
                  })}
                >
                  <Text style={{ color: active ? "#7E5CE6" : colors.subtext, fontWeight: "700", fontSize: 12 }}>{sub}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FormInput value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" label={t("Expense Amount", "Ausgabebetrag")} placeholder={t("e.g. 75", "z.B. 75")} help={t("Money spent on this item.", "Fuer diesen Posten ausgegebenes Geld.")} style={{ flex: 1 }} />
            <FormInput value={expenseDate} onChangeText={setExpenseDate} label={t("Expense Date", "Ausgabedatum")} placeholder="YYYY-MM-DD" help={t("Entry date in ISO format.", "Eintragsdatum im ISO-Format.")} style={{ flex: 1 }} />
          </View>
          <FormInput value={expenseNote} onChangeText={setExpenseNote} label={t("Expense Note (Optional)", "Ausgaben-Notiz (optional)")} placeholder={t("Short context...", "Kurzer Kontext...")} help={t("Add details for later review.", "Details fuer spaetere Pruefung hinzufuegen.")} />
          <ActionButton
            label={t("Add Expense", "Ausgabe hinzufuegen")}
            onPress={() =>
              addExpense({
                category: expenseCategory,
                subcategory: expenseSubcategory,
                amount: Number(expenseAmount),
                date: expenseDate,
                note: expenseNote,
                bucket: defaultBucketForCategory(expenseCategory),
              })
            }
            style={{ alignSelf: "flex-start" }}
          />
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Latest Income", "Letzte Einnahmen")}</Text>
            <Text style={{ color: "#8ED3FF", marginTop: 4, fontWeight: "900" }}>{toMoney(latest.income)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Latest Expense", "Letzte Ausgaben")}</Text>
            <Text style={{ color: "#FF97A8", marginTop: 4, fontWeight: "900" }}>{toMoney(latest.expense)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Avg Monthly Net", "Durchschn. Monats-Netto")}</Text>
            <Text style={{ color: avgNet >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(avgNet)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Latest Savings Rate", "Letzte Sparquote")}</Text>
            <Text style={{ color: savingsRate >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{savingsRate.toFixed(2)}%</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Monthly Trend", "Monatstrend")}</Text>
          <View style={{ marginTop: 8, gap: 6 }}>
            {byMonth.slice(0, 12).map((row) => (
              <View key={row.month}>
                <Text style={{ color: colors.subtext, fontSize: 12 }}>
                  {row.month} • in {toMoney(row.income)} • out {toMoney(row.expense)} • net {toMoney(row.net)}
                </Text>
                <View style={{ marginTop: 4, height: 8, borderRadius: 999, backgroundColor: "#1A2438", overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${Math.min(100, Math.max(0, (row.income > 0 ? (row.net / row.income) * 100 : 0) + 50))}%`, backgroundColor: row.net >= 0 ? "#5CE0AB" : "#FF8497" }} />
                </View>
              </View>
            ))}
            {!byMonth.length && <Text style={{ color: colors.subtext }}>{t("No monthly history yet.", "Noch kein Monatsverlauf vorhanden.")}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Expense Category Breakdown", "Ausgabenkategorien-Aufschluesselung")}</Text>
          <View style={{ marginTop: 8, gap: 7 }}>
            {expenseByCategory.slice(0, 8).map((row) => (
              <View key={row.name}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.subtext }}>{row.name}</Text>
                  <Text style={{ color: "#FF9EB0", fontWeight: "700" }}>{toMoney(row.value)}</Text>
                </View>
                <View style={{ marginTop: 4, height: 7, borderRadius: 999, backgroundColor: "#1A2438", overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${(row.value / maxCategory) * 100}%`, backgroundColor: "#FF7E96" }} />
                </View>
              </View>
            ))}
            {!expenseByCategory.length && <Text style={{ color: colors.subtext }}>{t("No expense categories yet.", "Noch keine Ausgabenkategorien vorhanden.")}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Income Source Breakdown", "Einnahmequellen-Aufschluesselung")}</Text>
          <View style={{ marginTop: 8, gap: 7 }}>
            {incomeBySource.slice(0, 8).map((row) => (
              <View key={row.name}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.subtext }}>{row.name}</Text>
                  <Text style={{ color: "#8ED3FF", fontWeight: "700" }}>{toMoney(row.value)}</Text>
                </View>
                <View style={{ marginTop: 4, height: 7, borderRadius: 999, backgroundColor: "#1A2438", overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${(row.value / maxSource) * 100}%`, backgroundColor: "#73CFFF" }} />
                </View>
              </View>
            ))}
            {!incomeBySource.length && <Text style={{ color: colors.subtext }}>{t("No income sources yet.", "Noch keine Einnahmequellen vorhanden.")}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Logged Income", "Erfasste Einnahmen")}</Text>
            <ActionButton
              label={showIncomeLogs ? t("Collapse", "Einklappen") : t("Expand", "Ausklappen")}
              onPress={() => setShowIncomeLogs((v) => !v)}
              style={{ minWidth: 100, minHeight: 38, paddingHorizontal: 10 }}
            />
          </View>
          {showIncomeLogs ? (
            <View style={{ marginTop: 8, gap: 8 }}>
              {incomes.slice(0, 20).map((row) => (
                <View key={row.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>{row.source}</Text>
                    <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeIncome(row.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>{row.date} • {toMoney(row.amount)}</Text>
                  <FormInput value={String(row.amount)} onChangeText={(v) => updateIncome(row.id, { amount: Number(v) || 0 })} keyboardType="decimal-pad" label={t("Update Income Amount", "Einnahmebetrag aktualisieren")} style={{ marginTop: 6, paddingVertical: 7 }} />
                </View>
              ))}
              {!incomes.length && <Text style={{ color: colors.subtext }}>{t("No income entries yet.", "Noch keine Einnahmen erfasst.")}</Text>}
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>{t("Income entries collapsed.", "Einnahmen eingeklappt.")}</Text>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Logged Expenses", "Erfasste Ausgaben")}</Text>
            <ActionButton
              label={showExpenseLogs ? t("Collapse", "Einklappen") : t("Expand", "Ausklappen")}
              onPress={() => setShowExpenseLogs((v) => !v)}
              style={{ minWidth: 100, minHeight: 38, paddingHorizontal: 10 }}
            />
          </View>
          {showExpenseLogs ? (
            <View style={{ marginTop: 8, gap: 8 }}>
              {expenses.slice(0, 20).map((row) => (
                <View key={row.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>{row.category} • {row.subcategory}</Text>
                    <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeExpense(row.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>{row.date} • {toMoney(row.amount)}</Text>
                  {!!row.note && <Text style={{ color: colors.subtext, marginTop: 4 }}>{row.note}</Text>}
                  <FormInput value={String(row.amount)} onChangeText={(v) => updateExpense(row.id, { amount: Number(v) || 0 })} keyboardType="decimal-pad" label={t("Update Expense Amount", "Ausgabebetrag aktualisieren")} style={{ marginTop: 6, paddingVertical: 7 }} />
                </View>
              ))}
              {!expenses.length && <Text style={{ color: colors.subtext }}>{t("No expense entries yet.", "Noch keine Ausgaben erfasst.")}</Text>}
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>{t("Expense entries collapsed.", "Ausgaben eingeklappt.")}</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
