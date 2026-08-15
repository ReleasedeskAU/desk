/**
 * Per-field sign-off intake clocks. SLA expiry uses these stamps — not
 * release.createdAt — so setting Pending on an old release does not expire
 * immediately.
 *
 * Stored as JSONB `Release.signoffIntakeAt` via additive ALTER (do not
 * `prisma db push` the vendored schema).
 */
import { prisma } from "@/lib/prisma";
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import {
  SIGNOFF_SLA_FIELDS,
  type SignoffReleaseField,
} from "@/lib/signoff-lifecycle-config";
import { resolveSignoffLifecycleStatusRef } from "@/lib/signoff-lifecycle-transition";

export type SignoffIntakeAtMap = Partial<Record<SignoffReleaseField, string>>;

let columnReady: Promise<void> | null = null;

/**
 * Ensure the intake-clock JSON column exists (Neon / deploy-safe).
 */
export async function ensureSignoffIntakeAtColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = (async () => {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "signoffIntakeAt" JSONB`
      );
    })().catch((err) => {
      columnReady = null;
      throw err;
    });
  }
  await columnReady;
}

/**
 * Parse a stored JSON map of field → ISO timestamp.
 */
export function parseSignoffIntakeAt(raw: unknown): SignoffIntakeAtMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SignoffIntakeAtMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(SIGNOFF_SLA_FIELDS as readonly string[]).includes(key)) continue;
    if (typeof value !== "string" || !value.trim()) continue;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) continue;
    out[key as SignoffReleaseField] = d.toISOString();
  }
  return out;
}

/**
 * Build the next intake-clock map after canonical sign-off writes.
 *
 * Stamps `now` when a field *enters* intake (Pending). Keeps the existing
 * stamp if it was already intake. Clears the stamp when leaving intake.
 *
 * @param args.config - Live sign-off lifecycle (intake = isIntake role).
 * @param args.existingValues - Values before the write.
 * @param args.writes - Canonical labels being persisted.
 * @param args.previous - Current JSON map.
 * @param args.now - Evaluation clock.
 */
export function nextSignoffIntakeAtMap(args: {
  config: SignoffLifecycleConfig;
  existingValues: Partial<Record<SignoffReleaseField, string | null | undefined>>;
  writes: Partial<Record<SignoffReleaseField, string>>;
  previous: SignoffIntakeAtMap;
  now: Date;
}): SignoffIntakeAtMap {
  const next: SignoffIntakeAtMap = { ...args.previous };
  const iso = args.now.toISOString();
  for (const field of SIGNOFF_SLA_FIELDS) {
    const written = args.writes[field];
    if (written === undefined) continue;
    const wasIntake = Boolean(
      resolveSignoffLifecycleStatusRef(args.config, args.existingValues[field])
        ?.isIntake
    );
    const nowIntake = Boolean(
      resolveSignoffLifecycleStatusRef(args.config, written)?.isIntake
    );
    if (nowIntake) {
      next[field] = wasIntake && next[field] ? next[field] : iso;
    } else {
      delete next[field];
    }
  }
  return next;
}

/**
 * Intake clock for one field. Missing stamp → do not expire (fail-safe).
 */
export function signoffFieldIntakeAnchor(
  field: SignoffReleaseField,
  intakeAt: SignoffIntakeAtMap
): Date | null {
  const raw = intakeAt[field];
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Read the JSON map for a release (empty object when unset).
 */
export async function readSignoffIntakeAt(
  releaseId: string
): Promise<SignoffIntakeAtMap> {
  await ensureSignoffIntakeAtColumn();
  const rows = await prisma.$queryRawUnsafe<{ signoffIntakeAt: unknown }[]>(
    `SELECT "signoffIntakeAt" FROM "Release" WHERE id = $1 LIMIT 1`,
    releaseId
  );
  return parseSignoffIntakeAt(rows[0]?.signoffIntakeAt);
}

/**
 * Persist the JSON map for a release.
 */
export async function writeSignoffIntakeAt(
  releaseId: string,
  map: SignoffIntakeAtMap
): Promise<void> {
  await ensureSignoffIntakeAtColumn();
  await prisma.$executeRawUnsafe(
    `UPDATE "Release" SET "signoffIntakeAt" = $1::jsonb WHERE id = $2`,
    JSON.stringify(map),
    releaseId
  );
}
