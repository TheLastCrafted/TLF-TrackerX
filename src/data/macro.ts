export type XYPoint = { x: number; y: number };

type FREDSeriesOptions = {
  seriesId: string;
  days?: number;
};

const FRED_GRAPH_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";

function parseFredCsv(csv: string): XYPoint[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const points: XYPoint[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const commaIndex = line.indexOf(",");
    if (commaIndex < 0) continue;

    const dateStr = line.slice(0, commaIndex).trim();
    const valueStr = line.slice(commaIndex + 1).trim();

    if (!dateStr || !valueStr || valueStr === ".") continue;

    const x = new Date(dateStr).getTime();
    const y = Number(valueStr);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  points.sort((a, b) => a.x - b.x);
  return points;
}

export async function fetchFredSeries(opts: FREDSeriesOptions): Promise<XYPoint[]> {
  const url = `${FRED_GRAPH_CSV}?id=${encodeURIComponent(opts.seriesId)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv",
      "Cache-Control": "no-cache",
    },
  });

  if (!res.ok) throw new Error(`FRED error: ${res.status}`);
  const csv = await res.text();
  const all = parseFredCsv(csv);

  if (!opts.days || opts.days <= 0) return all;

  const since = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  const filtered = all.filter((p) => p.x >= since);
  return filtered.length >= 2 ? filtered : all;
}
