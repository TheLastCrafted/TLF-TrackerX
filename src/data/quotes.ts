export type QuoteRow = {
  symbol: string;
  price: number;
  previousClose?: number;
  changePct?: number;
  currency?: string;
  exchange?: string;
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: {
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      regularMarketChangePercent?: number;
      currency?: string;
      fullExchangeName?: string;
      exchange?: string;
    }[];
  };
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toYahooSymbol(symbol: string): string {
  const up = symbol.trim().toUpperCase();
  if (!up) return up;
  // Class-share symbols like BRK.B and BF.B are dash-separated on Yahoo.
  if (/^[A-Z]+\.[A-Z]$/.test(up)) return up.replace(".", "-");
  return up;
}

async function fetchYahooChunk(mappedSymbols: string[]): Promise<QuoteRow[]> {
  if (!mappedSymbols.length) return [];
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(mappedSymbols.join(","))}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as YahooQuoteResponse;
  const rows = json.quoteResponse?.result ?? [];
  return rows
    .map((row) => ({
      symbol: String(row.symbol ?? "").toUpperCase(),
      price: Number(row.regularMarketPrice),
      previousClose: Number(row.regularMarketPreviousClose),
      changePct: Number(row.regularMarketChangePercent),
      currency: row.currency,
      exchange: row.fullExchangeName ?? row.exchange,
    }))
    .filter((row) => row.symbol && Number.isFinite(row.price));
}

export async function fetchYahooQuotes(symbols: string[]): Promise<QuoteRow[]> {
  const originals = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (!originals.length) return [];

  const normalizedToOriginal = new Map<string, string>();
  const requestSymbols = Array.from(
    new Set(
      originals.map((s) => {
        const n = toYahooSymbol(s);
        if (!normalizedToOriginal.has(n)) normalizedToOriginal.set(n, s);
        return n;
      })
    )
  );

  const batches = chunk(requestSymbols, 40);
  const results = await Promise.allSettled(batches.map((batch) => fetchYahooChunk(batch)));
  const merged = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Map response symbols back to the originally requested symbols when possible.
  return merged.map((row) => {
    const maybeNormalized = toYahooSymbol(row.symbol);
    const original = normalizedToOriginal.get(maybeNormalized) ?? normalizedToOriginal.get(row.symbol) ?? row.symbol;
    return { ...row, symbol: original };
  });
}
