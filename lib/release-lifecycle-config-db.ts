/**
 * Persistence for the Clerk-user-scoped Release lifecycle graph.
 *
 * Missing graphs are seeded transactionally on first access. organizationId
 * remains null until the future organization-scoped cutover.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@releasedesk/database";
import { prisma } from "@/lib/prisma";
import {
  createDefaultReleaseLifecycleConfig,
  normalizeReleaseLifecycleConfig,
  normalizeReleaseLifecycleConfigResult,
  releaseLifecycleTargetKey,
  validateReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";

/** Load result — includes a loud signal when stored config was substituted. */
export type LoadedReleaseLifecycleConfig = {
  config: ReleaseLifecycleConfig;
  /**
   * Present when persisted rows failed validation and the Enterprise Default
   * was returned instead. Clients must treat this as a data-integrity warning.
   */
  enterpriseDefaultFallback?: { reason: string };
};

type StatusRowInput = {
  id: string;
  clerkUserId: string;
  organizationId: null;
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  kind: string;
  isSystem: boolean;
  enabled: boolean;
};

/** Idempotent preview-database fallback matching the checked-in migration. */
async function ensureUserReleaseLifecycleTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleStatus" (
      "id" TEXT NOT NULL, "clerkUserId" TEXT NOT NULL, "organizationId" TEXT,
      "key" TEXT NOT NULL, "label" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "terminal" BOOLEAN NOT NULL DEFAULT false, "kind" TEXT NOT NULL DEFAULT 'mainline',
      "isSystem" BOOLEAN NOT NULL DEFAULT true, "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserReleaseLifecycleStatus_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleTransition" (
      "id" TEXT NOT NULL, "clerkUserId" TEXT NOT NULL, "organizationId" TEXT,
      "fromStatusId" TEXT NOT NULL, "toStatusId" TEXT, "targetKey" TEXT NOT NULL,
      "isPreviousStatus" BOOLEAN NOT NULL DEFAULT false,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "enforcement" TEXT NOT NULL DEFAULT 'flexible',
      "isSystem" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserReleaseLifecycleTransition_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserReleaseLifecycleTransition_fromStatusId_fkey"
        FOREIGN KEY ("fromStatusId") REFERENCES "UserReleaseLifecycleStatus"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "UserReleaseLifecycleTransition_toStatusId_fkey"
        FOREIGN KEY ("toStatusId") REFERENCES "UserReleaseLifecycleStatus"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleGate" (
      "id" TEXT NOT NULL, "clerkUserId" TEXT NOT NULL, "organizationId" TEXT,
      "transitionId" TEXT NOT NULL, "gateType" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "enforcement" TEXT NOT NULL DEFAULT 'inherit', "params" JSONB,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserReleaseLifecycleGate_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserReleaseLifecycleGate_transitionId_fkey"
        FOREIGN KEY ("transitionId") REFERENCES "UserReleaseLifecycleTransition"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_clerkUserId_key_key" ON "UserReleaseLifecycleStatus"("clerkUserId", "key")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_clerkUserId_label_key" ON "UserReleaseLifecycleStatus"("clerkUserId", "label")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_clerkUserId_enabled_sortOrder_idx" ON "UserReleaseLifecycleStatus"("clerkUserId", "enabled", "sortOrder")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_organizationId_idx" ON "UserReleaseLifecycleStatus"("organizationId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleTransition_clerkUserId_fromStatusId_targetKey_key" ON "UserReleaseLifecycleTransition"("clerkUserId", "fromStatusId", "targetKey")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleTransition_clerkUserId_fromStatusId_enabled_idx" ON "UserReleaseLifecycleTransition"("clerkUserId", "fromStatusId", "enabled")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleTransition_organizationId_idx" ON "UserReleaseLifecycleTransition"("organizationId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleGate_transitionId_gateType_key" ON "UserReleaseLifecycleGate"("transitionId", "gateType")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleGate_clerkUserId_idx" ON "UserReleaseLifecycleGate"("clerkUserId")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleGate_organizationId_idx" ON "UserReleaseLifecycleGate"("organizationId")`,
  ];
  for (const statement of indexes) await prisma.$executeRawUnsafe(statement);
}

function statusInputs(
  clerkUserId: string,
  config: ReleaseLifecycleConfig
): StatusRowInput[] {
  return config.statuses.map((status) => ({
    id: randomUUID(),
    clerkUserId,
    organizationId: null,
    ...status,
  }));
}

async function writeGraph(
  tx: Prisma.TransactionClient,
  clerkUserId: string,
  config: ReleaseLifecycleConfig
): Promise<void> {
  const statuses = statusInputs(clerkUserId, config);
  const statusIds = new Map(statuses.map((status) => [status.key, status.id]));
  await tx.userReleaseLifecycleStatus.createMany({ data: statuses });

  const transitions = config.transitions.map((item) => ({
    id: randomUUID(),
    clerkUserId,
    organizationId: null,
    fromStatusId: statusIds.get(item.fromKey)!,
    toStatusId: item.toKey ? statusIds.get(item.toKey)! : null,
    targetKey: releaseLifecycleTargetKey(item),
    isPreviousStatus: item.isPreviousStatus,
    enabled: item.enabled,
    enforcement: item.enforcement,
    isSystem: item.isSystem,
    sortOrder: item.sortOrder,
  }));
  await tx.userReleaseLifecycleTransition.createMany({ data: transitions });

  const transitionIds = new Map(
    config.transitions.map((item, index) => [
      `${item.fromKey}:${releaseLifecycleTargetKey(item)}`,
      transitions[index]!.id,
    ])
  );
  const gates = config.transitions.flatMap((item) =>
    item.gates.map((attachment) => ({
      id: randomUUID(),
      clerkUserId,
      organizationId: null,
      transitionId: transitionIds.get(
        `${item.fromKey}:${releaseLifecycleTargetKey(item)}`
      )!,
      gateType: attachment.gateType,
      enabled: attachment.enabled,
      enforcement: attachment.enforcement,
      params: attachment.params as Prisma.InputJsonValue | undefined,
      sortOrder: attachment.sortOrder,
    }))
  );
  if (gates.length) {
    await tx.userReleaseLifecycleGate.createMany({ data: gates });
  }
}

async function readGraph(
  clerkUserId: string
): Promise<LoadedReleaseLifecycleConfig | null> {
  const [statuses, transitions] = await Promise.all([
    prisma.userReleaseLifecycleStatus.findMany({
      where: { clerkUserId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.userReleaseLifecycleTransition.findMany({
      where: { clerkUserId },
      include: { fromStatus: true, toStatus: true, gates: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ sortOrder: "asc" }],
    }),
  ]);
  if (!statuses.length) return null;

  const normalized = normalizeReleaseLifecycleConfigResult(
    {
      statuses: statuses.map((status) => ({
        key: status.key,
        label: status.label,
        sortOrder: status.sortOrder,
        terminal: status.terminal,
        kind: status.kind as ReleaseLifecycleConfig["statuses"][number]["kind"],
        isSystem: status.isSystem,
        enabled: status.enabled,
      })),
      transitions: transitions.map((item) => ({
        fromKey: item.fromStatus.key,
        toKey: item.toStatus?.key ?? null,
        isPreviousStatus: item.isPreviousStatus,
        enabled: item.enabled,
        enforcement: item.enforcement as ReleaseLifecycleConfig["transitions"][number]["enforcement"],
        isSystem: item.isSystem,
        sortOrder: item.sortOrder,
        gates: item.gates.map((attachment) => ({
          gateType: attachment.gateType as ReleaseLifecycleConfig["transitions"][number]["gates"][number]["gateType"],
          enabled: attachment.enabled,
          enforcement: attachment.enforcement as ReleaseLifecycleConfig["transitions"][number]["gates"][number]["enforcement"],
          params:
            attachment.params &&
            typeof attachment.params === "object" &&
            !Array.isArray(attachment.params)
              ? (attachment.params as Record<string, unknown>)
              : undefined,
          sortOrder: attachment.sortOrder,
        })),
      })),
    },
    { clerkUserId }
  );

  return {
    config: normalized.config,
    ...(normalized.usedEnterpriseDefaultFallback && normalized.fallbackReason
      ? { enterpriseDefaultFallback: { reason: normalized.fallbackReason } }
      : {}),
  };
}

/**
 * Load and seed the caller's default lifecycle graph on first access.
 * @throws only when table setup/read/seed fails; callers decide read fallback.
 * @returns Config plus an optional Enterprise Default fallback warning.
 */
export async function loadReleaseLifecycleConfig(
  clerkUserId: string
): Promise<LoadedReleaseLifecycleConfig> {
  await ensureUserReleaseLifecycleTables();
  const existing = await readGraph(clerkUserId);
  if (existing) return existing;

  const defaults = createDefaultReleaseLifecycleConfig();
  try {
    await prisma.$transaction((tx) => writeGraph(tx, clerkUserId, defaults));
  } catch (error) {
    const concurrent = await readGraph(clerkUserId);
    if (concurrent) return concurrent;
    throw error;
  }
  const afterSeed = await readGraph(clerkUserId);
  return afterSeed ?? { config: defaults };
}

/**
 * Replace one user's lifecycle graph after complete validation.
 * @throws on invalid graphs or persistence errors.
 */
export async function saveReleaseLifecycleConfig(
  clerkUserId: string,
  config: ReleaseLifecycleConfig
): Promise<ReleaseLifecycleConfig> {
  const validationError = validateReleaseLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureUserReleaseLifecycleTables();

  await prisma.$transaction(async (tx) => {
    await tx.userReleaseLifecycleTransition.deleteMany({ where: { clerkUserId } });
    await tx.userReleaseLifecycleStatus.deleteMany({ where: { clerkUserId } });
    await writeGraph(tx, clerkUserId, config);
  });
  const loaded = await readGraph(clerkUserId);
  return loaded?.config ?? normalizeReleaseLifecycleConfig(config);
}
