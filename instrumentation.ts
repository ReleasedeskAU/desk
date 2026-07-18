/**
 * Next.js instrumentation — entry for both runtimes.
 * Prisma/Node APIs live in instrumentation.node.ts so Edge bundling never
 * walks the generated Prisma client (which requires Node builtins like `path`).
 */
export async function register() {
  // Gate before import so Webpack/Edge do not pull Prisma into a non-Node bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerNode } = await import("./instrumentation.node");
  await registerNode();
}
