export type SpendingBucket = "need" | "want" | "saving";

export type SpendingCategoryDef = {
  name: string;
  bucket: SpendingBucket;
  subcategories: string[];
};

export const SPENDING_CATEGORIES: SpendingCategoryDef[] = [
  { name: "Housing", bucket: "need", subcategories: ["Rent", "Mortgage", "Utilities", "Maintenance"] },
  { name: "Food", bucket: "need", subcategories: ["Groceries", "Dining", "Snacks", "Coffee"] },
  { name: "Transport", bucket: "need", subcategories: ["Fuel", "Public Transit", "Ride Share", "Car Payment"] },
  { name: "Healthcare", bucket: "need", subcategories: ["Insurance", "Pharmacy", "Doctor", "Dental"] },
  { name: "Insurance", bucket: "need", subcategories: ["Health", "Auto", "Home", "Life"] },
  { name: "Debt", bucket: "need", subcategories: ["Credit Card", "Student Loan", "Personal Loan"] },
  { name: "Shopping", bucket: "want", subcategories: ["Clothing", "Electronics", "Home Goods"] },
  { name: "Entertainment", bucket: "want", subcategories: ["Streaming", "Games", "Events", "Travel"] },
  { name: "Education", bucket: "want", subcategories: ["Courses", "Books", "Tuition"] },
  { name: "Savings", bucket: "saving", subcategories: ["Emergency Fund", "Brokerage", "Retirement"] },
  { name: "Investing", bucket: "saving", subcategories: ["ETF Buy", "Stock Buy", "Crypto Buy"] },
  { name: "Taxes", bucket: "need", subcategories: ["Income Tax", "Property Tax", "VAT"] },
];

export const SPENDING_CATEGORY_NAMES = SPENDING_CATEGORIES.map((c) => c.name);

export function normalizeSpendingCategory(input: string): string {
  const raw = input.trim();
  if (!raw) return SPENDING_CATEGORIES[0]?.name ?? "General";
  const exact = SPENDING_CATEGORIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
  if (exact) return exact.name;
  const partial = SPENDING_CATEGORIES.find((c) => c.name.toLowerCase().includes(raw.toLowerCase()));
  return partial?.name ?? raw;
}

export function defaultBucketForCategory(category: string): SpendingBucket {
  const normalized = normalizeSpendingCategory(category);
  return SPENDING_CATEGORIES.find((c) => c.name === normalized)?.bucket ?? "need";
}

