import fs from "node:fs";

import { CHARTS } from "../src/catalog/charts";

type SweepFailure = {
  id: string;
  tf: number;
  pass: number;
  reason: string;
};

type SweepReport = {
  at: string;
  totalCharts: number;
  totalChecks: number;
  failures: SweepFailure[];
};

function main() {
  const report = JSON.parse(
    fs.readFileSync("scripts/chart-sweep-report.json", "utf8")
  ) as SweepReport;

  const titleById = new Map<string, string>(CHARTS.map((c) => [c.id, c.title]));
  const failById = new Map<string, { count: number; reasons: Map<string, number> }>();

  for (const f of report.failures) {
    const row = failById.get(f.id) ?? { count: 0, reasons: new Map<string, number>() };
    row.count += 1;
    row.reasons.set(f.reason, (row.reasons.get(f.reason) ?? 0) + 1);
    failById.set(f.id, row);
  }

  const chartsSource = fs.readFileSync("src/catalog/charts.ts", "utf8");
  const coinsSource = fs.readFileSync("src/catalog/coins.ts", "utf8");
  const fredIds = Array.from(
    chartsSource.matchAll(
      /fred\(\{\s*id:\s*"([^"]+)"[\s\S]*?seriesId:\s*"([^"]+)"(?:[\s\S]*?days:\s*([^,\n}]+))?[\s\S]*?\}\)/g
    )
  ).map((m) => m[1]);
  const formulaIds = Array.from(
    chartsSource.matchAll(
      /formula\(\{\s*id:\s*"([^"]+)"[\s\S]*?leftId:\s*"([^"]+)"[\s\S]*?rightId:\s*"([^"]+)"[\s\S]*?operation:\s*"([^"]+)"[\s\S]*?\}\)/g
    )
  ).map((m) => m[1]);
  const trackedCoinSymbols = Array.from(
    coinsSource.matchAll(/\{\s*id:\s*"([^"]+)",\s*symbol:\s*"([^"]+)"/g)
  ).map((m) => m[2].toLowerCase());
  const coinIds = trackedCoinSymbols.flatMap((symbol) => [
    `${symbol}_price_usd`,
    `${symbol}_market_cap_usd`,
    `${symbol}_volume_usd`,
  ]);
  const testedIds = Array.from(new Set([...fredIds, ...formulaIds, ...coinIds])).sort();

  const allCatalogIds = Array.from(new Set(CHARTS.map((c) => c.id))).sort();
  const failingIds = Array.from(failById.keys()).sort();
  const failingSet = new Set(failingIds);
  const passingIds = testedIds.filter((id) => !failingSet.has(id));
  const notTestedIds = allCatalogIds.filter((id) => !testedIds.includes(id));

  const lines: string[] = [];
  lines.push("# Chart Sweep Audit (Latest)");
  lines.push("");
  lines.push(`Generated: ${report.at}`);
  lines.push(`Total chart IDs in catalog: ${allCatalogIds.length}`);
  lines.push(`Chart IDs tested by sweep script: ${testedIds.length}`);
  lines.push(`Total checks (id x timeframe x pass): ${report.totalChecks}`);
  lines.push(`Working IDs (no failures): ${passingIds.length}`);
  lines.push(`Failing IDs (>=1 failure): ${failingIds.length}`);
  lines.push(`Not tested by this sweep: ${notTestedIds.length}`);
  lines.push("");
  lines.push("## Failing");
  lines.push("");
  for (const id of failingIds) {
    const title = titleById.get(id) ?? id;
    const row = failById.get(id)!;
    const reasons = Array.from(row.reasons.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} x${count}`)
      .join(", ");
    lines.push(`- ${id} | ${title} | failures=${row.count} | ${reasons}`);
  }
  lines.push("");
  lines.push("## Working");
  lines.push("");
  for (const id of passingIds) {
    const title = titleById.get(id) ?? id;
    lines.push(`- ${id} | ${title}`);
  }

  lines.push("");
  lines.push("## Not Tested");
  lines.push("");
  for (const id of notTestedIds) {
    const title = titleById.get(id) ?? id;
    lines.push(`- ${id} | ${title}`);
  }

  fs.writeFileSync("docs/chart-sweep-audit-latest.md", `${lines.join("\n")}\n`);
  console.log("wrote docs/chart-sweep-audit-latest.md");
}

main();
