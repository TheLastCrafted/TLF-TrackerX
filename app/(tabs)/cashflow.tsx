import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPENDING_CATEGORIES, defaultBucketForCategory } from "../../src/catalog/spending-categories";
import { useFinanceTools } from "../../src/state/finance-tools";
import { FormInput } from "../../src/ui/form-input";
import { ActionButton } from "../../src/ui/action-button";
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

  const [compactHeader, setCompactHeader] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeLogs, setShowIncomeLogs] = useState(false);
  const [showExpenseLogs, setShowExpenseLogs] = useState(false);
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
          <Text style={{ color: colors.text, fontWeight: "800" }}>Cashflow</Text>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{byMonth.length} months tracked</Text>
        </View>
      )}

      <TabHeader title="Cashflow" subtitle="Track inflows and outflows with category analytics, trend bars, and source intelligence." />

      <View style={{ paddingHorizontal: SCREEN_HORIZONTAL_PADDING }}>
        <View style={{ marginBottom: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Latest Net</Text>
            <Text style={{ color: latest.net >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(latest.net)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Savings Rate</Text>
            <Text style={{ color: savingsRate >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{savingsRate.toFixed(2)}%</Text>
          </View>
        </View>

        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Log Income</Text>
            <ActionButton label={showIncomeForm ? "Close" : "Add Income"} onPress={() => setShowIncomeForm((v) => !v)}/>
          </View>
          {showIncomeForm ? (
            <>
          <FormInput value={source} onChangeText={setSource} label="Income Source" placeholder="e.g. Salary, Freelance, Dividends" help="Where this income came from." />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FormInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" label="Income Amount" placeholder="e.g. 5000" help="Gross amount received." style={{ flex: 1 }} />
            <FormInput value={date} onChangeText={setDate} label="Income Date" placeholder="YYYY-MM-DD" help="Entry date in ISO format." style={{ flex: 1 }} />
          </View>
          <ActionButton
            label="Add Income"
            onPress={() => addIncome({ source, amount: Number(amount), date })}
            style={{ alignSelf: "flex-start" }}
          />
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Log Expense</Text>
            <ActionButton label={showExpenseForm ? "Close" : "Add Expense"} onPress={() => setShowExpenseForm((v) => !v)}/>
          </View>
          {showExpenseForm ? (
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FormInput value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" label="Expense Amount" placeholder="e.g. 75" help="Money spent on this item." style={{ flex: 1 }} />
            <FormInput value={expenseDate} onChangeText={setExpenseDate} label="Expense Date" placeholder="YYYY-MM-DD" help="Entry date in ISO format." style={{ flex: 1 }} />
          </View>
          <FormInput value={expenseNote} onChangeText={setExpenseNote} label="Expense Note (Optional)" placeholder="Short context..." help="Add details for later review." />
          <ActionButton
            label="Add Expense"
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
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Latest Income</Text>
            <Text style={{ color: "#8ED3FF", marginTop: 4, fontWeight: "900" }}>{toMoney(latest.income)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Latest Expense</Text>
            <Text style={{ color: "#FF97A8", marginTop: 4, fontWeight: "900" }}>{toMoney(latest.expense)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Avg Monthly Net</Text>
            <Text style={{ color: avgNet >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{toMoney(avgNet)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Latest Savings Rate</Text>
            <Text style={{ color: savingsRate >= 0 ? "#5CE0AB" : "#FF8497", marginTop: 4, fontWeight: "900" }}>{savingsRate.toFixed(2)}%</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Monthly Trend</Text>
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
            {!byMonth.length && <Text style={{ color: colors.subtext }}>No monthly history yet.</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Expense Category Breakdown</Text>
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
            {!expenseByCategory.length && <Text style={{ color: colors.subtext }}>No expense categories yet.</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Income Source Breakdown</Text>
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
            {!incomeBySource.length && <Text style={{ color: colors.subtext }}>No income sources yet.</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Logged Income</Text>
            <ActionButton
              label={showIncomeLogs ? "Collapse" : "Expand"}
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
                    <ActionButton label="Remove" onPress={() => removeIncome(row.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>{row.date} • {toMoney(row.amount)}</Text>
                  <FormInput value={String(row.amount)} onChangeText={(v) => updateIncome(row.id, { amount: Number(v) || 0 })} keyboardType="decimal-pad" label="Update Income Amount" style={{ marginTop: 6, paddingVertical: 7 }} />
                </View>
              ))}
              {!incomes.length && <Text style={{ color: colors.subtext }}>No income entries yet.</Text>}
            </View>
          ) : (
            <Text style={{ color: colors.subtext, marginTop: 8, fontSize: 12 }}>Income entries collapsed.</Text>
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
              {expenses.slice(0, 20).map((row) => (
                <View key={row.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>{row.category} • {row.subcategory}</Text>
                    <ActionButton label="Remove" onPress={() => removeExpense(row.id)} style={{ minWidth: 96 }} />
                  </View>
                  <Text style={{ color: colors.subtext, marginTop: 4 }}>{row.date} • {toMoney(row.amount)}</Text>
                  {!!row.note && <Text style={{ color: colors.subtext, marginTop: 4 }}>{row.note}</Text>}
                  <FormInput value={String(row.amount)} onChangeText={(v) => updateExpense(row.id, { amount: Number(v) || 0 })} keyboardType="decimal-pad" label="Update Expense Amount" style={{ marginTop: 6, paddingVertical: 7 }} />
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
