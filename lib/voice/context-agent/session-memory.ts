/**
 * Short-lived per-tab session memory for voice resolves.
 * Remembers recent entities so “that release” / “the same one” work without
 * re-querying — never a whole-DB dump, never cross-tenant.
 */

import type { VoiceRememberedEntity } from "@/lib/voice/context-agent/types";

const MAX_REMEMBERED = 8;

let memory: VoiceRememberedEntity[] = [];

/**
 * Clear remembered entities (fresh mic / user stop).
 */
export function clearVoiceSessionMemory(): void {
  memory = [];
}

/**
 * Read recent remembered entities (newest first).
 */
export function getVoiceSessionMemory(): readonly VoiceRememberedEntity[] {
  return memory;
}

/**
 * Remember a resolved entity after a successful search/navigate/summary.
 * @param entity - Path + label from tools (no PII beyond business labels).
 */
export function rememberVoiceEntity(entity: {
  path: string;
  label: string;
  type: string;
  code?: string;
}): void {
  const path = entity.path.trim();
  if (!path.startsWith("/")) return;
  const code =
    entity.code?.trim() ||
    path.split("/").filter(Boolean).pop() ||
    entity.label;
  const next: VoiceRememberedEntity = {
    path,
    code,
    label: entity.label.trim() || code,
    type: entity.type.trim() || "unknown",
    at: Date.now(),
  };
  memory = [
    next,
    ...memory.filter((m) => m.path !== next.path),
  ].slice(0, MAX_REMEMBERED);
}

/**
 * Resolve a pronoun / “that one” against session memory.
 * @param entityType - Optional type filter (release, blocker, …).
 */
export function resolveVoicePronoun(
  entityType?: string
): VoiceRememberedEntity | null {
  if (memory.length === 0) return null;
  const t = entityType?.trim().toLowerCase();
  if (!t) return memory[0] ?? null;
  return memory.find((m) => m.type.toLowerCase() === t) ?? null;
}

/**
 * Compact hint for Live silent context (not a DB dump).
 */
export function formatVoiceSessionMemoryHint(): string | null {
  if (memory.length === 0) return null;
  const lines = memory
    .slice(0, 5)
    .map((m, i) => `${i + 1}:${m.code}(${m.type})`);
  return `[SESSION_MEMORY] recent=[${lines.join("; ")}]. “that/the same/it” → prefer these codes via search_entity; never invent ids.`;
}
