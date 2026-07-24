/**
 * Follow-up: deactivate remaining active RiskFactors not in RISK_FACTOR_DEFS
 * (workbook renames). Preflight requires releaseInputCount === 0 for all.
 */
import { readFileSync, writeFileSync } from "fs";

function parseEnv(t) {
  const o = {};
  for (const r of t.split(/\r?\n/)) {
    const l = r.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    let k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    o[k] = v;
  }
  return o;
}

const env = parseEnv(readFileSync(".env", "utf8"));
for (const k of ["DATABASE_URL", "DIRECT_URL"]) if (env[k]) process.env[k] = env[k];

const { PrismaClient } = await import("@releasedesk/database");
const { RISK_FACTOR_DEFS, RISK_FACTOR_WEIGHT_SUM } = await import("../lib/risk-scoring/factors.ts");
const p = new PrismaClient();

const SPEC_KEYS = new Set(RISK_FACTOR_DEFS.map((d) => `${d.category}|${d.factorName}`));

try {
  const active = await p.riskFactor.findMany({
    where: { active: true },
    include: { _count: { select: { releaseInputs: true } } },
    orderBy: [{ category: "asc" }, { factorName: "asc" }],
  });

  const unmatched = active.filter((r) => !SPEC_KEYS.has(`${r.category}|${r.factorName}`));

  console.log("=== PREFLIGHT: remaining unmatched active renames ===");
  const preflight = unmatched.map((r) => ({
    id: r.id,
    category: r.category,
    factorName: r.factorName,
    weight: r.weight,
    releaseInputCount: r._count.releaseInputs,
    status: r._count.releaseInputs > 0 ? "BLOCKED_HAS_INPUTS" : "OK_TO_DEACTIVATE",
  }));
  console.log(JSON.stringify({ count: preflight.length, rows: preflight }, null, 2));

  const blocked = preflight.filter((r) => r.releaseInputCount > 0);
  if (blocked.length) {
    console.error("ABORT: unmatched rows have release inputs — no deactivations applied.");
    console.error(JSON.stringify(blocked, null, 2));
    process.exitCode = 2;
  } else if (preflight.length === 0) {
    console.log("Nothing to deactivate — no unmatched active rows.");
  } else {
    console.log("\n=== DEACTIVATING ===");
    const results = [];
    for (const row of preflight) {
      await p.riskFactor.update({
        where: { id: row.id },
        data: { active: false },
      });
      results.push({ id: row.id, factorName: row.factorName, category: row.category, result: "deactivated" });
    }
    console.log(JSON.stringify(results, null, 2));
  }

  console.log("\n=== PHASE D: POST-CLEANUP SUM ===");
  const after = await p.riskFactor.findMany({
    where: { active: true },
    select: { category: true, factorName: true, weight: true },
    orderBy: [{ category: "asc" }, { factorName: "asc" }],
  });
  const sum = after.reduce((s, r) => s + r.weight, 0);
  const byCat = {};
  for (const r of after) byCat[r.category] = (byCat[r.category] || 0) + r.weight;

  const stillUnmatched = after.filter((r) => !SPEC_KEYS.has(`${r.category}|${r.factorName}`));
  const missingSpec = RISK_FACTOR_DEFS.filter(
    (d) => !after.some((r) => r.category === d.category && r.factorName === d.factorName)
  );

  const report = {
    activeCount: after.length,
    sumActiveWeights: Number(sum.toFixed(6)),
    specTarget: RISK_FACTOR_WEIGHT_SUM,
    deltaVsSpec: Number((sum - RISK_FACTOR_WEIGHT_SUM).toFixed(6)),
    byCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, Number(v.toFixed(6))])),
    stillUnmatchedActive: stillUnmatched,
    missingSpecFactors: missingSpec.map((d) => ({ category: d.category, factorName: d.factorName, weight: d.weight })),
    activeFactors: after,
  };
  writeFileSync(new URL("./cleanup-risk-factors-followup-report.json", import.meta.url), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        activeCount: report.activeCount,
        sumActiveWeights: report.sumActiveWeights,
        specTarget: report.specTarget,
        deltaVsSpec: report.deltaVsSpec,
        byCategory: report.byCategory,
        stillUnmatchedActiveCount: stillUnmatched.length,
        missingSpecCount: missingSpec.length,
        missingSpecFactors: report.missingSpecFactors,
      },
      null,
      2
    )
  );
} catch (e) {
  console.error("ERR", e?.message || e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
