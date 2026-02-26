import { fetchWithWebProxy } from "./web-proxy";

export type StockBreadthSnapshot = {
  total: number;
  up: number;
  down: number;
  unchanged: number;
};

type YahooScreenerResponse = {
  finance?: {
    result?: {
      quotes?: {
        symbol?: string;
        regularMarketChangePercent?: number | { raw?: number };
      }[];
    }[];
  };
};

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    const raw = (v as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return NaN;
}

export async function fetchTopStockBreadth(limit = 200): Promise<StockBreadthSnapshot> {
  const count = Math.max(20, Math.min(250, Math.floor(limit)));
  const url =
    `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved` +
    `?formatted=false&scrIds=most_actives&count=${count}&start=0`;

  const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Yahoo screener error: ${res.status}`);

  const json = (await res.json()) as YahooScreenerResponse;
  const quotes = json.finance?.result?.[0]?.quotes ?? [];
  let up = 0;
  let down = 0;
  let unchanged = 0;

  for (const quote of quotes) {
    const delta = asNumber(quote.regularMarketChangePercent);
    if (!Number.isFinite(delta)) continue;
    if (delta > 0) up += 1;
    else if (delta < 0) down += 1;
    else unchanged += 1;
  }

  const total = up + down + unchanged;
  return { total, up, down, unchanged };
}
