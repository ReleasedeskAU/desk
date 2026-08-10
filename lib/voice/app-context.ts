/**
 * Route-scoped visible-row context for voice.
 * List pages publish the rows the user currently sees; the Live client pushes
 * [APP_CONTEXT] alongside spoken queries, and search_entity prefers this order
 * for on-page ordinals.
 *
 * `totalCount` is the real filtered table length on the page.
 * `visible` is a speech/nav sample (capped) — never use visible.length as the count.
 */
import type { SearchEntityType } from "@/lib/search-entity-types";

/** Max sample rows published for speech / ordinals (not the page total). */
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
  /** Sample rows in display order (capped). */
  visible: VoiceVisibleRow[];
  /**
   * True filtered/on-page row count from the UI table.
   * Always prefer this over visible.length for “how many?” answers.
   */
  totalCount: number;
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

export type VoiceAppContextInput = {
  page: string;
  entityType: SearchEntityType | null;
  visible: VoiceVisibleRow[];
  /** Defaults to visible.length when omitted. */
  totalCount?: number;
  note?: string;
};

/**
 * Publish visible rows for the active list page (or clear with null).
 * @param packet - Context or null when leaving the page.
 */
export function setVoiceAppContext(packet: VoiceAppContextInput | null): void {
  if (!packet) {
    current = null;
  } else {
    const total =
      typeof packet.totalCount === "number" && Number.isFinite(packet.totalCount)
        ? Math.max(0, Math.floor(packet.totalCount))
        : packet.visible.length;
    current = {
      page: packet.page,
      entityType: packet.entityType,
      visible: packet.visible.slice(0, VOICE_APP_CONTEXT_MAX_ROWS),
      totalCount: total,
      note: packet.note,
      updatedAt: Date.now(),
    };
  }
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
  const sampleN = packet.visible.length;
  const total = packet.totalCount;
  const sampleNote =
    total > sampleN
      ? ` sample=${sampleN} of ${total}`
      : ` sample=${sampleN}`;
  return [
    `[APP_CONTEXT] page=${packet.page}`,
    `entityType=${packet.entityType ?? "none"}`,
    `totalCount=${total}`,
    `${sampleNote}`,
    `visible=[${vis}]${note}.`,
    `When asked how many, answer totalCount=${total} (not the sample size).`,
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
