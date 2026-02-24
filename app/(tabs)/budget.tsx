import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPENDING_CATEGORIES, SpendingBucket, defaultBucketForCategory } from "../../src/catalog/spending-categories";
import { useFinanceTools } from "../../src/state/finance-tools";
import { FormInput } from "../../src/ui/form-input";
import { ActionButton } from "../../src/ui/action-button";
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

  const [compactHeader, setCompactHeader] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBudgetLogs, setShowBudgetLogs] = useState(false);
  const [showExpenseLogs, setShowExpenseLogs] = useState(false);

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
          <Text style={{ color: colors.text, fontWeight: "800" }}>Budget</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{expenses.length} expenses</Text>
        </View>
      )}

      <TabHeader title="Budget" subtitle="Manual budget and expense tracking with detailed category/subcategory insight." />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Total Planned</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>{toMoney(totalPlanned)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Total Spent</Text>
            <Text style={{ color: totalSpent <= totalPlanned ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(totalSpent)}</Text>
          </View>
        </View>

        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Add Budget Category</Text>
            <ActionButton label={showBudgetForm ? "Close" : "Add Budget"} onPress={() => setShowBudgetForm((v) => !v)}/>
          </View>
          {!showBudgetForm && null}
          {showBudgetForm && (
            <>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>Budget Category</Text>
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
            <FormInput value={budgetPlanned} onChangeText={setBudgetPlanned} keyboardType="decimal-pad" label="Planned Amount" placeholder="e.g. 2000" help="Budget cap for this category." style={{ flex: 1 }} />
            <FormInput value={budgetSpent} onChangeText={setBudgetSpent} keyboardType="decimal-pad" label="Already Spent" placeholder="e.g. 1200" help="Optional starting spent value." style={{ flex: 1 }} />
          </View>
          <ActionButton
            label="Add Budget"
            onPress={() => addBudget({ category: budgetCategory, planned: Number(budgetPlanned), spent: Number(budgetSpent) })}
            style={{ alignSelf: "flex-start" }}
          />
            </>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Log Expense</Text>
            <ActionButton label={showExpenseForm ? "Close" : "Add Expense"} onPress={() => setShowExpenseForm((v) => !v)}/>
          </View>
          {!showExpenseForm && null}
          {showExpenseForm && (
            <>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>Expense Category</Text>
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

          <Text style={{ color: colors.subtext, fontSize: 12 }}>Expense Subcategory</Text>
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
            <FormInput value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" label="Expense Amount" placeholder="e.g. 45" help="Transaction amount." style={{ flex: 1 }} />
            <FormInput value={expenseDate} onChangeText={setExpenseDate} label="Expense Date" placeholder="YYYY-MM-DD" help="Date format for trend tracking." style={{ flex: 1 }} />
          </View>
          <FormInput value={expenseNote} onChangeText={setExpenseNote} label="Note (Optional)" placeholder="Description/context" help="Add short context for the expense." />

          <ActionButton
            label="Add Expense"
            onPress={() => addExpense({ category: expenseCategory, subcategory: expenseSubcategory, amount: Number(expenseAmount), date: expenseDate, note: expenseNote, bucket: expenseBucket })}
            style={{ alignSelf: "flex-start" }}
          />
            </>
          )}
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Total Planned</Text>
            <Text style={{ color: colors.text, marginTop: 4, fontWeight: "900" }}>{toMoney(totalPlanned)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Total Spent</Text>
            <Text style={{ color: totalSpent <= totalPlanned ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(totalSpent)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Bucket Mix</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>Need {toMoney(bucketTotals.need)} • Want {toMoney(bucketTotals.want)} • Saving {toMoney(bucketTotals.saving)}</Text>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Top Categories</Text>
          <View style={{ marginTop: 6, gap: 3 }}>
            {byCategory.slice(0, 8).map((row) => (
              <Text key={row.category} style={{ color: colors.subtext }}>{row.category}: {toMoney(row.amount)}</Text>
            ))}
            {!byCategory.length && <Text style={{ color: "#8E99BA" }}>No data yet.</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Top Subcategories</Text>
          <View style={{ marginTop: 6, gap: 3 }}>
            {bySubcategory.slice(0, 10).map((row) => (
              <Text key={row.label} style={{ color: colors.subtext }}>{row.label}: {toMoney(row.amount)}</Text>
            ))}
            {!bySubcategory.length && <Text style={{ color: "#8E99BA" }}>No data yet.</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Logged Budget Categories</Text>
            <ActionButton
              label={showBudgetLogs ? "Collapse" : "Expand"}
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
                      <ActionButton label="Remove" onPress={() => removeBudget(budget.id)} style={{ minWidth: 96 }} />
                    </View>
                    <Text style={{ color: "#A4B1D4", marginTop: 4 }}>Planned {toMoney(budget.planned)} • Spent {toMoney(budget.spent)}</Text>
                    <Text style={{ color: remaining >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "700" }}>Remaining {toMoney(remaining)} • {pct(used)} used</Text>
                    <TextInput value={String(budget.spent)} onChangeText={(v) => updateBudget(budget.id, { spent: Number(v) || 0 })} keyboardType="decimal-pad" placeholder="Update spent" placeholderTextColor={colors.subtext} style={{ marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 7 }} />
                  </View>
                );
              })}
              {!budgets.length && <Text style={{ color: colors.subtext }}>No budget entries yet.</Text>}
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>Budget entries collapsed.</Text>
          )}
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Logged Expenses</Text>
            <ActionButton
              label={showExpenseLogs ? "Collapse" : "Expand"}
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
                    <ActionButton label="Remove" onPress={() => removeExpense(row.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: "#A4B1D4", marginTop: 4 }}>{row.date} • {row.bucket.toUpperCase()} • {toMoney(row.amount)}</Text>
                  {!!row.note && <Text style={{ color: "#8E99BA", marginTop: 4 }}>{row.note}</Text>}
                  <TextInput value={String(row.amount)} onChangeText={(v) => updateExpense(row.id, { amount: Number(v) || 0 })} keyboardType="decimal-pad" placeholder="Update amount" placeholderTextColor={colors.subtext} style={{ marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, paddingVertical: 7 }} />
                </View>
              ))}
              {!expenses.length && <Text style={{ color: colors.subtext }}>No expense entries yet.</Text>}
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>Expense entries collapsed.</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
