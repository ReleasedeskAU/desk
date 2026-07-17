/**
 * One-off, idempotent seed script for Risk Scoring Part 2 (System 2).
 * Run manually: npx tsx prisma/seed-risk-factors.ts
 *
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts — this is a
 * standalone additive script, safe to re-run (skips rows that already exist).
 *
 * Seeds:
 *  1. The 44 RiskFactor rows (lib/risk-scoring/factors.ts)
 *  2. ReleaseRiskFactorInput raw values for REL-0001..REL-0012 (the only
 *     releases with raw factor data in prisma/seed-data/risk_factors_NO_SCHEMA_TARGET.json)
 *  3. Runs computeWeightedRiskScore() for those 12 releases
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";
import { RISK_FACTOR_DEFS } from "../lib/risk-scoring/factors";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding RiskFactor rows...");
  const factorIdByName = new Map<string, string>();

  for (const def of RISK_FACTOR_DEFS) {
    const existing = await prisma.riskFactor.findFirst({ where: { factorName: def.factorName } });
    if (existing) {
      factorIdByName.set(def.factorName, existing.id);
      continue;
    }
    const row = await prisma.riskFactor.create({
      data: {
        category: def.category,
        factorName: def.factorName,
        weight: def.weight,
        description: def.description,
        active: true,
        order: def.order,
      },
    });
    factorIdByName.set(def.factorName, row.id);
  }
  console.log(`RiskFactor rows ready: ${factorIdByName.size}`);

  const rawPath = path.join(__dirname, "seed-data", "risk_factors_NO_SCHEMA_TARGET.json");
  const data = JSON.parse(fs.readFileSync(rawPath, "utf8")) as Record<string, unknown>[];

  const header = data[62];
  const keyToConcept: Record<string, string> = {};
  for (const [k, v] of Object.entries(header)) keyToConcept[k] = String(v);

  const factorByConcept = new Map(RISK_FACTOR_DEFS.map((f) => [f.factorName, f]));

  let releasesSeeded = 0;
  for (let i = 63; i <= 74; i++) {
    const row = data[i];
    const concept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) concept[keyToConcept[k]] = v;

    const releaseCode = String(concept["Release ID"]);
    const release = await prisma.release.findUnique({ where: { releaseCode } });
    if (!release) {
      console.warn(`Skipping ${releaseCode} — not found in Release table`);
      continue;
    }

    for (const def of RISK_FACTOR_DEFS) {
      const rawValue = Number(concept[def.factorName]);
      if (Number.isNaN(rawValue)) continue;
      const factorId = factorIdByName.get(def.factorName)!;
      const bandScore = def.bandRule(rawValue);

      await prisma.releaseRiskFactorInput.upsert({
        where: { releaseId_riskFactorId: { releaseId: release.id, riskFactorId: factorId } },
        update: { rawValue, bandScore },
        create: { releaseId: release.id, riskFactorId: factorId, rawValue, bandScore },
      });
    }
    releasesSeeded++;
    console.log(`Seeded raw inputs for ${releaseCode} (${concept["Release Name"]})`);
  }
  console.log(`Releases with raw factor inputs seeded: ${releasesSeeded}`);

  console.log("\nRunning computeWeightedRiskScore for REL-0001..REL-0012...");
  const { computeWeightedRiskScore } = await import("../lib/risk-scoring/calc");
  for (let n = 1; n <= 12; n++) {
    const releaseCode = `REL-${String(n).padStart(4, "0")}`;
    const release = await prisma.release.findUnique({ where: { releaseCode } });
    if (!release) continue;
    const result = await computeWeightedRiskScore(release.id);
    console.log(`${releaseCode}: weightedRiskScore=${result.weightedRiskScore} weightedRiskLevel=${result.weightedRiskLevel}`);
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
