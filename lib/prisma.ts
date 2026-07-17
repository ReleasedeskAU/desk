import { PrismaClient } from "@releasedesk/database";

// Neon pooled DATABASE_URL works for queries; Prisma schema still requires DIRECT_URL.
// Vercel often only has DATABASE_URL — fall back so the whole API does not 500 at import.
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaResetLock: Promise<void> | undefined;
  prismaWakeLock: Promise<boolean> | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
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

function isEngineNotConnected(err: unknown): boolean {
  const msg = errMessage(err).toLowerCase();
  return msg.includes("engine is not yet connected") || msg.includes("not yet connected");
}

function isRetryableDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; name?: string };
  if (e.code && RETRYABLE_CODES.has(e.code)) return true;
  if (e.name === "PrismaClientInitializationError") return true;
  if (isEngineNotConnected(err)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes("timed out") ||
    msg.includes("connection reset") ||
    msg.includes("server closed the connection") ||
    msg.includes("connection terminated")
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
 * Default: 4 attempts, exponential backoff starting at 500ms.
 */
export async function withDbRetry<T>(
  op: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number; label?: string }
): Promise<T> {
  const attempts = opts?.attempts ?? 4;
  const baseDelayMs = opts?.baseDelayMs ?? 500;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || i === attempts - 1) throw err;
      const delay = baseDelayMs * 2 ** i;
      const label = opts?.label ? ` (${opts.label})` : "";
      const msg = errMessage(err).slice(0, 160);
      console.warn(`[db] retry ${i + 1}/${attempts - 1} after ${delay}ms${label}:`, msg);

      try {
        if (isEngineNotConnected(err)) {
          // Stuck engine under Turbopack — recreate the whole client, don't $connect the corpse.
          await sleep(Math.min(delay, 1500));
          await resetPrismaClient();
        } else {
          // Network/pooler blip — brief pause; avoid $disconnect (kills in-flight siblings).
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

/** Best-effort wake ping — single-flight so parallel routes don't thrash the engine. */
export async function ensureDbAwake(): Promise<boolean> {
  if (globalForPrisma.prismaWakeLock) {
    return globalForPrisma.prismaWakeLock;
  }

  globalForPrisma.prismaWakeLock = (async () => {
    try {
      await withDbRetry(
        async () => {
          await getClient().$connect();
          await getClient().$queryRawUnsafe("SELECT 1");
        },
        {
          attempts: 5,
          baseDelayMs: 800,
          label: "wake",
        }
      );
      return true;
    } catch (err) {
      console.warn("[db] wake failed:", errMessage(err).slice(0, 200));
      return false;
    } finally {
      globalForPrisma.prismaWakeLock = undefined;
    }
  })();

  return globalForPrisma.prismaWakeLock;
}
