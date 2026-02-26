import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPENDING_CATEGORIES, SpendingBucket, defaultBucketForCategory } from "../../src/catalog/spending-categories";
import { useI18n } from "../../src/i18n/use-i18n";
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

function pct(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const { budgets, expenses, addBudget, updateBudget, removeBudget, addExpense, updateExpense, removeExpense } = useFinanceTools();
  const colors = useAppColors();
  const { t, tx } = useI18n();

  const [compactHeader, setCompactHeader] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBudgetLogs, setShowBudgetLogs] = useState(false);
  const [showExpenseLogs, setShowExpenseLogs] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useLogoScrollToTop(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  });

  const [budgetCategory, setBudgetCategory] = useState(SPENDING_CATEGORIES[0]?.name ?? "Housing");
  const [budgetPlanned, setBudgetPlanned] = useState("2000");
  const [budgetSpent, setBudgetSpent] = useState("0");

  const [expenseCategory, setExpenseCategory] = useState(SPENDING_CATEGORIES[1]?.name ?? "Food");
  const [expenseSubcategory, setExpenseSubcategory] = useState(SPENDING_CATEGORIES[1]?.subcategories[0] ?? "Groceries");
  const [expenseAmount, setExpenseAmount] = useState("50");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseBucket, setExpenseBucket] = useState<SpendingBucket>(defaultBucketForCategory(SPENDING_CATEGORIES[1]?.name ?? "Food"));
  const [expenseNote, setExpenseNote] = useState("");
  const selectedExpenseCategory = SPENDING_CATEGORIES.find((c) => c.name === expenseCategory) ?? SPENDING_CATEGORIES[0];

  const totalPlanned = budgets.reduce((sum, b) => sum + b.planned, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenses) map.set(row.category, (map.get(row.category) ?? 0) + row.amount);
    return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const bySubcategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenses) map.set(`${row.category}/${row.subcategory}`, (map.get(`${row.category}/${row.subcategory}`) ?? 0) + row.amount);
    return [...map.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const bucketTotals = useMemo(() => {
    const totals: Record<SpendingBucket, number> = { need: 0, want: 0, saving: 0 };
    for (const row of expenses) totals[row.bucket] += row.amount;
    return totals;
  }, [expenses]);

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
          <Text style={{ color: colors.text, fontWeight: "800" }}>{tx("Budget")}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{expenses.length} {t("expenses", "Ausgaben")}</Text>
        </View>
      )}

      <TabHeader
        title={tx("Budget")}
        subtitle={t(
          "Manual budget and expense tracking with detailed category/subcategory insight.",
          "Manuelles Budget- und Ausgabentracking mit detaillierten Kategorie-/Unterkategorie-Insights."
        )}
      />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Total Planned", "Gesamt geplant")}</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>{toMoney(totalPlanned)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Total Spent", "Gesamt ausgegeben")}</Text>
            <Text style={{ color: totalSpent <= totalPlanned ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(totalSpent)}</Text>
          </View>
        </View>

        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Add Budget Category", "Budgetkategorie hinzufuegen")}</Text>
            <ActionButton label={showBudgetForm ? t("Close", "Schliessen") : t("Add Budget", "Budget hinzufuegen")} onPress={() => setShowBudgetForm((v) => !v)}/>
          </View>
          {!showBudgetForm && null}
          {showBudgetForm && (
            <>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Budget Category", "Budgetkategorie")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SPENDING_CATEGORIES.map((cat) => {
              const active = budgetCategory === cat.name;
              return (
                <Pressable
                  key={cat.name}
                  onPress={() => setBudgetCategory(cat.name)}
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FormInput value={budgetPlanned} onChangeText={setBudgetPlanned} keyboardType="decimal-pad" label={t("Planned Amount", "Geplanter Betrag")} placeholder={t("e.g. 2000", "z.B. 2000")} help={t("Budget cap for this category.", "Budgetobergrenze fuer diese Kategorie.")} style={{ flex: 1 }} />
            <FormInput value={budgetSpent} onChangeText={setBudgetSpent} keyboardType="decimal-pad" label={t("Already Spent", "Bereits ausgegeben")} placeholder={t("e.g. 1200", "z.B. 1200")} help={t("Optional starting spent value.", "Optionaler Startwert fuer ausgegeben.")} style={{ flex: 1 }} />
          </View>
          <ActionButton
            label={t("Add Budget", "Budget hinzufuegen")}
            onPress={() => addBudget({ category: budgetCategory, planned: Number(budgetPlanned), spent: Number(budgetSpent) })}
            style={{ alignSelf: "flex-start" }}
          />
            </>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Log Expense", "Ausgabe erfassen")}</Text>
            <ActionButton label={showExpenseForm ? t("Close", "Schliessen") : t("Add Expense", "Ausgabe hinzufuegen")} onPress={() => setShowExpenseForm((v) => !v)}/>
          </View>
          {!showExpenseForm && null}
          {showExpenseForm && (
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
                    setExpenseBucket(defaultBucketForCategory(cat.name));
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

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["need", "want", "saving"] as const).map((value) => {
              const active = expenseBucket === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setExpenseBucket(value)}
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FormInput value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" label={t("Expense Amount", "Ausgabebetrag")} placeholder={t("e.g. 45", "z.B. 45")} help={t("Transaction amount.", "Transaktionsbetrag.")} style={{ flex: 1 }} />
            <FormInput value={expenseDate} onChangeText={setExpenseDate} label={t("Expense Date", "Ausgabedatum")} placeholder="YYYY-MM-DD" help={t("Date format for trend tracking.", "Datumsformat fuer Trend-Tracking.")} style={{ flex: 1 }} />
          </View>
          <FormInput value={expenseNote} onChangeText={setExpenseNote} label={t("Note (Optional)", "Notiz (optional)")} placeholder={t("Description/context", "Beschreibung/Kontext")} help={t("Add short context for the expense.", "Kurzen Kontext zur Ausgabe hinzufuegen.")} />

          <ActionButton
            label={t("Add Expense", "Ausgabe hinzufuegen")}
            onPress={() => addExpense({ category: expenseCategory, subcategory: expenseSubcategory, amount: Number(expenseAmount), date: expenseDate, note: expenseNote, bucket: expenseBucket })}
            style={{ alignSelf: "flex-start" }}
          />
            </>
          )}
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Total Planned", "Gesamt geplant")}</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>{toMoney(totalPlanned)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{t("Total Spent", "Gesamt ausgegeben")}</Text>
            <Text style={{ color: totalSpent <= totalPlanned ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(totalSpent)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Bucket Mix", "Bucket-Mix")}</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>
            {t("Need", "Need")} {toMoney(bucketTotals.need)} • {t("Want", "Want")} {toMoney(bucketTotals.want)} • {t("Saving", "Sparen")} {toMoney(bucketTotals.saving)}
          </Text>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Top Categories", "Top-Kategorien")}</Text>
          <View style={{ marginTop: 6, gap: 3 }}>
            {byCategory.slice(0, 8).map((row) => (
              <Text key={row.category} style={{ color: colors.subtext }}>{row.category}: {toMoney(row.amount)}</Text>
            ))}
            {!byCategory.length && <Text style={{ color: "#8E99BA" }}>{t("No data yet.", "Noch keine Daten vorhanden.")}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Top Subcategories", "Top-Unterkategorien")}</Text>
          <View style={{ marginTop: 6, gap: 3 }}>
            {bySubcategory.slice(0, 10).map((row) => (
              <Text key={row.label} style={{ color: colors.subtext }}>{row.label}: {toMoney(row.amount)}</Text>
            ))}
            {!bySubcategory.length && <Text style={{ color: "#8E99BA" }}>{t("No data yet.", "Noch keine Daten vorhanden.")}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("Logged Budget Categories", "Erfasste Budgetkategorien")}</Text>
            <ActionButton
              label={showBudgetLogs ? t("Collapse", "Einklappen") : t("Expand", "Ausklappen")}
              onPress={() => setShowBudgetLogs((v) => !v)}
              style={{ minWidth: 100, minHeight: 38, paddingHorizontal: 10 }}
            />
          </View>
          {showBudgetLogs ? (
            <View style={{ marginTop: 8, gap: 8 }}>
              {budgets.map((budget, index) => {
                const remaining = budget.planned - budget.spent;
                const used = budget.planned > 0 ? (budget.spent / budget.planned) * 100 : 0;
                return (
                  <View key={`${budget.id}_${index}`} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#F1F4FF", fontWeight: "800" }}>{budget.category}</Text>
                      <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeBudget(budget.id)} style={{ minWidth: 96 }} />
                    </View>
                    <Text style={{ color: "#A4B1D4", marginTop: 4 }}>{t("Planned", "Geplant")} {toMoney(budget.planned)} • {t("Spent", "Ausgegeben")} {toMoney(budget.spent)}</Text>
                    <Text style={{ color: remaining >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "700" }}>{t("Remaining", "Verbleibend")} {toMoney(remaining)} • {pct(used)} {t("used", "verbraucht")}</Text>
                    <TextInput value={String(budget.spent)} onChangeText={(v) => updateBudget(budget.id, { spent: Number(v) || 0 })} keyboardType="decimal-pad" placeholder={t("Update spent", "Ausgegeben aktualisieren")} placeholderTextColor={colors.subtext} style={{ marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 7 }} />
                  </View>
                );
              })}
              {!budgets.length && <Text style={{ color: colors.subtext }}>{t("No budget entries yet.", "Noch keine Budgeteintraege vorhanden.")}</Text>}
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>{t("Budget entries collapsed.", "Budgeteintraege eingeklappt.")}</Text>
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
              {expenses.slice(0, 30).map((row) => (
                <View key={row.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: "#F1F4FF", fontWeight: "800" }}>{row.category} • {row.subcategory}</Text>
                    <ActionButton label={t("Remove", "Entfernen")} onPress={() => removeExpense(row.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: "#A4B1D4", marginTop: 4 }}>{row.date} • {row.bucket.toUpperCase()} • {toMoney(row.amount)}</Text>
                  {!!row.note && <Text style={{ color: "#8E99BA", marginTop: 4 }}>{row.note}</Text>}
                  <TextInput value={String(row.amount)} onChangeText={(v) => updateExpense(row.id, { amount: Number(v) || 0 })} keyboardType="decimal-pad" placeholder={t("Update amount", "Betrag aktualisieren")} placeholderTextColor={colors.subtext} style={{ marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 7 }} />
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
