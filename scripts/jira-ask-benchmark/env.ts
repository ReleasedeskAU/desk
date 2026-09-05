/**
 * Load local .env without logging values. Secrets stay in process.env only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Merge Sentinel/.env into process.env when a key is unset.
 * Never prints values.
 */
export function loadBenchmarkEnv(repoRoot: string): void {
  for (const name of [".env", ".env.local"]) {
    applyEnvFile(resolve(repoRoot, name));
  }
}

function applyEnvFile(path: string): void {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

/**
 * Required Ask test token present (name only).
 */
export function secretPresence(): { askTestToken: boolean } {
  return { askTestToken: Boolean(process.env.ASK_TEST_TOKEN?.trim()) };
}

export function askTestToken(): string {
  const value = process.env.ASK_TEST_TOKEN?.trim() ?? "";
  if (!value) throw new Error("ASK_TEST_TOKEN is not set");
  return value;
}

export function askTestUrl(): string {
  return (
    process.env.ASK_TEST_URL?.trim() || "https://desk-lime-pi.vercel.app/api/ask/test"
  ).replace(/\/+$/, "");
}
