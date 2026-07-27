import { PrismaClient } from "@releasedesk/database";

/**
 * Normalize Neon/Postgres URLs for Vercel serverless and local Next:
 * - pooler hosts get pgbouncer=true (Prisma transaction mode)
 * - production/serverless: connection_limit=1 (avoid exhausting Neon across lambdas)
 * - local/dev long-lived process: connection_limit=5 + longer pool_timeout
 * - connect_timeout gives cold compute time to accept TCP
 */
function withServerlessParams(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const isDev = process.env.NODE_ENV === "development";
    if (host.includes("pooler") || host.includes("pgbouncer")) {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    }
    if (!u.searchParams.has("connection_limit")) {
      // Dev: allow concurrent API routes; prod lambdas stay at 1.
      u.searchParams.set("connection_limit", isDev ? "10" : "1");
    } else if (isDev) {
      // Long-lived Next process under turbopack can saturate a tiny pool during Neon wake.
      const n = Number(u.searchParams.get("connection_limit"));
      if (!Number.isFinite(n) || n < 10) {
        u.searchParams.set("connection_limit", "10");
      }
    }
    if (!u.searchParams.has("pool_timeout")) {
      // Wait longer before "Timed out fetching a new connection" under Neon wake.
      u.searchParams.set("pool_timeout", isDev ? "60" : "30");
    } else if (isDev) {
      const n = Number(u.searchParams.get("pool_timeout"));
      if (!Number.isFinite(n) || n < 60) {
        u.searchParams.set("pool_timeout", "60");
      }
    }
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "20");
    }
    // channel_binding=require breaks some serverless TLS stacks with Neon.
    if (u.searchParams.get("channel_binding") === "require") {
      u.searchParams.delete("channel_binding");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  return withServerlessParams(raw);
}

function resolveDirectUrl(): string | undefined {
  const raw = (process.env.DIRECT_URL || process.env.DATABASE_URL)?.trim();
  if (!raw) return undefined;
  return withServerlessParams(raw);
}

// Prisma schema requires DIRECT_URL at client init — Vercel often only has DATABASE_URL.
const resolvedDbUrl = resolveDatabaseUrl();
const resolvedDirectUrl = resolveDirectUrl();
if (!process.env.DIRECT_URL && resolvedDirectUrl) {
  process.env.DIRECT_URL = resolvedDirectUrl;
}
if (resolvedDbUrl) {
  process.env.DATABASE_URL = resolvedDbUrl;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaResetLock: Promise<void> | undefined;
  prismaWakeLock: Promise<boolean> | undefined;
};

function createPrismaClient() {
  const url = resolveDatabaseUrl();
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Proxy so every `import { prisma }` always hits the *current* client.
 * Critical after Turbopack HMR / $disconnect — a stale const binding stays dead forever.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

/** Neon cold-start / pooler blip codes that are safe to retry. */
const RETRYABLE_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operations timed out
  "P1017", // Server closed the connection
]);

function errMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "");
  return String((err as { message?: string }).message ?? "");
}

function errCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  return (err as { code?: string }).code;
}

function isEngineNotConnected(err: unknown): boolean {
  const msg = errMessage(err).toLowerCase();
  return msg.includes("engine is not yet connected") || msg.includes("not yet connected");
}

/**
 * Whether an error is a transient Neon/pooler/network failure worth retrying.
 * @param err - Unknown thrown value from Prisma or the runtime.
 */
export function isRetryableDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; name?: string };
  if (e.code && RETRYABLE_CODES.has(e.code)) return true;
  if (e.name === "PrismaClientInitializationError") return true;
  if (isEngineNotConnected(err)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes("timed out") ||
    msg.includes("timed out fetching a new connection") ||
    msg.includes("connection pool") ||
    msg.includes("connection reset") ||
    msg.includes("server closed the connection") ||
    msg.includes("connection terminated") ||
    msg.includes("server has closed the connection") ||
    msg.includes("error connecting to database") ||
    msg.includes("connection refused")
  );
}

function isPoolExhaustedError(err: unknown): boolean {
  const msg = errMessage(err).toLowerCase();
  return (
    msg.includes("timed out fetching a new connection") ||
    msg.includes("connection pool")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tear down the stuck engine and build a fresh PrismaClient (serialized). */
async function resetPrismaClient(): Promise<void> {
  if (globalForPrisma.prismaResetLock) {
    await globalForPrisma.prismaResetLock;
    return;
  }

  globalForPrisma.prismaResetLock = (async () => {
    const old = globalForPrisma.prisma;
    globalForPrisma.prisma = undefined;
    if (old) {
      try {
        await old.$disconnect();
      } catch {
        /* ignore */
      }
    }
    const next = createPrismaClient();
    globalForPrisma.prisma = next;
    await next.$connect();
  })();

  try {
    await globalForPrisma.prismaResetLock;
  } finally {
    globalForPrisma.prismaResetLock = undefined;
  }
}

/**
 * Run a Prisma operation with retries for Neon cold-starts / transient pooler failures.
 * Default: 5 attempts, exponential backoff starting at 700ms (Neon resume can take >10s).
 */
export async function withDbRetry<T>(
  op: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number; label?: string }
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 700;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || i === attempts - 1) throw err;
      const delay = Math.min(baseDelayMs * 2 ** i, 8000);
      const label = opts?.label ? ` (${opts.label})` : "";
      const msg = errMessage(err).slice(0, 160);
      console.warn(`[db] retry ${i + 1}/${attempts - 1} after ${delay}ms${label}:`, msg);

      try {
        if (isEngineNotConnected(err) || isPoolExhaustedError(err)) {
          // Stuck / saturated pool — drop the engine and rebuild before retrying.
          await sleep(Math.min(delay, 1500));
          await resetPrismaClient();
        } else {
          await sleep(delay);
          try {
            await getClient().$connect();
          } catch {
            await resetPrismaClient();
          }
        }
      } catch {
        await sleep(delay);
      }
    }
  }

  throw lastErr;
}

/** Safe (non-secret) snapshot of whether DB env vars are present for diagnostics. */
export function getDbEnvPresence(): {
  hasDatabaseUrl: boolean;
  hasDirectUrl: boolean;
  databaseHost: string | null;
} {
  const raw = process.env.DATABASE_URL?.trim() ?? "";
  let databaseHost: string | null = null;
  try {
    if (raw) databaseHost = new URL(raw).hostname;
  } catch {
    databaseHost = "(unparseable)";
  }
  return {
    hasDatabaseUrl: Boolean(raw),
    hasDirectUrl: Boolean(process.env.DIRECT_URL?.trim()),
    databaseHost,
  };
}

/**
 * Best-effort wake ping — single-flight so parallel routes don't thrash the engine.
 * Returns false only after retries fail; callers should still attempt work via withDbRetry.
 */
export async function ensureDbAwake(): Promise<boolean> {
  if (globalForPrisma.prismaWakeLock) {
    return globalForPrisma.prismaWakeLock;
  }

  globalForPrisma.prismaWakeLock = (async () => {
    const presence = getDbEnvPresence();
    if (!presence.hasDatabaseUrl) {
      console.error("[db] wake failed: DATABASE_URL is not set in this environment");
      return false;
    }

    try {
      await withDbRetry(
        async () => {
          await getClient().$connect();
          await getClient().$queryRawUnsafe("SELECT 1");
        },
        {
          attempts: 6,
          baseDelayMs: 1000,
          label: "wake",
        }
      );
      return true;
    } catch (err) {
      console.warn("[db] wake failed:", {
        ...presence,
        code: errCode(err) ?? null,
        message: errMessage(err).slice(0, 200),
      });
      return false;
    } finally {
      globalForPrisma.prismaWakeLock = undefined;
    }
  })();

  return globalForPrisma.prismaWakeLock;
}

/**
 * Probe DB connectivity for health endpoints.
 * @returns Latency and error metadata — never includes connection strings.
 */
export async function probeDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  code?: string;
  message?: string;
  env: ReturnType<typeof getDbEnvPresence>;
}> {
  const env = getDbEnvPresence();
  const started = Date.now();
  if (!env.hasDatabaseUrl) {
    return {
      ok: false,
      latencyMs: 0,
      code: "MISSING_DATABASE_URL",
      message: "DATABASE_URL is not set",
      env,
    };
  }
  try {
    await withDbRetry(
      async () => {
        await getClient().$connect();
        await getClient().$queryRawUnsafe("SELECT 1");
      },
      { attempts: 4, baseDelayMs: 800, label: "probe" }
    );
    return { ok: true, latencyMs: Date.now() - started, env };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      code: errCode(err) ?? "DB_ERROR",
      message: errMessage(err).slice(0, 200),
      env,
    };
  }
}
