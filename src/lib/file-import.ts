import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { SPENDING_CATEGORIES, defaultBucketForCategory, normalizeSpendingCategory } from "../catalog/spending-categories";

type ImportAsset = {
  uri: string;
  name?: string;
  mimeType?: string | null;
};

type GenericRow = Record<string, unknown>;

type PickResult =
  | { ok: true; asset: ImportAsset }
  | { ok: false; message: string };

type RowsResult =
  | { ok: true; rows: GenericRow[]; format: "csv" | "json" | "xlsx" | "txt" | "pdf" }
  | { ok: false; message: string };

type CashflowMapped = {
  incomes: { source: string; amount: number; date: string }[];
  expenses: {
    category: string;
    subcategory: string;
    amount: number;
    note?: string;
    date: string;
    bucket: "need" | "want" | "saving";
  }[];
  skipped: number;
};

type PortfolioMapped = {
  transactions: {
    symbol: string;
    kind: "stock" | "etf" | "crypto";
    side: "buy" | "sell" | "dividend" | "deposit" | "withdrawal";
    quantity: number;
    price: number;
    fee: number;
    date: string;
    note?: string;
  }[];
  skipped: number;
};

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseNumber(raw: unknown): number {
  const txt = valueToString(raw);
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

function parseDate(raw: unknown): string {
  const input = valueToString(raw);
  if (!input) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  const slash = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
  const m = slash.exec(input);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const yRaw = Number(m[3]);
    const c = yRaw < 100 ? 2000 + yRaw : yRaw;
    const dd = String(Math.min(31, a)).padStart(2, "0");
    const mm = String(Math.min(12, b)).padStart(2, "0");
    return `${c}-${mm}-${dd}`;
  }
  const t = new Date(input).getTime();
  if (!Number.isFinite(t)) return new Date().toISOString().slice(0, 10);
  return new Date(t).toISOString().slice(0, 10);
}

function field(row: GenericRow, keys: string[]): string {
  const normalizedLookup = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) normalizedLookup.set(normalizeKey(k), v);
  for (const key of keys) {
    const hit = normalizedLookup.get(normalizeKey(key));
    if (hit !== undefined && hit !== null && valueToString(hit)) return valueToString(hit);
  }
  for (const key of keys) {
    const target = normalizeKey(key);
    for (const [rowKey, value] of normalizedLookup.entries()) {
      if ((rowKey.includes(target) || target.includes(rowKey)) && valueToString(value)) {
        return valueToString(value);
      }
    }
  }
  return "";
}

function fieldNum(row: GenericRow, keys: string[]): number {
  for (const key of keys) {
    const v = field(row, [key]);
    const parsed = parseNumber(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function inferCategoryAndSubcategory(description: string): { category: string; subcategory: string } {
  const text = description.toLowerCase();
  const mappings: { category: string; terms: string[] }[] = [
    { category: "Food", terms: ["restaurant", "cafe", "coffee", "dining", "food", "grocery", "supermarket"] },
    { category: "Housing", terms: ["rent", "mortgage", "landlord", "property", "home"] },
    { category: "Utilities", terms: ["electric", "water", "gas", "internet", "utility", "mobile", "phone"] },
    { category: "Transportation", terms: ["uber", "taxi", "fuel", "gas station", "train", "metro", "bus", "flight"] },
    { category: "Healthcare", terms: ["pharmacy", "doctor", "hospital", "insurance"] },
    { category: "Education", terms: ["tuition", "course", "school", "university"] },
    { category: "Entertainment", terms: ["netflix", "spotify", "cinema", "game", "concert"] },
    { category: "Shopping", terms: ["amazon", "store", "shop", "retail"] },
    { category: "Investing", terms: ["broker", "exchange", "crypto", "etf", "stock"] },
    { category: "Fees", terms: ["fee", "charge", "commission"] },
  ];
  const found = mappings.find((m) => m.terms.some((t) => text.includes(t)));
  const category = normalizeSpendingCategory(found?.category ?? "Other");
  const cat = SPENDING_CATEGORIES.find((c) => c.name.toLowerCase() === category.toLowerCase());
  return { category, subcategory: cat?.subcategories?.[0] ?? "General" };
}

function parseDelimitedRows(text: string): GenericRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, count: (lines[0].match(new RegExp(`\\${d}`, "g")) ?? []).length }))
    .sort((a, b) => b.count - a.count)[0]?.d || ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const rows: GenericRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter);
    const row: GenericRow = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parsePdfTextRows(text: string): GenericRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const dateRegex = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/;
  const amountRegex = /[-(]?\$?\d[\d.,]*(?:\.\d{2})?\)?/g;
  const rows: GenericRow[] = [];
  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    const amounts = line.match(amountRegex) ?? [];
    if (!dateMatch || !amounts.length) continue;
    const amount = amounts[amounts.length - 1];
    const date = dateMatch[0];
    const desc = line
      .replace(dateMatch[0], "")
      .replace(amounts.join(" "), "")
      .replace(/\s+/g, " ")
      .trim();
    const description = desc || "Imported PDF row";
    const symbolGuess = inferSymbol(description);
    const sideGuess = /sell/i.test(description)
      ? "sell"
      : /dividend/i.test(description)
        ? "dividend"
        : /deposit/i.test(description)
          ? "deposit"
          : /withdraw/i.test(description)
            ? "withdrawal"
            : /buy/i.test(description)
              ? "buy"
              : "";
    rows.push({
      date,
      description,
      amount,
      symbol: symbolGuess,
      action: sideGuess,
    });
  }
  return rows;
}

async function parsePdfRows(asset: ImportAsset): Promise<RowsResult> {
  try {
    // Lightweight fallback parser:
    // Some PDF statements expose readable text objects. We extract those and try to map rows.
    // For scanned/encrypted PDFs this will fail gracefully.
    const raw = await (await fetch(asset.uri)).text();
    const textPieces = [...raw.matchAll(/\(([^()]*)\)/g)].map((m) => m[1] ?? "");
    const decoded = textPieces
      .map((s) => s.replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\t/g, " ").replace(/\\\(/g, "(").replace(/\\\)/g, ")"))
      .join("\n");
    const rows = parsePdfTextRows(decoded);
    if (!rows.length) {
      return {
        ok: false,
        message:
          "Could not extract rows from this PDF. For reliable import, export statement as CSV/XLSX.",
      };
    }
    return { ok: true, rows, format: "pdf" };
  } catch {
    return {
      ok: false,
      message:
        "PDF import failed for this file. Use CSV/XLSX export for highest reliability.",
    };
  }
}

export async function pickLocalImportFile(): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "text/plain",
        "application/json",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/pdf",
        "*/*",
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) {
      return { ok: false, message: "Import canceled." };
    }
    const asset = result.assets[0] as ImportAsset;
    return { ok: true, asset };
  } catch {
    return {
      ok: false,
      message: "File picker unavailable. Install expo-document-picker to enable imports.",
    };
  }
}

export async function readImportRowsFromAsset(asset: ImportAsset): Promise<RowsResult> {
  const name = (asset.name ?? "").toLowerCase();
  const ext = name.split(".").pop() ?? "";
  try {
    if (ext === "pdf") return await parsePdfRows(asset);
    if (ext === "xlsx" || ext === "xls") {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(base64, { type: "base64" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as GenericRow[];
      return { ok: true, rows, format: "xlsx" };
    }

    const response = await fetch(asset.uri);
    const text = await response.text();
    if (ext === "json") {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
      return { ok: true, rows, format: "json" };
    }
    const rows = parseDelimitedRows(text);
    return { ok: true, rows, format: ext === "txt" ? "txt" : "csv" };
  } catch {
    return { ok: false, message: "Could not read file. Try CSV/XLSX exported directly from your bank/broker." };
  }
}

export function mapRowsToCashflow(rows: GenericRow[]): CashflowMapped {
  const incomes: CashflowMapped["incomes"] = [];
  const expenses: CashflowMapped["expenses"] = [];
  let skipped = 0;
  for (const row of rows) {
    const date = parseDate(field(row, ["date", "booking date", "posted date", "value date", "transaction date"]));
    const description =
      field(row, ["description", "name", "merchant", "payee", "memo", "note", "details"]) || "Imported transaction";
    const type = field(row, ["type", "transaction type", "category"]);
    const amountCandidates = [
      fieldNum(row, ["amount", "value", "transaction amount"]),
      fieldNum(row, ["debit"]),
      fieldNum(row, ["credit"]),
      fieldNum(row, ["withdrawal"]),
      fieldNum(row, ["deposit"]),
    ].filter((n) => Number.isFinite(n));
    let amount = amountCandidates[0] ?? NaN;
    if (!Number.isFinite(amount)) {
      skipped += 1;
      continue;
    }
    if (/debit|withdraw|card|expense|payment|outflow/i.test(type) && amount > 0) amount = -amount;
    if (/credit|income|salary|deposit|refund|inflow/i.test(type) && amount < 0) amount = Math.abs(amount);

    if (amount >= 0) {
      incomes.push({
        source: description,
        amount: Math.abs(amount),
        date,
      });
    } else {
      const cat = inferCategoryAndSubcategory(description);
      expenses.push({
        category: cat.category,
        subcategory: cat.subcategory,
        amount: Math.abs(amount),
        note: description,
        date,
        bucket: defaultBucketForCategory(cat.category),
      });
    }
  }
  return { incomes, expenses, skipped };
}

function inferSymbol(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, " ").trim();
  if (!cleaned) return "";
  const isin = cleaned.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  if (isin?.[0]) return isin[0];
  const inParens = raw.match(/\(([A-Z0-9.\-]{1,12})\)/);
  if (inParens?.[1]) return inParens[1].toUpperCase();
  const first = cleaned.split(/\s+/)[0] ?? "";
  if (first.length >= 1 && first.length <= 12) return first;
  return "";
}

function inferKind(sideText: string, symbol: string, hint: string): "stock" | "etf" | "crypto" {
  const txt = `${sideText} ${hint} ${symbol}`.toLowerCase();
  if (/btc|eth|sol|ada|xrp|dot|doge|crypto|coin/.test(txt)) return "crypto";
  if (/etf|fund|ucits|ishares|vanguard|spdr/.test(txt)) return "etf";
  return "stock";
}

export function mapRowsToPortfolioTransactions(rows: GenericRow[]): PortfolioMapped {
  const transactions: PortfolioMapped["transactions"] = [];
  let skipped = 0;
  for (const row of rows) {
    const sideRaw = field(row, [
      "side",
      "action",
      "type",
      "transaction type",
      "buchung",
      "transaktionstyp",
      "order type",
    ]).toLowerCase();
    const note = field(row, [
      "description",
      "security",
      "name",
      "memo",
      "note",
      "asset name",
      "instrument",
      "bezeichnung",
      "produkt",
      "wertpapier",
      "title",
    ]);
    const symbolRaw = field(row, [
      "symbol",
      "ticker",
      "asset",
      "instrument",
      "security",
      "isin",
      "wkn",
      "valor",
      "instrument symbol",
      "trade symbol",
    ]) || note;
    const symbol = inferSymbol(symbolRaw);
    const date = parseDate(field(row, [
      "date",
      "trade date",
      "execution date",
      "transaction date",
      "datum",
      "buchungstag",
      "valuta",
    ]));
    const qty = parseNumber(field(row, ["quantity", "qty", "shares", "units", "stk", "stueck", "stück", "anzahl"]));
    const price = parseNumber(field(row, [
      "price",
      "fill price",
      "avg price",
      "rate",
      "kurs",
      "ausfuehrungskurs",
      "ausführungskurs",
      "stückpreis",
      "stueckpreis",
    ]));
    const amount = parseNumber(field(row, [
      "amount",
      "value",
      "gross amount",
      "net amount",
      "betrag",
      "gesamt",
      "summe",
      "cash amount",
      "transaktionswert",
    ]));
    const fee = parseNumber(field(row, ["fee", "commission", "charges", "gebuehr", "gebühr", "kosten"]));

    let side: "buy" | "sell" | "dividend" | "deposit" | "withdrawal" = "buy";
    if (/sell/.test(sideRaw)) side = "sell";
    else if (/dividend/.test(sideRaw)) side = "dividend";
    else if (/deposit|transfer in/.test(sideRaw)) side = "deposit";
    else if (/withdraw|transfer out/.test(sideRaw)) side = "withdrawal";
    else if (/buy/.test(sideRaw)) side = "buy";
    else if (/kauf/.test(sideRaw)) side = "buy";
    else if (/verkauf/.test(sideRaw)) side = "sell";
    else if (/dividende/.test(sideRaw)) side = "dividend";
    else if (/einzahlung/.test(sideRaw)) side = "deposit";
    else if (/auszahlung|entnahme/.test(sideRaw)) side = "withdrawal";
    else if (Number.isFinite(amount)) {
      if (amount < 0) side = "buy";
      if (amount > 0) side = "sell";
    }

    let finalQty = Number.isFinite(qty) && qty > 0 ? qty : side === "buy" || side === "sell" ? NaN : 1;
    if (!Number.isFinite(finalQty) && Number.isFinite(amount) && Number.isFinite(price) && price > 0) {
      finalQty = Math.abs(amount) / price;
    }
    const finalPrice =
      Number.isFinite(price) && price >= 0
        ? price
        : Number.isFinite(amount) && Number.isFinite(finalQty) && finalQty > 0
          ? Math.abs(amount) / finalQty
          : side === "dividend" || side === "deposit" || side === "withdrawal"
            ? Math.abs(amount)
            : NaN;

    if (!symbol || !Number.isFinite(finalQty) || !Number.isFinite(finalPrice)) {
      skipped += 1;
      continue;
    }

    transactions.push({
      symbol,
      kind: inferKind(sideRaw, symbol, note),
      side,
      quantity: finalQty,
      price: Math.max(0, finalPrice),
      fee: Number.isFinite(fee) ? Math.max(0, fee) : 0,
      date,
      note: note || "Imported transaction",
    });
  }
  return { transactions, skipped };
}
