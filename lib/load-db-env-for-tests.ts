/**
 * Side-effect import for node:test / tsx scripts that need Prisma without Next.js
 * loading `.env`. Prefer Sentinel/.env.local then `.env` (file wins over ambient).
 *
 * Import this module before `@/lib/prisma` in test/script entrypoints.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const root = resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const envPath = resolve(root, name);
  if (!existsSync(envPath)) continue;
  const fromFile = parseDotEnv(readFileSync(envPath, "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    if (fromFile[key]) process.env[key] = fromFile[key];
  }
}
