/**
 * Page-context agent — ground-truth snapshot of what the UI is currently showing.
 * List pages publish rows via APP_CONTEXT; this module formats them for tools + Live.
 */
import {
  formatVoiceAppContextHint,
  getVoiceAppContext,
  type VoiceAppContextPacket,
  type VoiceVisibleRow,
} from "@/lib/voice/app-context";

/** Max rows returned by get_page_context (matches APP_CONTEXT cap). */
export const VOICE_PAGE_CONTEXT_MAX_ROWS = 40;

export type VoicePageSnapshot = {
  page: string;
  href: string;
  entityType: string | null;
  note?: string;
  count: number;
  rows: Array<{ index: number; code: string; label: string; path: string }>;
  query: string;
  updatedAt: number | null;
};

/**
 * Compact brief for Live systemInstruction.
 */
export function voicePageContextBrief(): string {
  return [
    "get_page_context: REQUIRED when the user asks what is on this page / filtered list / names and ids / what am I looking at (list data).",
    "It returns the exact on-screen rows (codes + names) after filters/sort — ground truth. Do NOT use screen share for that.",
    "After apply_list_filters, call get_page_context before listing rows (table may refresh first).",
    "search_entity searches the whole company DB — it is NOT the filtered table. Prefer get_page_context for filtered/on-screen lists.",
    "You were built by the Release Desk Team — never say you were built by Google.",
  ].join(" ");
}

/**
 * True when the user wants on-screen / filtered list data (not visual layout OCR).
 * @param raw - User utterance.
 */
export function isPageDataQuery(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(filtered|on[- ]?screen|visible|showing|current)\b.*\b(release|blocker|conflict|row|list|result|item)/i.test(
      t
    ) ||
    /\b(release|blocker|conflict|row|list|result)s?\b.*\b(filtered|on[- ]?screen|visible|showing)\b/i.test(
      t
    ) ||
    /\b(tell me|list|read|what are|which are|name|names|ids?|codes?)\b.*\b(release|blocker|conflict|row|result)/i.test(
      t
    ) ||
    /\b(what('?s| is)|whats)\b.*\b(filtered|showing|on (this |the )?(list|table|page))\b/i.test(
      t
    ) ||
    /\bhow many\b.*\b(release|blocker|conflict|row|result)/i.test(t) ||
    /\b(page data|table data|list data|what('?s| is) filtered)\b/i.test(t)
  );
}

/**
 * Build a snapshot from published APP_CONTEXT + current browser href.
 * @param href - Optional override (tests / injectable).
 */
export function buildVoicePageSnapshot(href?: string): VoicePageSnapshot {
  const packet = getVoiceAppContext();
  const resolvedHref =
    href ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "");
  const query = resolvedHref.includes("?")
    ? (resolvedHref.split("?")[1] ?? "")
    : "";

  if (!packet) {
    return {
      page: resolvedHref.split(/[?#]/)[0] || "(unknown)",
      href: resolvedHref,
      entityType: null,
      count: 0,
      rows: [],
      query,
      updatedAt: null,
    };
  }

  return snapshotFromPacket(packet, resolvedHref, query);
}

function snapshotFromPacket(
  packet: VoiceAppContextPacket,
  href: string,
  query: string
): VoicePageSnapshot {
  const rows = packet.visible.slice(0, VOICE_PAGE_CONTEXT_MAX_ROWS).map(
    (r: VoiceVisibleRow, i: number) => ({
      index: i + 1,
      code: r.code,
      label: r.label,
      path: r.path,
    })
  );
  return {
    page: packet.page,
    href,
    entityType: packet.entityType,
    note: packet.note,
    count: rows.length,
    rows,
    query,
    updatedAt: packet.updatedAt,
  };
}

/**
 * Spoken instruction for the model after reading page context.
 */
export function formatPageContextSpeechInstruction(
  snap: VoicePageSnapshot
): string {
  if (snap.count === 0) {
    return [
      `Page ${snap.page} shows 0 rows${snap.query ? ` (filters: ${snap.query})` : ""}.`,
      "Say the table is empty under current filters. Do not invent codes.",
      "Offer to clear filters or change filters with apply_list_filters.",
    ].join(" ");
  }
  const sample = snap.rows
    .slice(0, 12)
    .map((r) => `${r.code} — ${r.label.replace(/^[A-Z]{2,5}-\d+\s*[—-]\s*/, "")}`)
    .join("; ");
  return [
    `Ground truth: ${snap.count} on-screen row(s) on ${snap.page}${snap.note ? ` (${snap.note})` : ""}${snap.query ? `; URL filters: ${snap.query}` : ""}.`,
    `Speak ONLY these codes/names (exact): ${sample}${snap.count > 12 ? `; …and ${snap.count - 12} more` : ""}.`,
    "Do not invent extra IDs. No screen share needed. If the user wants a detail, navigate_to with row.path.",
  ].join(" ");
}

/**
 * Silent Live push text when the UI table updates.
 */
export function formatPageContextLiveUpdate(
  packet: VoiceAppContextPacket | null,
  href?: string
): string | null {
  if (!packet) return null;
  const hint = formatVoiceAppContextHint(packet);
  const path =
    href ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : packet.page);
  return [
    "[PAGE_UPDATE]",
    `href=${path}`,
    hint,
    "This is the latest on-screen table. When the user asks what is showing / filtered names or ids, call get_page_context (or speak these exact visible codes). Do not invent IDs. Do not say you cannot see the page.",
  ].join(" ");
}
