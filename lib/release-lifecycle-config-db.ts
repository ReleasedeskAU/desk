/**
 * Persistence for the Clerk-user-scoped Release lifecycle graph.
 *
 * Missing graphs are seeded transactionally on first access. organizationId
 * remains null until the future organization-scoped cutover.
 *
 * Every seed/save appends an immutable UserReleaseLifecycleConfigVersion
 * snapshot. New releases pin to the latest version; unpinned legacy rows
 * resolve as configPin: latest-unpinned (see docs/lifecycle-backlog.md).
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
import {
  nextLifecycleConfigVersionNumber,
  parseLifecycleConfigSnapshot,
  resolveLifecycleConfigPin,
  type ResolvedReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config-version";

/**
 * Neon pooler + multi-round-trip graph rewrites (delete statuses/transitions,
 * createMany, version snapshot) regularly exceed Prisma's default 5s interactive
 * transaction timeout. Match system-mapping's more generous budget.
 */
const LIFECYCLE_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

/** Load result — includes a loud signal when stored config was substituted. */
export type LoadedReleaseLifecycleConfig = {
  config: ReleaseLifecycleConfig;
  /**
   * Present when persisted rows failed validation and the Enterprise Default
   * was returned instead. Clients must treat this as a data-integrity warning.
   */
  enterpriseDefaultFallback?: { reason: string };
  /** Latest immutable version id when history exists. */
  latestVersionId?: string | null;
  latestVersion?: number | null;
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

/** Idempotent preview-database fallback matching the checked-in migrations. */
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
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleConfigVersion" (
      "id" TEXT NOT NULL, "clerkUserId" TEXT NOT NULL, "version" INTEGER NOT NULL,
      "snapshot" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserReleaseLifecycleConfigVersion_pkey" PRIMARY KEY ("id")
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
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleConfigVersion_clerkUserId_version_key" ON "UserReleaseLifecycleConfigVersion"("clerkUserId", "version")`,
    `CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleConfigVersion_clerkUserId_createdAt_idx" ON "UserReleaseLifecycleConfigVersion"("clerkUserId", "createdAt")`,
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

/**
 * Append an immutable config snapshot for the user.
 * @returns Created version row id and version number.
 */
async function appendConfigVersion(
  tx: Prisma.TransactionClient,
  clerkUserId: string,
  config: ReleaseLifecycleConfig
): Promise<{ id: string; version: number }> {
  const agg = await tx.userReleaseLifecycleConfigVersion.aggregate({
    where: { clerkUserId },
    _max: { version: true },
  });
  const version = nextLifecycleConfigVersionNumber(agg._max.version);
  const id = randomUUID();
  await tx.userReleaseLifecycleConfigVersion.create({
    data: {
      id,
      clerkUserId,
      version,
      // Store the validated graph as JSON — enforcement reads this, not head tables.
      snapshot: config as unknown as Prisma.InputJsonValue,
    },
  });
  return { id, version };
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

async function readLatestVersionMeta(
  clerkUserId: string
): Promise<{ id: string; version: number } | null> {
  return prisma.userReleaseLifecycleConfigVersion.findFirst({
    where: { clerkUserId },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  });
}

/**
 * If head tables exist but version history was never written (pre-versioning
 * graphs), snapshot the current head as version 1 so new releases can pin.
 */
async function ensureVersionHistoryFromHead(
  clerkUserId: string,
  config: ReleaseLifecycleConfig
): Promise<{ id: string; version: number } | null> {
  const existing = await readLatestVersionMeta(clerkUserId);
  if (existing) return existing;

  // Only backfill when we have a real head graph — never invent version 0.
  return prisma.$transaction(
    (tx) => appendConfigVersion(tx, clerkUserId, config),
    LIFECYCLE_TX_OPTIONS
  );
}

/**
 * Load and seed the caller's default lifecycle graph on first access.
 * Seeds also create immutable version 1. Existing heads without history get
 * a one-time version-1 backfill from the current graph.
 *
 * @throws only when table setup/read/seed fails; callers decide read fallback.
 * @returns Config plus optional Enterprise Default fallback warning and latest version meta.
 */
export async function loadReleaseLifecycleConfig(
  clerkUserId: string
): Promise<LoadedReleaseLifecycleConfig> {
  await ensureUserReleaseLifecycleTables();
  const existing = await readGraph(clerkUserId);
  if (existing) {
    const latest = await ensureVersionHistoryFromHead(clerkUserId, existing.config);
    return {
      ...existing,
      latestVersionId: latest?.id ?? null,
      latestVersion: latest?.version ?? null,
    };
  }

  const defaults = createDefaultReleaseLifecycleConfig();
  try {
    await prisma.$transaction(async (tx) => {
      await writeGraph(tx, clerkUserId, defaults);
      await appendConfigVersion(tx, clerkUserId, defaults);
    }, LIFECYCLE_TX_OPTIONS);
  } catch (error) {
    const concurrent = await readGraph(clerkUserId);
    if (concurrent) {
      const latest = await ensureVersionHistoryFromHead(clerkUserId, concurrent.config);
      return {
        ...concurrent,
        latestVersionId: latest?.id ?? null,
        latestVersion: latest?.version ?? null,
      };
    }
    throw error;
  }
  const afterSeed = await readGraph(clerkUserId);
  const latest = await readLatestVersionMeta(clerkUserId);
  return {
    config: afterSeed?.config ?? defaults,
    latestVersionId: latest?.id ?? null,
    latestVersion: latest?.version ?? null,
  };
}

/**
 * Replace one user's lifecycle graph after complete validation and append a
 * new immutable config version (mid-flight releases keep their prior pin).
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
    await appendConfigVersion(tx, clerkUserId, config);
  }, LIFECYCLE_TX_OPTIONS);
  const loaded = await readGraph(clerkUserId);
  return loaded?.config ?? normalizeReleaseLifecycleConfig(config);
}

/**
 * Latest version id for pinning a newly created release.
 * Ensures the caller's graph (and version history) exists first.
 * @returns Version row id, or null if versioning is unavailable.
 */
export async function getLatestLifecycleConfigVersionId(
  clerkUserId: string
): Promise<string | null> {
  const loaded = await loadReleaseLifecycleConfig(clerkUserId);
  return loaded.latestVersionId ?? null;
}

/**
 * Resolve the lifecycle config a release should enforce against.
 * Pinned releases use their snapshot; unpinned use latest (latest-unpinned).
 *
 * @param clerkUserId - Config owner (session user today)
 * @param lifecycleConfigVersionId - Release.lifecycleConfigVersionId
 * @returns Resolved config + pin kind for API/UI feedback
 */
export async function resolveLifecycleConfigForRelease(
  clerkUserId: string,
  lifecycleConfigVersionId: string | null | undefined
): Promise<ResolvedReleaseLifecycleConfig> {
  const latestLoaded = await loadReleaseLifecycleConfig(clerkUserId);
  const latest = {
    versionId: latestLoaded.latestVersionId ?? null,
    version: latestLoaded.latestVersion ?? null,
    config: latestLoaded.config,
  };

  let pinned: {
    versionId: string;
    version: number;
    config: ReleaseLifecycleConfig;
  } | null = null;

  if (lifecycleConfigVersionId) {
    const row = await prisma.userReleaseLifecycleConfigVersion.findFirst({
      where: { id: lifecycleConfigVersionId, clerkUserId },
      select: { id: true, version: true, snapshot: true },
    });
    if (row) {
      const parsed = parseLifecycleConfigSnapshot(row.snapshot, { clerkUserId });
      pinned = {
        versionId: row.id,
        version: row.version,
        config: parsed.config,
      };
    }
  }

  return resolveLifecycleConfigPin({
    lifecycleConfigVersionId,
    pinned,
    latest,
  });
}
