import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { defaultBucketForCategory, normalizeSpendingCategory } from "../catalog/spending-categories";
import { TRACKED_COINS } from "../catalog/coins";

export type PortfolioHolding = {
  id: string;
  assetId?: string;
  symbol: string;
  quoteSymbol?: string;
  name: string;
  kind: "stock" | "etf" | "crypto";
  coinGeckoId?: string;
  exchange?: string;
  quantity: number;
  avgCost: number;
  costCurrency?: "USD" | "EUR";
  manualPrice?: number;
  targetWeight?: number;
  annualYieldPct?: number;
};

export type BudgetEntry = {
  id: string;
  category: string;
  planned: number;
  spent: number;
};

export type ExpenseEntry = {
  id: string;
  category: string;
  subcategory: string;
  amount: number;
  note?: string;
  date: string;
  bucket: "need" | "want" | "saving";
};

export type IncomeEntry = {
  id: string;
  source: string;
  amount: number;
  date: string;
};

export type PortfolioTransaction = {
  id: string;
  holdingId?: string;
  symbol: string;
  kind: "stock" | "etf" | "crypto";
  side: "buy" | "sell" | "dividend" | "deposit" | "withdrawal";
  quantity: number;
  price: number;
  currency?: "USD" | "EUR";
  fee: number;
  date: string;
  note?: string;
};

function upsertBudgetSpent(prev: BudgetEntry[], category: string, delta: number): BudgetEntry[] {
  if (!Number.isFinite(delta) || delta === 0) return prev;
  const normalizedCategory = normalizeSpendingCategory(category);
  const idx = prev.findIndex((row) => row.category.toLowerCase() === normalizedCategory.toLowerCase());
  if (idx < 0) {
    return [
      ...prev,
      {
        id: uid("budget"),
        category: normalizedCategory,
        planned: 0,
        spent: Math.max(0, delta),
      },
    ];
  }
  const next = [...prev];
  const row = next[idx];
  next[idx] = { ...row, category: normalizedCategory, spent: Math.max(0, row.spent + delta) };
  return next;
}

type FinanceToolsContextValue = {
  holdings: PortfolioHolding[];
  budgets: BudgetEntry[];
  expenses: ExpenseEntry[];
  incomes: IncomeEntry[];
  transactions: PortfolioTransaction[];
  addHolding: (input: {
    assetId?: string;
    symbol: string;
    quoteSymbol?: string;
    name: string;
    kind: "stock" | "etf" | "crypto";
    coinGeckoId?: string;
    exchange?: string;
    quantity: number;
    avgCost: number;
    costCurrency?: "USD" | "EUR";
    targetWeight?: number;
    annualYieldPct?: number;
    manualPrice?: number;
  }) => void;
  updateHolding: (id: string, patch: Partial<PortfolioHolding>) => void;
  removeHolding: (id: string) => void;
  addBudget: (input: { category: string; planned: number; spent?: number }) => void;
  updateBudget: (id: string, patch: Partial<BudgetEntry>) => void;
  removeBudget: (id: string) => void;
  addExpense: (input: {
    category: string;
    subcategory: string;
    amount: number;
    note?: string;
    date?: string;
    bucket: "need" | "want" | "saving";
  }) => void;
  updateExpense: (id: string, patch: Partial<ExpenseEntry>) => void;
  removeExpense: (id: string) => void;
  addIncome: (input: { source: string; amount: number; date?: string }) => void;
  updateIncome: (id: string, patch: Partial<IncomeEntry>) => void;
  removeIncome: (id: string) => void;
  addTransaction: (input: {
    holdingId?: string;
    symbol: string;
    kind: "stock" | "etf" | "crypto";
    side: "buy" | "sell" | "dividend" | "deposit" | "withdrawal";
    quantity: number;
    price: number;
    currency?: "USD" | "EUR";
    fee?: number;
    date?: string;
    note?: string;
  }) => void;
  removeTransaction: (id: string) => void;
};

const FinanceToolsContext = createContext<FinanceToolsContextValue | null>(null);
const TRACKED_COIN_ID_BY_SYMBOL = new Map<string, string>(TRACKED_COINS.map((coin) => [coin.symbol.toUpperCase(), coin.id]));

function resolveKnownCoinId(symbol: string): string | undefined {
  return TRACKED_COIN_ID_BY_SYMBOL.get(symbol.trim().toUpperCase());
}

let nextId = 1;
function uid(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
}

function seedNextIdFromIds(ids: string[]) {
  let maxSeen = nextId;
  for (const id of ids) {
    const match = /_(\d+)$/.exec(id);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > maxSeen) maxSeen = parsed;
  }
  nextId = maxSeen;
}

function ensureUniqueIds<T extends { id: string }>(rows: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      return row;
    }
    const next = { ...row, id: uid(prefix) };
    seen.add(next.id);
    return next;
  });
}

export function FinanceToolsProvider(props: { children: ReactNode }) {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadPersistedJson<{
        holdings: PortfolioHolding[];
        budgets: BudgetEntry[];
        expenses: ExpenseEntry[];
        incomes: IncomeEntry[];
        transactions: PortfolioTransaction[];
      }>("finance_tools", {
        holdings: [],
        budgets: [],
        expenses: [],
        incomes: [],
        transactions: [],
      });
      if (!alive) return;
      const loadedHoldings = Array.isArray(saved.holdings) ? ensureUniqueIds(saved.holdings, "holding") : [];
      const loadedBudgets = Array.isArray(saved.budgets) ? ensureUniqueIds(saved.budgets, "budget") : [];
      const loadedExpenses = Array.isArray(saved.expenses) ? ensureUniqueIds(saved.expenses, "expense") : [];
      const loadedIncomes = Array.isArray(saved.incomes) ? ensureUniqueIds(saved.incomes, "income") : [];
      const loadedTransactions = Array.isArray(saved.transactions) ? ensureUniqueIds(saved.transactions, "tx") : [];
      seedNextIdFromIds([
        ...loadedHoldings.map((x) => x.id),
        ...loadedBudgets.map((x) => x.id),
        ...loadedExpenses.map((x) => x.id),
        ...loadedIncomes.map((x) => x.id),
        ...loadedTransactions.map((x) => x.id),
      ]);
      setHoldings(loadedHoldings);
      setBudgets(loadedBudgets);
      setExpenses(loadedExpenses);
      setIncomes(loadedIncomes);
      setTransactions(loadedTransactions);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePersistedJson("finance_tools", {
      holdings,
      budgets,
      expenses,
      incomes,
      transactions,
    });
  }, [holdings, budgets, expenses, incomes, transactions, hydrated]);

  const value = useMemo<FinanceToolsContextValue>(() => {
    return {
      holdings,
      budgets,
      expenses,
      incomes,
      transactions,
      addHolding: (input) => {
        if (
          !input.symbol.trim() ||
          !input.name.trim() ||
          !Number.isFinite(input.quantity) ||
          !Number.isFinite(input.avgCost) ||
          input.quantity <= 0 ||
          input.avgCost < 0
        ) {
          return;
        }
        const symbol = input.symbol.trim().toUpperCase();
        const resolvedCoinId = input.kind === "crypto" ? (input.coinGeckoId || resolveKnownCoinId(symbol)) : undefined;
        const newHolding: PortfolioHolding = {
          id: uid("holding"),
          assetId: input.assetId,
          symbol,
          quoteSymbol: input.quoteSymbol,
          name: input.name.trim(),
          kind: input.kind,
          coinGeckoId: resolvedCoinId,
          exchange: input.exchange,
          quantity: input.quantity,
          avgCost: input.avgCost,
          costCurrency: input.costCurrency,
          manualPrice: Number.isFinite(input.manualPrice) ? input.manualPrice : input.kind === "crypto" ? undefined : input.avgCost,
          targetWeight: input.targetWeight,
          annualYieldPct: input.annualYieldPct,
        };
        let holdingId = newHolding.id;
        setHoldings((prev) => {
          const existing = prev.find((row) => row.symbol === symbol && row.kind === input.kind);
          if (!existing) return [...prev, newHolding];
          const oldQty = existing.quantity;
          const nextQty = oldQty + input.quantity;
          const weightedAvg = nextQty > 0 ? ((existing.avgCost * oldQty) + (input.avgCost * input.quantity)) / nextQty : input.avgCost;
          holdingId = existing.id;
          return prev.map((row) =>
            row.id === existing.id
              ? {
                  ...row,
                  quoteSymbol: input.quoteSymbol || row.quoteSymbol,
                  quantity: nextQty,
                  avgCost: weightedAvg,
                  costCurrency: input.costCurrency || row.costCurrency,
                  targetWeight: Number.isFinite(input.targetWeight) ? input.targetWeight : row.targetWeight,
                  annualYieldPct: Number.isFinite(input.annualYieldPct) ? input.annualYieldPct : row.annualYieldPct,
                  manualPrice: Number.isFinite(input.manualPrice) ? input.manualPrice : row.manualPrice,
                  coinGeckoId: resolvedCoinId || row.coinGeckoId,
                }
              : row
          );
        });
        setTransactions((prev) => [
          {
            id: uid("tx"),
            holdingId,
            symbol,
            kind: input.kind,
            side: "buy",
            quantity: input.quantity,
            price: input.avgCost,
            currency: input.costCurrency,
            fee: 0,
            date: new Date().toISOString().slice(0, 10),
            note: "Auto-created on holding add",
          },
          ...prev,
        ]);
      },
      updateHolding: (id, patch) => {
        setHoldings((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      },
      removeHolding: (id) => {
        setHoldings((prev) => prev.filter((row) => row.id !== id));
        setTransactions((prev) => prev.filter((tx) => tx.holdingId !== id));
      },
      addBudget: (input) => {
        if (!input.category.trim() || input.planned <= 0) return;
        const normalizedCategory = normalizeSpendingCategory(input.category);
        const spentFromExpenses = expenses
          .filter((row) => normalizeSpendingCategory(row.category) === normalizedCategory)
          .reduce((sum, row) => sum + row.amount, 0);
        setBudgets((prev) => {
          const idx = prev.findIndex((row) => row.category.toLowerCase() === normalizedCategory.toLowerCase());
          if (idx < 0) {
            return [
              ...prev,
              {
                id: uid("budget"),
                category: normalizedCategory,
                planned: input.planned,
                spent: Math.max(spentFromExpenses, input.spent ?? 0),
              },
            ];
          }
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            category: normalizedCategory,
            planned: input.planned,
            spent: Math.max(spentFromExpenses, input.spent ?? next[idx].spent),
          };
          return next;
        });
      },
      updateBudget: (id, patch) => {
        setBudgets((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      },
      removeBudget: (id) => {
        setBudgets((prev) => prev.filter((row) => row.id !== id));
      },
      addExpense: (input) => {
        if (!input.category.trim() || !input.subcategory.trim() || input.amount <= 0) return;
        const normalizedCategory = normalizeSpendingCategory(input.category);
        const resolvedBucket = input.bucket ?? defaultBucketForCategory(normalizedCategory);
        setExpenses((prev) => [
          {
            id: uid("expense"),
            category: normalizedCategory,
            subcategory: input.subcategory.trim(),
            amount: input.amount,
            note: input.note?.trim() || "",
            date: input.date ?? new Date().toISOString().slice(0, 10),
            bucket: resolvedBucket,
          },
          ...prev,
        ]);
        setBudgets((prev) => upsertBudgetSpent(prev, normalizedCategory, input.amount));
      },
      updateExpense: (id, patch) => {
        let oldRow: ExpenseEntry | null = null;
        let newRow: ExpenseEntry | null = null;
        setExpenses((prev) => {
          const next = prev.map((row) => {
            if (row.id !== id) return row;
            oldRow = row;
            const nextCategory = patch.category ? normalizeSpendingCategory(patch.category) : row.category;
            const updated: ExpenseEntry = {
              ...row,
              ...patch,
              category: nextCategory,
              bucket: patch.bucket ?? row.bucket,
            };
            newRow = updated;
            return updated;
          });
          return next;
        });
        if (oldRow && newRow) {
          setBudgets((prev) => {
            let next = upsertBudgetSpent(prev, oldRow!.category, -oldRow!.amount);
            next = upsertBudgetSpent(next, newRow!.category, newRow!.amount);
            return next;
          });
        }
      },
      removeExpense: (id) => {
        let removed: ExpenseEntry | null = null;
        setExpenses((prev) => {
          const idx = prev.findIndex((row) => row.id === id);
          if (idx < 0) return prev;
          removed = prev[idx];
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
        if (removed) {
          setBudgets((prev) => upsertBudgetSpent(prev, removed!.category, -removed!.amount));
        }
      },
      addIncome: (input) => {
        if (!input.source.trim() || input.amount <= 0) return;
        setIncomes((prev) => [
          {
            id: uid("income"),
            source: input.source.trim(),
            amount: input.amount,
            date: input.date ?? new Date().toISOString().slice(0, 10),
          },
          ...prev,
        ]);
      },
      updateIncome: (id, patch) => {
        setIncomes((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      },
      removeIncome: (id) => {
        setIncomes((prev) => prev.filter((row) => row.id !== id));
      },
      addTransaction: (input) => {
        if (!input.symbol.trim() || !Number.isFinite(input.price) || input.price < 0 || !Number.isFinite(input.quantity) || input.quantity <= 0) return;
        const symbol = input.symbol.trim().toUpperCase();
        let resolvedHoldingId = input.holdingId;
        let effectiveQty = input.quantity;
        let shouldCreateTx = true;
        setHoldings((prev) => {
          const idx = prev.findIndex((row) => row.id === input.holdingId || row.symbol === symbol);
          if (idx < 0) {
            if (input.side !== "buy" || input.quantity <= 0) return prev;
            const createdId = uid("holding");
            resolvedHoldingId = createdId;
            return [
              ...prev,
              {
                id: createdId,
                symbol,
                quoteSymbol: symbol,
                name: symbol,
                kind: input.kind,
                coinGeckoId: input.kind === "crypto" ? resolveKnownCoinId(symbol) : undefined,
                quantity: input.quantity,
                avgCost: input.price,
                costCurrency: input.currency,
                manualPrice: input.kind === "crypto" ? undefined : input.price,
              },
            ];
          }
          const current = prev[idx];
          resolvedHoldingId = current.id;
          const fee = Number.isFinite(input.fee) ? Number(input.fee) : 0;
          const isBuy = input.side === "buy";
          if (!isBuy) {
            if (current.quantity <= 0) {
              shouldCreateTx = false;
              return prev;
            }
            effectiveQty = Math.min(input.quantity, current.quantity);
          }
          const delta = isBuy ? effectiveQty : -effectiveQty;
          const nextQty = Math.max(0, current.quantity + delta);
          const nextAvg =
            isBuy && nextQty > 0
              ? ((current.avgCost * current.quantity) + (input.price * effectiveQty) + fee) / nextQty
              : current.avgCost;
          const next = [...prev];
          if (nextQty <= 0) {
            next.splice(idx, 1);
            return next;
          }
          next[idx] = {
            ...current,
            quoteSymbol: current.quoteSymbol || symbol,
            coinGeckoId: current.kind === "crypto" ? (current.coinGeckoId || resolveKnownCoinId(symbol)) : current.coinGeckoId,
            quantity: nextQty,
            avgCost: nextAvg,
            manualPrice: current.kind === "crypto" ? current.manualPrice : current.manualPrice ?? input.price,
          };
          return next;
        });
        if (!shouldCreateTx || effectiveQty <= 0) return;
        setTransactions((prev) => [
          {
            id: uid("tx"),
            holdingId: resolvedHoldingId,
            symbol,
            kind: input.kind,
            side: input.side,
            quantity: effectiveQty,
            price: input.price,
            currency: input.currency,
            fee: Number.isFinite(input.fee) ? Number(input.fee) : 0,
            date: input.date ?? new Date().toISOString().slice(0, 10),
            note: input.note?.trim() || "",
          },
          ...prev,
        ]);
      },
      removeTransaction: (id) => {
        setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      },
    };
  }, [holdings, budgets, expenses, incomes, transactions]);

  return <FinanceToolsContext.Provider value={value}>{props.children}</FinanceToolsContext.Provider>;
}

export function useFinanceTools() {
  const ctx = useContext(FinanceToolsContext);
  if (!ctx) throw new Error("useFinanceTools must be used inside FinanceToolsProvider");
  return ctx;
}
