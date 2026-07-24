/**
 * Read-only RiskFactor duplicate audit. Does not modify data.
 * Run: npx tsx scripts/audit-risk-factor-dupes.mjs
 */
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

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
const p = new PrismaClient();

const SPEC = {
  "Data Migration": [
    { factorName: "Migration Req", weight: 0.015 },
    { factorName: "Backup Tested", weight: 0.01 },
    { factorName: "Migration Script", weight: 0.015 },
  ],
  "Env & Dependencies": [
    { factorName: "Dep Count", weight: 0.03 },
    { factorName: "Dep Health", weight: 0.02 },
    { factorName: "Vendor Involvement", weight: 0.02 },
    { factorName: "Feature Flags", weight: 0.02 },
  ],
};

const PAIRS = [
  ["Data Migration", ["Backup Restore Tested", "Backup Tested"]],
  ["Data Migration", ["Migration Req", "Migration Required"]],
  ["Env & Dependencies", ["Dep Count", "Dependency Count"]],
  ["Env & Dependencies", ["Dep Health", "Dependency Health"]],
  ["Env & Dependencies", ["Feature Flag Cleanup", "Feature Flags"]],
];

function rowOut(r) {
  return {
    id: r.id,
    category: r.category,
    factorName: r.factorName,
    weight: r.weight,
    active: r.active,
    order: r.order,
    description: r.description,
    createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
    releaseInputCount: r._count?.releaseInputs ?? 0,
  };
}

try {
  console.log("=== SUSPECTED PAIRS ===");
  for (const [cat, names] of PAIRS) {
    console.log(`\n-- ${cat} :: ${names.join(" vs ")}`);
    for (const name of names) {
      const inCat = await p.riskFactor.findMany({
        where: { category: cat, factorName: name },
        include: { _count: { select: { releaseInputs: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (inCat.length) {
        console.log(JSON.stringify({ name, match: "exact_in_category", rows: inCat.map(rowOut) }, null, 2));
        continue;
      }
      const elsewhere = await p.riskFactor.findMany({
        where: { factorName: { equals: name, mode: "insensitive" } },
        include: { _count: { select: { releaseInputs: true } } },
      });
      console.log(
        JSON.stringify(
          {
            name,
            match: elsewhere.length ? "found_elsewhere_or_case" : "NOT_FOUND",
            rows: elsewhere.map(rowOut),
          },
          null,
          2
        )
      );
    }
  }

  console.log("\n=== CATEGORY COUNTS + FULL ROWS ===");
  for (const cat of ["Data Migration", "Env & Dependencies"]) {
    const all = await p.riskFactor.findMany({
      where: { category: cat },
      include: { _count: { select: { releaseInputs: true } } },
      orderBy: [{ order: "asc" }, { factorName: "asc" }],
    });
    const specNames = new Set(SPEC[cat].map((s) => s.factorName));
    console.log(
      JSON.stringify(
        {
          category: cat,
          specCount: SPEC[cat].length,
          dbTotal: all.length,
          dbActive: all.filter((r) => r.active).length,
          rows: all.map((r) => ({
            ...rowOut(r),
            inSpec: specNames.has(r.factorName),
            verdict: specNames.has(r.factorName) ? "SPEC" : "EXTRA/STRAY?",
          })),
        },
        null,
        2
      )
    );
  }

  console.log("\n=== ACTIVE WEIGHT SUM (all categories) ===");
  const active = await p.riskFactor.findMany({
    where: { active: true },
    select: { weight: true, category: true, factorName: true },
  });
  const sum = active.reduce((s, r) => s + r.weight, 0);
  const byCat = {};
  for (const r of active) byCat[r.category] = (byCat[r.category] || 0) + r.weight;
  const outliers = active.filter((r) => r.weight >= 0.5);
  const specSum = 0.992;
  console.log(
    JSON.stringify(
      {
        activeCount: active.length,
        sumActiveWeights: Number(sum.toFixed(6)),
        expectedTarget: specSum,
        deltaVsExpected: Number((sum - specSum).toFixed(6)),
        byCategory: byCat,
        weightOutliersGte0_5: outliers,
      },
      null,
      2
    )
  );

  // Estimate duplicate contribution: extras not in SPEC names for those two cats
  const dm = await p.riskFactor.findMany({ where: { category: "Data Migration", active: true } });
  const env = await p.riskFactor.findMany({
    where: { category: "Env & Dependencies", active: true },
  });
  const dmSpec = new Set(SPEC["Data Migration"].map((s) => s.factorName));
  const envSpec = new Set(SPEC["Env & Dependencies"].map((s) => s.factorName));
  const dmExtra = dm.filter((r) => !dmSpec.has(r.factorName));
  const envExtra = env.filter((r) => !envSpec.has(r.factorName));
  const extraWeight =
    dmExtra.reduce((s, r) => s + r.weight, 0) + envExtra.reduce((s, r) => s + r.weight, 0);
  console.log(
    "\n=== EXTRA (non-spec name) ACTIVE WEIGHT IN TWO CATS ===",
    JSON.stringify(
      {
        dataMigrationExtras: dmExtra.map((r) => ({ name: r.factorName, weight: r.weight })),
        envExtras: envExtra.map((r) => ({ name: r.factorName, weight: r.weight })),
        extraWeightSum: Number(extraWeight.toFixed(6)),
        ifRemovedSumWouldBe: Number((sum - extraWeight).toFixed(6)),
      },
      null,
      2
    )
  );
} catch (e) {
  console.error("AUDIT_ERROR", e?.code || "", e?.message || e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
