/**
 * Server-side storage for native scope / change-request files.
 * Paths are generated on the server. Client paths and URL fetches are rejected.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const DEFAULT_ROOT = ".data/release-scope-files";

/**
 * Tenant key from the session org, or a stable default.
 * Never accepted from the client.
 *
 * @param orgId - Clerk org id when present.
 */
export function tenantKeyFromSession(orgId: string | null | undefined): string {
  const trimmed = (orgId ?? "").trim();
  return trimmed || "default";
}

/**
 * Root directory for stored files (env override for tests / deploy).
 */
export function scopeFileRoot(): string {
  const fromEnv = (process.env.RELEASE_SCOPE_FILE_ROOT ?? "").trim();
  return fromEnv || DEFAULT_ROOT;
}

/**
 * Build a storage key bound to tenant. Never a URL or client path.
 *
 * @param tenantKey - Session tenant.
 * @param fileId - Server-generated file id.
 */
export function buildScopeStorageKey(tenantKey: string, fileId: string): string {
  return `${tenantKey}/${fileId}`;
}

/**
 * Absolute path for a storage key. Rejects traversal and URL-shaped keys.
 *
 * @param storageKey - Server-generated key.
 * @param tenantKey - Session tenant that must own the key.
 */
export function resolveScopeFilePath(storageKey: string, tenantKey: string): string {
  if (!storageKey || storageKey.includes("..") || /:\/\//.test(storageKey)) {
    throw new Error("Invalid storage key");
  }
  if (!storageKey.startsWith(`${tenantKey}/`)) {
    throw new Error("Storage key tenant mismatch");
  }
  const root = resolve(scopeFileRoot());
  const abs = resolve(join(root, storageKey));
  if (!abs.startsWith(root + "/") && abs !== root) {
    throw new Error("Invalid storage key");
  }
  return abs;
}

/**
 * Persist bytes and return the storage key.
 *
 * @param tenantKey - Session tenant.
 * @param bytes - Validated file bytes.
 * @returns Server storage key.
 */
export async function writeScopeFile(tenantKey: string, bytes: Uint8Array): Promise<{
  fileId: string;
  storageKey: string;
}> {
  const fileId = randomBytes(16).toString("hex");
  const storageKey = buildScopeStorageKey(tenantKey, fileId);
  const abs = resolveScopeFilePath(storageKey, tenantKey);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return { fileId, storageKey };
}

/**
 * Read stored bytes after a tenant check.
 *
 * @param storageKey - Server key from the database.
 * @param tenantKey - Session tenant.
 */
export async function readScopeFile(storageKey: string, tenantKey: string): Promise<Buffer> {
  const abs = resolveScopeFilePath(storageKey, tenantKey);
  return readFile(abs);
}

/**
 * New random id for a Prisma row (cuid-compatible enough for tests).
 */
export function newScopeFileId(): string {
  return randomBytes(12).toString("hex");
}
