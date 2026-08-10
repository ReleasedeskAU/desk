/**
 * scroll_page tool — scroll main content while explaining (no screen share).
 */
import {
  parseScrollDirection,
  voiceScrollMain,
  type VoiceScrollDirection,
} from "@/lib/voice/guide-ui";

export type ScrollPageArgs = {
  direction?: unknown;
};

export type ScrollPageResult = {
  ok: boolean;
  tool: "scroll_page";
  direction?: VoiceScrollDirection;
  reason?: string;
  instruction: string;
  actionLine: string;
};

/**
 * Scroll the current Release Desk page (any route, not just tables).
 * @param args - direction: up | down | top | bottom (default down).
 */
export async function handleScrollPage(
  args: ScrollPageArgs
): Promise<ScrollPageResult> {
  const raw =
    typeof args.direction === "string" ? args.direction.trim().toLowerCase() : "down";

  let direction: VoiceScrollDirection;
  if (raw === "up" || raw === "down" || raw === "top" || raw === "bottom") {
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
        : direction === "bottom"
          ? "Scrolled to bottom"
          : direction === "up"
            ? "Scrolled up"
            : "Scrolled down",
  };
}
