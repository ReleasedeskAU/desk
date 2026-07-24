/**
 * RiskFactor cleanup: Phase A/B/C then verify sum.
 * Preflight: refuse deactivate if releaseInputCount > 0.
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
const { RISK_FACTOR_WEIGHT_SUM } = await import("../lib/risk-scoring/factors.ts");
const p = new PrismaClient();

const DEACTIVATE = [
  // Phase A
  { category: "Data Migration", factorName: "Backup Restore Tested", phase: "A" },
  { category: "Data Migration", factorName: "Migration Required", phase: "A" },
  { category: "Env & Dependencies", factorName: "Dependency Count", phase: "A" },
  { category: "Env & Dependencies", factorName: "Dependency Health", phase: "A" },
  { category: "Env & Dependencies", factorName: "Feature Flag Cleanup", phase: "A" },
  { category: "Data Migration", factorName: "Migration Script Tested", phase: "A" },
  { category: "Env & Dependencies", factorName: "Drift Issues", phase: "A" },
  { category: "Business Criticality", factorName: "User Blast Radius", phase: "A" },
  // Phase C
  { category: "Release History", factorName: "Previous Failures", phase: "C" },
  { category: "Release History", factorName: "Release Cadence Dev", phase: "C" },
  { category: "Release History", factorName: "Recent Incidents", phase: "C" },
  { category: "Operational Readiness", factorName: "Vendor Coordination", phase: "C" },
];

const WEIGHT_FIXES = [
  // Phase B
  { category: "Business Criticality", factorName: "Revenue Impact", weight: 0.01, phase: "B" },
  { category: "Business Criticality", factorName: "Blast Radius", weight: 0.01, phase: "B" },
  // Phase C
  { category: "Release History", factorName: "MTBF Days", weight: 0.008, phase: "C" },
  { category: "Security & Compliance", factorName: "Compliance Gate", weight: 0.02, phase: "C" },
  { category: "Testing Quality", factorName: "UAT Defects", weight: 0.02, phase: "C" },
  { category: "Testing Quality", factorName: "UAT Sign-off", weight: 0.03, phase: "C" },
  { category: "Release History", factorName: "BC Tested", weight: 0.008, phase: "C" },
];

async function findOne(category, factorName) {
  return p.riskFactor.findFirst({
    where: { category, factorName },
    include: { _count: { select: { releaseInputs: true } } },
  });
}

try {
  console.log("=== PREFLIGHT: release inputs on deactivate targets ===");
  const preflight = [];
  let blocked = false;
  for (const t of DEACTIVATE) {
    const row = await findOne(t.category, t.factorName);
    if (!row) {
      preflight.push({ ...t, status: "NOT_FOUND" });
      continue;
    }
    const inputs = row._count.releaseInputs;
    const item = {
      ...t,
      id: row.id,
      weight: row.weight,
      active: row.active,
      releaseInputCount: inputs,
      status: inputs > 0 ? "BLOCKED_HAS_INPUTS" : row.active ? "OK_TO_DEACTIVATE" : "ALREADY_INACTIVE",
    };
    if (inputs > 0) blocked = true;
    preflight.push(item);
  }
  console.log(JSON.stringify(preflight, null, 2));

  if (blocked) {
    console.error("ABORT: one or more deactivate targets have release inputs.");
    process.exitCode = 2;
  } else {
  console.log("\n=== PREFLIGHT: weight-fix targets exist ===");
  const fixPre = [];
  for (const t of WEIGHT_FIXES) {
    const row = await findOne(t.category, t.factorName);
    if (!row) {
      fixPre.push({ ...t, status: "NOT_FOUND" });
      blocked = true;
      continue;
    }
    fixPre.push({
      ...t,
      id: row.id,
      currentWeight: row.weight,
      active: row.active,
      releaseInputCount: row._count.releaseInputs,
      status: "OK",
    });
  }
  console.log(JSON.stringify(fixPre, null, 2));
  if (blocked) {
    console.error("ABORT: missing weight-fix target.");
    process.exitCode = 2;
  } else {

  console.log("\n=== APPLYING DEACTIVATIONS ===");
  const deactivated = [];
  for (const t of DEACTIVATE) {
    const row = await findOne(t.category, t.factorName);
    if (!row || !row.active) {
      deactivated.push({ ...t, id: row?.id, result: row ? "skipped_already_inactive" : "skipped_missing" });
      continue;
    }
    await p.riskFactor.update({
      where: { id: row.id },
      data: { active: false },
    });
    deactivated.push({ phase: t.phase, id: row.id, factorName: t.factorName, result: "deactivated" });
  }
  console.log(JSON.stringify(deactivated, null, 2));

  console.log("\n=== APPLYING WEIGHT FIXES ===");
  const fixed = [];
  for (const t of WEIGHT_FIXES) {
    const row = await findOne(t.category, t.factorName);
    const before = row.weight;
    await p.riskFactor.update({
      where: { id: row.id },
      data: { weight: t.weight },
    });
    fixed.push({
      phase: t.phase,
      id: row.id,
      factorName: t.factorName,
      before,
      after: t.weight,
      result: "updated",
    });
  }
  console.log(JSON.stringify(fixed, null, 2));

  console.log("\n=== PHASE D: POST-CLEANUP SUM ===");
  const active = await p.riskFactor.findMany({
    where: { active: true },
    select: { category: true, factorName: true, weight: true },
    orderBy: [{ category: "asc" }, { factorName: "asc" }],
  });
  const sum = active.reduce((s, r) => s + r.weight, 0);
  const byCat = {};
  for (const r of active) byCat[r.category] = (byCat[r.category] || 0) + r.weight;
  const report = {
    activeCount: active.length,
    sumActiveWeights: Number(sum.toFixed(6)),
    specTarget: RISK_FACTOR_WEIGHT_SUM,
    deltaVsSpec: Number((sum - RISK_FACTOR_WEIGHT_SUM).toFixed(6)),
    byCategory: Object.fromEntries(
      Object.entries(byCat).map(([k, v]) => [k, Number(v.toFixed(6))])
    ),
    activeFactors: active,
  };
  writeFileSync(new URL("./cleanup-risk-factors-report.json", import.meta.url), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        activeCount: report.activeCount,
        sumActiveWeights: report.sumActiveWeights,
        specTarget: report.specTarget,
        deltaVsSpec: report.deltaVsSpec,
        byCategory: report.byCategory,
      },
      null,
      2
    )
  );
  } // end weight-fix ok
  } // end deactivate ok
} catch (e) {
  console.error("ERR", e?.message || e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
