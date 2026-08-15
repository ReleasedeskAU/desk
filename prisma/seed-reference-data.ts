/**
 * One-off, idempotent seed script for ReferenceData — Drift Type lookup values.
 * Run manually: npx tsx prisma/seed-reference-data.ts
 *
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts — this is a
 * standalone additive script, safe to re-run (upserts by category+value).
 *
 * Seeds category="drift_type": Infrastructure, Configuration, Data,
 * Integration, Security, Code — the sheet’s 6-value Drift Type set.
 */
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

const DRIFT_TYPES = [
  "Infrastructure",
  "Configuration",
  "Data",
  "Integration",
  "Security",
  "Code",
];

async function main() {
  console.log("Seeding ReferenceData rows for category=drift_type...");

  for (let i = 0; i < DRIFT_TYPES.length; i++) {
    const value = DRIFT_TYPES[i];
    await prisma.referenceData.upsert({
      where: { category_value: { category: "drift_type", value } },
      update: { sortOrder: i + 1, active: true },
      create: { category: "drift_type", value, sortOrder: i + 1, active: true },
    });
    console.log(`  drift_type: ${value} (sortOrder ${i + 1})`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
