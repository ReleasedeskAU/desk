/**
 * Back-compat surface for voice sidebar resolution.
 * Implementation lives in the Navigation Agent (`lib/voice/nav-agent.ts`),
 * which derives tabs from `lib/nav-data.ts` (+ live DOM sync).
 */
import {
  listNavRegistry,
  normalizeSpokenNavPhrase,
  resolveNavTarget,
  voiceNavAgentBrief,
  VOICE_PATH_ALIASES,
  type NavRegistryEntry,
} from "@/lib/voice/nav-agent";

export type VoiceSidebarItem = {
  href: string;
  label: string;
  section: string;
  synonyms: readonly string[];
};

/** Sidebar inventory derived from the nav agent registry. */
export function getVoiceSidebarCatalog(): readonly VoiceSidebarItem[] {
  return listNavRegistry().map((e: NavRegistryEntry) => ({
    href: e.href,
    label: e.label,
    section: e.section,
    synonyms: e.synonyms,
  }));
}

/** @deprecated Prefer getVoiceSidebarCatalog() — snapshot at first import. */
export const VOICE_SIDEBAR_CATALOG: readonly VoiceSidebarItem[] =
  getVoiceSidebarCatalog();

export { VOICE_PATH_ALIASES, normalizeSpokenNavPhrase };

/**
 * Resolve a spoken name, label, synonym, or near-miss path to a sidebar href.
 * @param raw - e.g. "calendar tab", "env booking page", "/bookings".
 * @returns Canonical path + label, or null if unknown.
 */
export function resolveVoiceNavTarget(
  raw: string
): { path: string; label: string; section: string } | null {
  const hit = resolveNavTarget(raw);
  if (!hit) return null;
  // Keep prior behavior: unknown non-detail chatter → null (resolveNavTarget
  // may return weak detail-shaped paths for allowlisted recovery in navigate_to).
  if (
    hit.kind === "detail" &&
    !hit.href.startsWith("/") // unreachable; defensive
  ) {
    return null;
  }
  // For bare phrases that did not match, resolveNavTarget returns null.
  // For path-shaped unknown URLs it returns kind detail — navigate_to still
  // allowlists those. Spoken unknown chatter stays null.
  if (!raw.trim().startsWith("/") && !/^https?:\/\//i.test(raw.trim())) {
    if (hit.kind === "detail" && !listNavRegistry().some((e) => e.href === hit.href)) {
      return null;
    }
  }
  return { path: hit.href, label: hit.label, section: hit.section };
}

/**
 * Full sidebar inventory for Live systemInstruction (via nav agent).
 */
export function voiceSidebarCatalogBrief(): string {
  return voiceNavAgentBrief();
}
