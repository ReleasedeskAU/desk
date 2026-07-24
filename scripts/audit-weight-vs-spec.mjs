/**
 * Read-only: compare all RiskFactor rows to RISK_FACTOR_DEFS weights.
 * Run: npx tsx scripts/audit-weight-vs-spec.mjs
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

const ALIASES = {
  "Data Migration|Migration Required": "Data Migration|Migration Req",
  "Data Migration|Backup Restore Tested": "Data Migration|Backup Tested",
  "Data Migration|Migration Script Tested": "Data Migration|Migration Script",
  "Env & Dependencies|Dependency Count": "Env & Dependencies|Dep Count",
  "Env & Dependencies|Dependency Health": "Env & Dependencies|Dep Health",
  "Env & Dependencies|Feature Flag Cleanup": "Env & Dependencies|Feature Flags",
  "Business Criticality|User Blast Radius": "Business Criticality|Blast Radius",
};

try {
  const rows = await p.riskFactor.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }, { factorName: "asc" }],
  });
  const byKey = new Map(RISK_FACTOR_DEFS.map((d) => [`${d.category}|${d.factorName}`, d]));

  const weightMismatches = [];
  const unmatched = [];
  let exactOk = 0;

  for (const r of rows) {
    const key = `${r.category}|${r.factorName}`;
    let def = byKey.get(key);
    let via = "exact";
    if (!def && ALIASES[key]) {
      def = byKey.get(ALIASES[key]);
      via = `alias->${ALIASES[key]}`;
    }
    if (!def) {
      unmatched.push({
        id: r.id,
        category: r.category,
        factorName: r.factorName,
        weight: r.weight,
        active: r.active,
      });
      continue;
    }
    const ok = Math.abs(r.weight - def.weight) < 1e-9;
    if (ok) {
      exactOk += 1;
      continue;
    }
    weightMismatches.push({
      id: r.id,
      category: r.category,
      factorName: r.factorName,
      dbWeight: r.weight,
      specWeight: def.weight,
      via,
      active: r.active,
      div100: Number((r.weight / 100).toFixed(6)),
      div100EqualsSpec: Math.abs(r.weight / 100 - def.weight) < 1e-9,
    });
  }

  const activeSum = rows.filter((r) => r.active).reduce((s, r) => s + r.weight, 0);
  const cats = [...new Set([...RISK_FACTOR_DEFS.map((d) => d.category), ...rows.map((r) => r.category)])];
  const byCat = {};
  for (const c of cats) {
    const catRows = rows.filter((r) => r.category === c && r.active);
    const mism = weightMismatches.filter((m) => m.category === c);
    const unm = unmatched.filter((u) => u.category === c && u.active);
    byCat[c] = {
      activeCount: catRows.length,
      activeSum: Number(catRows.reduce((s, r) => s + r.weight, 0).toFixed(6)),
      mismatchCount: mism.length,
      unmatchedActiveCount: unm.length,
      hasPctOrWeightIssue: mism.some((m) => m.div100EqualsSpec || m.dbWeight >= 0.5) || unm.some((u) => u.weight >= 0.5),
    };
  }

  const report = {
    specFactorCount: RISK_FACTOR_DEFS.length,
    specWeightSum: RISK_FACTOR_WEIGHT_SUM,
    dbTotal: rows.length,
    dbActive: rows.filter((r) => r.active).length,
    activeWeightSum: Number(activeSum.toFixed(6)),
    exactWeightMatches: exactOk,
    weightMismatches,
    unmatched,
    byCategory: byCat,
    categoriesWithAnyIssue: cats.filter(
      (c) => byCat[c].mismatchCount > 0 || byCat[c].unmatchedActiveCount > 0
    ),
    categoriesClean: cats.filter(
      (c) => byCat[c].mismatchCount === 0 && byCat[c].unmatchedActiveCount === 0
    ),
  };

  writeFileSync(new URL("./audit-weight-vs-spec.json", import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error("ERR", e?.message || e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
