const MAX_SYMBOLS = 220;
const MAX_PARALLEL = 10;

function pickFirst(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeInputSymbol(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

function toStooqSymbol(symbol) {
  // Stooq uses dash for class shares (e.g., BRK-B.US).
  return `${symbol.replace(/\./g, "-").toLowerCase()}.us`;
}

function parseStooqCsv(text) {
  const lines = String(text ?? "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  if (cols.length < 8) return null;

  const date = cols[1];
  const open = asNumber(cols[3]);
  const high = asNumber(cols[4]);
  const low = asNumber(cols[5]);
  const close = asNumber(cols[6]);
  const volume = asNumber(cols[7]);
  if (!date || date === "N/D" || !Number.isFinite(close)) return null;

  return {
    open: Number.isFinite(open) ? open : undefined,
    high: Number.isFinite(high) ? high : undefined,
    low: Number.isFinite(low) ? low : undefined,
    close,
    volume: Number.isFinite(volume) ? volume : undefined,
    date,
  };
}

async function fetchOne(symbol) {
  const stooqSymbol = toStooqSymbol(symbol);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const parsed = parseStooqCsv(await res.text());
  if (!parsed) return null;

  const previousClose = parsed.open;
  const changePct =
    Number.isFinite(previousClose) && previousClose > 0
      ? ((parsed.close - previousClose) / previousClose) * 100
      : 0;

  return {
    symbol,
    name: symbol,
    price: parsed.close,
    previousClose,
    changePct,
    marketCap: 0,
    volume: parsed.volume ?? 0,
    averageVolume: undefined,
    high24h: parsed.high,
    low24h: parsed.low,
    currency: "USD",
    exchange: "US",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const rawSymbols = pickFirst(req.query.symbols);
  const symbols = Array.from(
    new Set(
      String(rawSymbols ?? "")
        .split(",")
        .map(normalizeInputSymbol)
        .filter(Boolean)
    )
  ).slice(0, MAX_SYMBOLS);

  if (!symbols.length) {
    res.status(400).json({ error: "missing_symbols" });
    return;
  }

  try {
    const out = [];
    for (let i = 0; i < symbols.length; i += MAX_PARALLEL) {
      const wave = symbols.slice(i, i + MAX_PARALLEL);
      const settled = await Promise.allSettled(wave.map((symbol) => fetchOne(symbol)));
      for (const result of settled) {
        if (result.status !== "fulfilled" || !result.value) continue;
        out.push(result.value);
      }
    }

    res.setHeader("Cache-Control", "s-maxage=12, stale-while-revalidate=45");
    res.status(200).json(out);
  } catch {
    res.status(502).json({ error: "upstream_fetch_failed" });
  }
};
