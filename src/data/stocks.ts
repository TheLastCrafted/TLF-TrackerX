import { fetchTopStocks } from "./stocks-live";

export type StockBreadthSnapshot = {
  total: number;
  up: number;
  down: number;
  unchanged: number;
};

const breadthCache = new Map<number, { expiresAt: number; staleUntil: number; data: StockBreadthSnapshot }>();

export async function fetchTopStockBreadth(limit = 200): Promise<StockBreadthSnapshot> {
  const count = Math.max(20, Math.min(250, Math.floor(limit)));
  const cached = breadthCache.get(count);
  const now = Date.now();
  if (cached && now <= cached.expiresAt) return cached.data;

  try {
    const quotes = await fetchTopStocks({ count, useCache: true, cacheTtlMs: 45_000 });
    let up = 0;
    let down = 0;
    let unchanged = 0;

    for (const quote of quotes) {
      const delta = quote.changePct;
      if (!Number.isFinite(delta)) continue;
      if (delta > 0) up += 1;
      else if (delta < 0) down += 1;
      else unchanged += 1;
    }

    const total = up + down + unchanged;
    const data = { total, up, down, unchanged };
    breadthCache.set(count, {
      expiresAt: Date.now() + 45_000,
      staleUntil: Date.now() + 10 * 60_000,
      data,
    });
    return data;
  } catch {
    if (cached && now <= cached.staleUntil) return cached.data;
    return { total: 0, up: 0, down: 0, unchanged: 0 };
  }
}
