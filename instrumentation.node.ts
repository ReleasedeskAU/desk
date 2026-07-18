/**
 * Node-only instrumentation — must stay out of the Edge instrumentation graph.
 * Loaded only when `NEXT_RUNTIME === "nodejs"` from instrumentation.ts.
 *
 * @sideEffects Pings Neon via Prisma so the first user request is less likely to cold-start.
 * @throws Never — errors are caught and logged.
 */
export async function registerNode(): Promise<void> {
  try {
    const { ensureDbAwake } = await import("@/lib/prisma");
    const ok = await ensureDbAwake();
    if (ok) console.log("[instrumentation] Neon database awake");
    else console.warn("[instrumentation] Neon wake failed — first requests may retry");
  } catch (err) {
    console.warn("[instrumentation] db wake skipped:", err);
  }
}
