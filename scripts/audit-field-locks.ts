/**
 * Matrix auditor for Release field locks.
 *
 * Sweeps every (field × live status) in a scope’s live config, calls the real
 * engine (`getFieldLockState` / `getFieldLockStateFromRows`), and reports mismatches.
 *
 * Usage:
 *   npm run audit:field-locks
 *   npm run audit:field-locks -- --clerkUserId=user_xxx
 *   FIELD_LOCK_AUDIT_CLERK_USER_ID=user_xxx npm run audit:field-locks
 *
 * Exit 0 = clean; non-zero = logic mismatches (orphans alone do not fail the run
 * unless --fail-on-orphans is passed).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FieldLockState } from "@/lib/release-field-lock-catalog";
import type { ReleaseFieldLockRow } from "@/lib/release-field-lock-config-db";

/**
 * Parse KEY=VALUE lines from a .env file (no expansion).
 * @param text - Raw file contents.
 * @returns Map of keys to values.
 */
function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load DATABASE_URL / DIRECT_URL from Sentinel/.env(.local) before Prisma init.
 * File values win over ambient env (same as run-db-migrate.mjs).
 */
function loadDbEnvFromFiles(): void {
  const root = resolve(__dirname, "..");
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(root, name);
    if (!existsSync(envPath)) continue;
    const fromFile = parseDotEnv(readFileSync(envPath, "utf8"));
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
      if (fromFile[key]) process.env[key] = fromFile[key];
    }
  }
}

loadDbEnvFromFiles();

type Mismatch = {
  fieldKey: string;
  statusKey: string;
  expected: FieldLockState;
  actual: FieldLockState;
  kind: "matrix" | "non_configurable";
};

type OrphanRef = {
  fieldKey: string;
  statusKey: string;
};

function parseArgs(argv: string[]): {
  clerkUserId: string | null;
  failOnOrphans: boolean;
} {
  let clerkUserId: string | null =
    process.env.FIELD_LOCK_AUDIT_CLERK_USER_ID?.trim() || null;
  let failOnOrphans = false;
  for (const arg of argv) {
    if (arg === "--fail-on-orphans") failOnOrphans = true;
    if (arg.startsWith("--clerkUserId=")) {
      clerkUserId = arg.slice("--clerkUserId=".length).trim() || null;
    }
  }
  return { clerkUserId, failOnOrphans };
}

function expectedFromRow(
  row: ReleaseFieldLockRow,
  statusKey: string
): FieldLockState {
  // Match engine fail-closed: missing key → locked
  return row.statusRules[statusKey] ?? "locked";
}

/**
 * Run the matrix audit and print a report.
 * @returns process exit code
 */
async function main(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const { RELEASE_FIELD_LOCK_CATALOG } = await import(
    "@/lib/release-field-lock-catalog"
  );
  const { loadReleaseFieldLockConfig } = await import(
    "@/lib/release-field-lock-config-db"
  );
  const { getFieldLockState, getFieldLockStateFromRows } = await import(
    "@/lib/release-field-lock-engine"
  );

  const { clerkUserId: argId, failOnOrphans } = parseArgs(process.argv.slice(2));

  async function resolveClerkUserId(explicit: string | null): Promise<string> {
    if (explicit) return explicit;

    const existing = await prisma.userReleaseFieldLockConfig.findFirst({
      select: { clerkUserId: true },
      orderBy: { updatedAt: "desc" },
    });
    if (existing?.clerkUserId) return existing.clerkUserId;

    // Deterministic seeded scope for CI / empty DB — loadReleaseFieldLockConfig seeds defaults.
    return "field_lock_audit_seed_scope";
  }

  const clerkUserId = await resolveClerkUserId(argId);

  console.log("Field-lock matrix auditor");
  console.log(`Scope clerkUserId: ${clerkUserId}`);
  console.log("");

  try {
    const loaded = await loadReleaseFieldLockConfig(clerkUserId);
    const liveStatuses = loaded.lifecycleConfig.statuses
      .filter((s) => s.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (liveStatuses.length === 0) {
      console.error("FAIL: no enabled lifecycle statuses for this scope");
      return 2;
    }

    const liveKeys = new Set(liveStatuses.map((s) => s.key));
    const mismatches: Mismatch[] = [];
    const orphans: OrphanRef[] = [];

    for (const row of loaded.rows) {
      for (const statusKey of Object.keys(row.statusRules)) {
        if (!liveKeys.has(statusKey)) {
          orphans.push({ fieldKey: row.fieldKey, statusKey });
        }
      }
    }

    const catalogByKey = new Map(
      RELEASE_FIELD_LOCK_CATALOG.map((e) => [e.fieldKey, e])
    );

    // One async loader spot-check (full getFieldLockState path) — not per cell,
    // so we don't re-hit Neon hundreds of times for an in-memory matrix sweep.
    const spotField = loaded.rows[0]?.fieldKey;
    const spotStatus = liveStatuses[0]?.key;
    if (spotField && spotStatus) {
      const fromRows = getFieldLockStateFromRows(
        loaded.rows,
        spotField,
        spotStatus
      );
      const viaLoader = await getFieldLockState(
        clerkUserId,
        spotField,
        spotStatus
      );
      if (viaLoader !== fromRows) {
        mismatches.push({
          fieldKey: spotField,
          statusKey: spotStatus,
          expected: fromRows,
          actual: viaLoader,
          kind: "matrix",
        });
      }
    }

    let checked = 0;
    for (const row of loaded.rows) {
      const catalog = catalogByKey.get(row.fieldKey);
      for (const status of liveStatuses) {
        checked += 1;
        // Real engine path (same function getFieldLockState uses after load).
        const actual = getFieldLockStateFromRows(
          loaded.rows,
          row.fieldKey,
          status.key
        );

        const expectedMatrix = expectedFromRow(row, status.key);
        if (actual !== expectedMatrix) {
          mismatches.push({
            fieldKey: row.fieldKey,
            statusKey: status.key,
            expected: expectedMatrix,
            actual,
            kind: "matrix",
          });
        }

        // Non-configurable catalog fields must never report editable* from the engine.
        const mustStayLocked =
          catalog &&
          !catalog.isConfigurable &&
          !catalog.unavailable &&
          !catalog.infoOnly;
        if (mustStayLocked && actual !== "locked") {
          mismatches.push({
            fieldKey: row.fieldKey,
            statusKey: status.key,
            expected: "locked",
            actual,
            kind: "non_configurable",
          });
        }
      }
    }

    const seen = new Set<string>();
    const uniqueMismatches = mismatches.filter((m) => {
      const k = `${m.kind}:${m.fieldKey}:${m.statusKey}:${m.expected}:${m.actual}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const failedCombos = new Set(
      uniqueMismatches.map((m) => `${m.fieldKey}::${m.statusKey}`)
    );
    const failCount = failedCombos.size;
    const passCount = checked - failCount;

    console.log(
      `Live statuses (${liveStatuses.length}): ${liveStatuses.map((s) => s.label).join(", ")}`
    );
    console.log(`Configured fields: ${loaded.rows.length}`);
    console.log(`Combinations checked: ${checked}`);
    console.log(`Pass: ${passCount}`);
    console.log(`Fail: ${failCount}`);
    console.log(`Orphan status references: ${orphans.length}`);
    console.log("");

    if (orphans.length > 0) {
      console.log(
        "--- Orphan references (needs reconciliation; not counted as logic fail) ---"
      );
      console.log("fieldKey".padEnd(28) + "statusKey");
      for (const o of orphans) {
        console.log(o.fieldKey.padEnd(28) + o.statusKey);
      }
      console.log("");
    }

    if (uniqueMismatches.length > 0) {
      console.log("--- Failures ---");
      console.log(
        "kind".padEnd(18) +
          "fieldKey".padEnd(28) +
          "statusKey".padEnd(22) +
          "expected".padEnd(28) +
          "actual"
      );
      for (const m of uniqueMismatches) {
        console.log(
          m.kind.padEnd(18) +
            m.fieldKey.padEnd(28) +
            m.statusKey.padEnd(22) +
            m.expected.padEnd(28) +
            m.actual
        );
      }
      console.log("");
    } else {
      console.log("No logic mismatches.");
      console.log("");
    }

    if (failCount > 0) return 1;
    if (failOnOrphans && orphans.length > 0) return 1;
    return 0;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then((code) => {
    // Hard-exit so a slow Prisma disconnect cannot hang CI/local shells.
    process.exit(code);
  })
  .catch((err) => {
    console.error(
      "Auditor crashed:",
      err instanceof Error ? err.message : err
    );
    process.exit(2);
  });
