/**
 * scroll_page tool — scroll main content while explaining (no screen share).
 */
import { parseScrollDirection, voiceScrollMain } from "@/lib/voice/guide-ui";

export type ScrollPageArgs = {
  direction?: unknown;
};

export type ScrollPageResult = {
  ok: boolean;
  tool: "scroll_page";
  direction?: "up" | "down" | "top";
  reason?: string;
  instruction: string;
  actionLine: string;
};

/**
 * Scroll the main Release Desk content area.
 * @param args - direction: up | down | top (default down).
 */
export async function handleScrollPage(
  args: ScrollPageArgs
): Promise<ScrollPageResult> {
  const raw =
    typeof args.direction === "string" ? args.direction.trim().toLowerCase() : "down";

  let direction: "up" | "down" | "top";
  if (raw === "up" || raw === "down" || raw === "top") {
    direction = raw;
  } else {
    direction = parseScrollDirection(raw);
  }

  if (typeof window === "undefined") {
    return {
      ok: true,
      tool: "scroll_page",
      direction,
      instruction: `Scrolled ${direction}. Continue explaining what is on screen; call scroll_page again if more content is needed.`,
      actionLine: `Scroll ${direction}`,
    };
  }

  voiceScrollMain(direction);
  return {
    ok: true,
    tool: "scroll_page",
    direction,
    instruction: `Scrolled ${direction}. Continue the explanation; call scroll_page again for more, or navigate_to to open a detail row.`,
    actionLine:
      direction === "top"
        ? "Scrolled to top"
        : direction === "up"
          ? "Scrolled up"
          : "Scrolled down",
  };
}
