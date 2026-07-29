/**
 * explain_page tool — release-manager briefing for the current or named page.
 * No screen share required (structured catalog, not OCR).
 */
import {
  formatPageExplainSpeech,
  resolveVoicePageExplain,
  voicePageExplainBrief,
} from "@/lib/voice/page-explain-catalog";
import type { NavigateDeps } from "@/lib/voice/handlers/navigate";

export type ExplainPageArgs = {
  page?: unknown;
};

export type ExplainPageResult = {
  ok: boolean;
  tool: "explain_page";
  path?: string;
  title?: string;
  explanation?: string;
  reason?: string;
  instruction: string;
  actionLine: string;
};

/**
 * Explain what the current (or named) page is for and what voice can do.
 * @param args - Optional page path/name.
 * @param deps - Optional getCurrentHref for default page.
 */
export async function handleExplainPage(
  args: ExplainPageArgs,
  deps: NavigateDeps
): Promise<ExplainPageResult> {
  const pageHint = typeof args.page === "string" ? args.page.trim() : undefined;
  const currentHref =
    deps.getCurrentHref?.() ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);

  const page = resolveVoicePageExplain(pageHint, currentHref);
  if (!page) {
    return {
      ok: false,
      tool: "explain_page",
      reason: "Unknown page — open a sidebar tab or pass page=releases|blockers|…",
      instruction: voicePageExplainBrief(),
      actionLine: "Explain failed — unknown page",
    };
  }

  const activeQuery = currentHref?.includes("?")
    ? currentHref.slice(currentHref.indexOf("?"))
    : undefined;
  const onThisPage =
    currentHref != null &&
    (currentHref.split(/[?#]/)[0] === page.path ||
      currentHref.startsWith(`${page.path}/`) ||
      currentHref.startsWith(`${page.path}?`));

  const explanation = formatPageExplainSpeech(page, {
    activeQuery: onThisPage ? activeQuery : undefined,
  });

  return {
    ok: true,
    tool: "explain_page",
    path: page.path,
    title: page.title,
    explanation,
    instruction:
      "Speak the explanation field naturally as a release manager. Offer to run_walkthrough or get_summary on a release if useful. Do not invent page features.",
    actionLine: `Explained ${page.title}`,
  };
}
