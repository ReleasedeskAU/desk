import fs from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

const PRIMARY = "\u25cf"; // ●
const SECONDARY = "\u25cb"; // ○

function pickIntegrationEnv(envs: { id: string; name: string }[]) {
  for (const name of ["Test", "UAT", "Pre-prod", "Prod", "Dev"]) {
    const env = envs.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (env) return env;
  }
  return envs[0];
}

/** Primary app per department — first seeded row (createdAt asc) matches workbook order. */
function primaryAppByDepartment(
  apps: {
    id: string;
    name: string;
    department: { name: string };
    environments: { id: string; name: string }[];
  }[]
) {
  const map = new Map<string, (typeof apps)[0]>();
  for (const app of apps) {
    if (!map.has(app.department.name)) map.set(app.department.name, app);
  }
  return map;
}

/**
 * Builds SystemMappingEdge rows from the workbook's Department Integration Matrix
 * (system-matrix.json). Uses the first application per
 * department on Test env — documented in SEED_NOTES as the closest match to the
 * narrative integration map without inventing app-pair relationships.
 */
export async function seedSystemMapping(prisma: PrismaClient) {
  await prisma.systemMappingEdge.deleteMany();
  await prisma.systemMappingGroup.deleteMany();
  const organizationRows = await prisma.$queryRawUnsafe<{ organizationId: string }[]>(
    `SELECT "organizationId" FROM "User" WHERE "organizationId" IS NOT NULL LIMIT 1`
  );
  const organizationId = organizationRows[0]?.organizationId;
  if (!organizationId) throw new Error("System Mapping: no organizationId found");

  const apps = await prisma.application.findMany({
    include: { department: true, environments: true },
    orderBy: [{ department: { name: "asc" } }, { createdAt: "asc" }],
  });

  if (!apps.length) {
    console.log("System Mapping: skipped (no applications)");
    return;
  }

  const byDept = primaryAppByDepartment(apps);
  const rawPath = path.join(process.cwd(), "prisma", "seed-data", "system-matrix.json");

  if (!fs.existsSync(rawPath)) {
    console.log("System Mapping: skipped (matrix JSON not found)");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8")) as Record<string, string>[];
  const departments = ["Finance", "HR", "IT", "CRM", "Manufacturing", "Logistics", "Legal", "Security"];
  const edgeData: {
    organizationId: string;
    sourceAppId: string;
    sourceEnvId: string;
    targetAppId: string;
    targetEnvId: string;
    direction: string;
    notes: string;
    sourceOrder: number;
  }[] = [];

  const seen = new Set<string>();

  let sourceOrder = 0;
  for (const row of raw) {
    const fromDept = row["From \\ To"];
    const sourceApp = byDept.get(fromDept);
    if (!sourceApp) continue;
    const sourceEnv = pickIntegrationEnv(sourceApp.environments);
    if (!sourceEnv) continue;

    for (const toDept of departments) {
      const cell = row[toDept];
      if (fromDept === toDept) continue;
      if (cell !== PRIMARY && cell !== SECONDARY) continue;

      const targetApp = byDept.get(toDept);
      if (!targetApp) continue;
      const targetEnv = pickIntegrationEnv(targetApp.environments);
      if (!targetEnv) continue;

      const key = `${sourceApp.id}:${sourceEnv.id}->${targetApp.id}:${targetEnv.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      edgeData.push({
        sourceAppId: sourceApp.id,
        organizationId,
        sourceEnvId: sourceEnv.id,
        targetAppId: targetApp.id,
        targetEnvId: targetEnv.id,
        direction: "downstream",
        notes: `${fromDept} → ${toDept} (${cell === PRIMARY ? "Primary" : "Secondary"} · ${sourceEnv.name})`,
        sourceOrder: ++sourceOrder,
      });
    }
  }

  if (!edgeData.length) {
    console.log("System Mapping: no edges parsed from matrix");
    return;
  }

  await prisma.systemMappingGroup.create({
    data: {
      organizationId,
      name: "Enterprise Default Setup",
      status: "accepted",
      sourceNotes:
        "Department Integration Matrix from ReleaseDesk_SampleData.xlsx (● primary / ○ secondary). One representative application per department on Test environment.",
      edges: {
        create: edgeData.map((e) => ({ ...e, isDefault: true })),
      },
    },
  });

  console.log(`System Mapping: 1 group, ${edgeData.length} edges`);
}
