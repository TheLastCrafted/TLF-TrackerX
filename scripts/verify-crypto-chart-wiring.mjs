import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function extractQuotedStrings(block) {
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function extractSetStrings(src, constName) {
  const re = new RegExp(
    `const\\s+${constName}\\s*=\\s*new\\s+Set<[^>]+>\\(\\[([\\s\\S]*?)\\]\\);`,
    "m"
  );
  const m = src.match(re);
  if (!m?.[1]) return [];
  return extractQuotedStrings(m[1]);
}

function extractDirectMapKeys(src) {
  const m = src.match(
    /const\s+DIRECT_FILES_BY_CHART_ID\s*:\s*Record<string,\s*string\[]>\s*=\s*\{([\s\S]*?)\};/
  );
  if (!m?.[1]) return [];
  return [...m[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\[/gm)].map((x) => x[1]);
}

function extractCanonicalBranchIds(src) {
  return [...src.matchAll(/chartId\s*===\s*"([^"]+)"/g)].map((m) => m[1]);
}

function extractCryptoFormulaIds(src) {
  const formulaRe = /formula\(\{\s*([^}]+)\}\)/g;
  const rows = [];
  let m;
  while ((m = formulaRe.exec(src)) !== null) {
    const body = m[1] ?? "";
    const id = (body.match(/id:\s*"([^"]+)"/) ?? [])[1];
    const category = (body.match(/category:\s*"([^"]+)"/) ?? [])[1];
    if (!id || category !== "Crypto") continue;
    rows.push(id);
  }
  return rows;
}

const bgeometrics = read("src/data/bgeometrics.ts");
const chartDetail = read("app/chart/[id].tsx");
const charts = read("src/catalog/charts.ts");

const canonicalIds = new Set([
  ...extractDirectMapKeys(bgeometrics),
  ...extractCanonicalBranchIds(bgeometrics),
]);

const specialIds = new Set([
  ...extractSetStrings(chartDetail, "ROI_SPECIAL_CHART_IDS"),
  ...extractSetStrings(chartDetail, "INDICATOR_SPECIAL_CHART_IDS"),
  ...extractSetStrings(chartDetail, "CANONICAL_ONLY_CHART_IDS"),
]);

const cryptoFormulaIds = extractCryptoFormulaIds(charts);
const uncovered = cryptoFormulaIds.filter(
  (id) => !canonicalIds.has(id) && !specialIds.has(id)
);

if (uncovered.length) {
  console.error("Unwired crypto charts found (not canonical/special):");
  for (const id of uncovered) console.error(`- ${id}`);
  process.exit(1);
}

console.log(
  `Crypto chart wiring OK: ${cryptoFormulaIds.length} formula charts are canonical/special wired.`
);
