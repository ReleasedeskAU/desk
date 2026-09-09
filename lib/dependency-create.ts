/**
 * Dependency create parsing and client-safe error text (RD-118).
 * Status options come from the caller’s lifecycle config — no hardcoded labels.
 */
import { createDependencySchema, type CreateDependencyInput } from "@/lib/validation/dependency";

export type DependencyCreateParseOk = { ok: true; data: CreateDependencyInput };
export type DependencyCreateParseErr = {
  ok: false;
  error: string;
  issues: { path: string; message: string }[];
};
export type DependencyCreateParseResult = DependencyCreateParseOk | DependencyCreateParseErr;

/**
 * Parse a POST /api/dependencies body (allowlisted fields only).
 * @param body - Raw JSON from the client.
 * @returns Parsed input, or validation issues the UI can show.
 */
export function parseDependencyCreateBody(body: unknown): DependencyCreateParseResult {
  const parsed = createDependencySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Client-safe create/update error. Never includes stack traces.
 * @param payload.error - API `error` string, if any.
 * @param payload.issues - Zod issue list from a 400 body.
 * @param payload.fallback - Used when the body has no usable message.
 */
export function dependencyCreateUserMessage(payload: {
  error?: string | null;
  issues?: Array<{ path?: string; message?: string }> | null;
  fallback?: string;
}): string {
  const firstIssue = (payload.issues ?? []).find(
    (issue) => typeof issue.message === "string" && issue.message.trim()
  );
  if (firstIssue?.message?.trim()) return firstIssue.message.trim();
  const err = payload.error?.trim();
  if (err) return err;
  return payload.fallback?.trim() || "Failed to create dependency";
}

/**
 * True when both release ids are set and equal.
 * Empty/empty must not count as a self-link — that hid required-field errors.
 */
export function isSelfDependency(releaseId: string, dependsOnReleaseId: string): boolean {
  const from = releaseId.trim();
  const onto = dependsOnReleaseId.trim();
  return Boolean(from) && Boolean(onto) && from === onto;
}

/**
 * Prisma write fields for a new ReleaseDependency (no invented columns).
 * @param input - Parsed create body.
 * @param status - Resolved enabled lifecycle label.
 * @param statusKey - Resolved lifecycle key.
 * @param dependencyCode - Server-assigned DEP-nnn.
 * @param sourceOrder - Next list order.
 */
export function toReleaseDependencyCreateData(
  input: CreateDependencyInput,
  status: string,
  statusKey: string | undefined,
  dependencyCode: string,
  sourceOrder: number
) {
  return {
    dependencyCode,
    releaseId: input.releaseId,
    dependsOnReleaseId: input.dependsOnReleaseId,
    dependencyType: input.dependencyType,
    dependencyKind: input.dependencyKind ?? "Release-to-Release",
    status,
    statusKey,
    impactIfBlocked: input.impactIfBlocked,
    notes: input.notes ?? null,
    sourceOrder,
  };
}
