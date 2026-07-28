/**
 * Route-scoped visible-row context for voice.
 * List pages publish the rows the user currently sees; the Live client pushes
 * [APP_CONTEXT] alongside spoken queries, and search_entity prefers this order
 * for on-page ordinals.
 */
import type { SearchEntityType } from "@/lib/search-entity-types";

/** Max visible rows published (covers typical list pages + "10th"/"20th" ordinals). */
export const VOICE_APP_CONTEXT_MAX_ROWS = 40;

export type VoiceVisibleRow = {
  /** Business code (REL-0001, BLK-0010) or stable id. */
  code: string;
  /** Short human label for the brief / speech. */
  label: string;
  /** Detail path for navigate_to. */
  path: string;
};

export type VoiceAppContextPacket = {
  page: string;
  entityType: SearchEntityType | null;
  visible: VoiceVisibleRow[];
  /** Optional filter/sort hint for the model (non-PII). */
  note?: string;
  updatedAt: number;
};

type Listener = (packet: VoiceAppContextPacket | null) => void;

let current: VoiceAppContextPacket | null = null;
const listeners = new Set<Listener>();

/**
 * Read the latest published list context (browser only).
 */
export function getVoiceAppContext(): VoiceAppContextPacket | null {
  return current;
}

/**
 * Subscribe to context updates (VoiceMic / client).
 * @returns Unsubscribe.
 */
export function subscribeVoiceAppContext(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publish visible rows for the active list page (or clear with null).
 * @param packet - Context or null when leaving the page.
 */
export function setVoiceAppContext(
  packet: Omit<VoiceAppContextPacket, "updatedAt"> | null
): void {
  current = packet
    ? {
        ...packet,
        visible: packet.visible.slice(0, VOICE_APP_CONTEXT_MAX_ROWS),
        updatedAt: Date.now(),
      }
    : null;
  for (const listener of listeners) listener(current);
}

/**
 * Format a compact realtime hint for Gemini Live (codes + short labels).
 * @param packet - Current context.
 */
export function formatVoiceAppContextHint(
  packet: VoiceAppContextPacket
): string {
  const vis =
    packet.visible.length === 0
      ? "(none)"
      : packet.visible
          .map((r, i) => {
            const short = r.label.replace(/\s+/g, " ").trim().slice(0, 48);
            return short && short !== r.code
              ? `${i + 1}:${r.code}(${short})`
              : `${i + 1}:${r.code}`;
          })
          .join("; ");
  const note = packet.note ? ` note=${packet.note}` : "";
  const n = packet.visible.length;
  return [
    `[APP_CONTEXT] page=${packet.page}`,
    `entityType=${packet.entityType ?? "none"}`,
    `count=${n}`,
    `visible=[${vis}]${note}.`,
    `On-screen ordinals: "10th ${packet.entityType ?? "item"}" / "first" map to visible[N] codes — call search_entity with the spoken query; never invent IDs.`,
  ].join(" ");
}

/**
 * Resolve an ordinal against the published visible list when entity types match.
 * @returns Row or null if context does not apply.
 */
export function resolveVisibleOrdinal(
  ordinal: number,
  entityType: SearchEntityType
): VoiceVisibleRow | null {
  if (!current || current.entityType !== entityType) return null;
  const idx = ordinal - 1;
  if (idx < 0 || idx >= current.visible.length) return null;
  return current.visible[idx] ?? null;
}
