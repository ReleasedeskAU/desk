/**
 * get_page_context — read what the current page/table is showing (APP_CONTEXT).
 */
import type { NavigateDeps } from "@/lib/voice/handlers/navigate";
import {
  buildVoicePageSnapshot,
  formatPageContextSpeechInstruction,
  voicePageContextBrief,
} from "@/lib/voice/page-context-agent";

export type GetPageContextArgs = {
  /** Reserved for future detail; ignored today. */
  includeFilters?: unknown;
};

export type GetPageContextResult = {
  ok: boolean;
  tool: "get_page_context";
  page?: string;
  href?: string;
  entityType?: string | null;
  note?: string;
  count?: number;
  rows?: Array<{ index: number; code: string; label: string; path: string }>;
  query?: string;
  reason?: string;
  instruction: string;
  actionLine: string;
};

/**
 * Return the latest on-screen list rows (codes + names) for the active page.
 * @param _args - Unused (tool has no required args).
 * @param deps - Optional getCurrentHref for tests.
 */
export async function handleGetPageContext(
  _args: GetPageContextArgs,
  deps?: NavigateDeps
): Promise<GetPageContextResult> {
  const href =
    deps?.getCurrentHref?.() ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);

  const snap = buildVoicePageSnapshot(href);

  if (!snap.updatedAt && snap.count === 0 && !snap.page.startsWith("/")) {
    return {
      ok: false,
      tool: "get_page_context",
      reason: "No page context published yet — open a list page first",
      instruction: voicePageContextBrief(),
      actionLine: "Page context unavailable",
    };
  }

  return {
    ok: true,
    tool: "get_page_context",
    page: snap.page,
    href: snap.href,
    entityType: snap.entityType,
    note: snap.note,
    count: snap.count,
    rows: snap.rows,
    query: snap.query || undefined,
    instruction: formatPageContextSpeechInstruction(snap),
    actionLine:
      snap.count === 0
        ? `Page context: 0 rows on ${snap.page}`
        : `Page context: ${snap.count} row(s) on ${snap.page}`,
  };
}
