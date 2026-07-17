/**
 * One-off, idempotent seed script for IntegrationFlow.
 * Run manually: npx tsx prisma/seed-integration-flows.ts
 *
 * Source of truth: prisma/seed-data/integration-flows.json (15 records).
 * sourceSystem/targetSystem are stored as plain text — no Application FK matching.
 *
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

type RawFlow = {
  "Flow ID": string;
  "Source System": string;
  "Target System": string;
  "Integration Type": string;
  Frequency: string;
  "Data Elements": string;
  "Business Purpose": string;
};

async function main() {
  const rawPath = path.join(__dirname, "seed-data", "integration-flows.json");
  const rows = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawFlow[];
  console.log(`Read ${rows.length} rows from integration-flows.json`);

  let seeded = 0;
  for (const row of rows) {
    await prisma.integrationFlow.upsert({
      where: { flowCode: row["Flow ID"] },
      update: {
        sourceSystem: row["Source System"],
        targetSystem: row["Target System"],
        integrationType: row["Integration Type"],
        frequency: row.Frequency,
        dataElements: row["Data Elements"],
        businessPurpose: row["Business Purpose"],
      },
      create: {
        flowCode: row["Flow ID"],
        sourceSystem: row["Source System"],
        targetSystem: row["Target System"],
        integrationType: row["Integration Type"],
        frequency: row.Frequency,
        dataElements: row["Data Elements"],
        businessPurpose: row["Business Purpose"],
      },
    });
    seeded++;
  }

  const count = await prisma.integrationFlow.count();
  console.log(`Upserted ${seeded} integration flows. Table count: ${count}`);
  if (count !== 15) {
    console.warn(`Expected exactly 15 rows, found ${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
