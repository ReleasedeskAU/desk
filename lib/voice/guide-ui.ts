/**
 * In-app assistant guide — pointer/highlight over real DOM targets.
 * Pure helpers + tiny store; React overlay subscribes for paint.
 * Does not control the OS mouse (browsers forbid that).
 */

/** Dwell on the highlighted tab before navigating (visible but not sluggish). */
export const VOICE_GUIDE_HIGHLIGHT_MS = 700;

/** Brief beat with status chip before pointer moves. */
export const VOICE_GUIDE_STATUS_MS = 180;

/** Pointer travels from mic area toward the target. */
export const VOICE_GUIDE_POINTER_TRAVEL_MS = 280;

/** Hard cap so a stuck rAF/highlight never blocks the real route change. */
export const VOICE_GUIDE_MAX_MS = 1_600;

export type VoiceGuideRing = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type VoiceGuideState = {
  /** Short status the user can read (“Opening Releases…”). */
  status: string | null;
  /** Assistant pointer tip (viewport coords). */
  pointer: { x: number; y: number } | null;
  /** Highlight ring around the target. */
  ring: VoiceGuideRing | null;
  /** When true, overlay is shown. */
  active: boolean;
};

type GuideListener = (state: VoiceGuideState) => void;

const IDLE: VoiceGuideState = {
  status: null,
  pointer: null,
  ring: null,
  active: false,
};

let state: VoiceGuideState = IDLE;
const listeners = new Set<GuideListener>();
/** Optional: expand collapsed sidebar so nav labels/targets are hittable. */
let ensureSidebarWide: (() => void) | null = null;
let activeDomEl: Element | null = null;

function emit(): void {
  for (const l of listeners) l(state);
}

function setState(next: VoiceGuideState): void {
  state = next;
  emit();
}

/**
 * Register a callback that widens the sidebar (hover-peek / pin) before guide.
 * @param fn - Expand helper from SidebarProvider consumers.
 * @returns Unregister.
 */
export function registerVoiceGuideSidebarExpand(fn: () => void): () => void {
  ensureSidebarWide = fn;
  return () => {
    if (ensureSidebarWide === fn) ensureSidebarWide = null;
  };
}

/**
 * Subscribe to guide overlay updates.
 * @returns Unsubscribe.
 */
export function subscribeVoiceGuide(listener: GuideListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/** Latest guide state (tests / non-React callers). */
export function getVoiceGuideState(): VoiceGuideState {
  return state;
}

/**
 * Whether the user prefers reduced motion (skip pointer path animation).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Sidebar list href for a detail path (/releases/REL-0001 → /releases).
 * @param href - Full allowlisted path.
 */
export function voiceGuideListHref(href: string): string {
  const path = href.trim().split("?")[0] ?? href;
  if (!path.startsWith("/")) return path;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return path.endsWith("/") ? path.slice(0, -1) || "/" : path;
  return `/${parts[0]}`;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Find a sidebar nav target tagged with data-voice-nav.
 * @param href - List or detail href.
 */
export function resolveVoiceNavElement(href: string): Element | null {
  if (typeof document === "undefined") return null;
  const list = voiceGuideListHref(href);
  return (
    document.querySelector(`[data-voice-nav="${cssEscape(href)}"]`) ??
    document.querySelector(`[data-voice-nav="${cssEscape(list)}"]`)
  );
}

/**
 * Find a table/list row tagged with data-voice-row (business code).
 * @param code - e.g. BLK-0010.
 */
export function resolveVoiceRowElement(code: string): Element | null {
  if (typeof document === "undefined" || !code.trim()) return null;
  return document.querySelector(`[data-voice-row="${cssEscape(code.trim())}"]`);
}

function ringFromElement(el: Element): VoiceGuideRing {
  const r = el.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    w: Math.max(r.width, 8),
    h: Math.max(r.height, 8),
  };
}

function markDomTarget(el: Element | null): void {
  if (activeDomEl && activeDomEl !== el) {
    activeDomEl.removeAttribute("data-voice-guide-active");
  }
  activeDomEl = el;
  if (el) el.setAttribute("data-voice-guide-active", "1");
}

/**
 * Show status chip only (no pointer).
 * @param text - User-visible status, or null to clear status text.
 */
export function setVoiceGuideStatus(text: string | null): void {
  if (!text) {
    if (!state.pointer && !state.ring) {
      setState(IDLE);
      return;
    }
    setState({ ...state, status: null });
    return;
  }
  setState({
    ...state,
    status: text,
    active: true,
  });
}

/** Clear pointer, ring, and status. */
export function clearVoiceGuide(): void {
  markDomTarget(null);
  setState(IDLE);
}

/**
 * Point at an element and highlight it (does not navigate).
 * @param el - Target DOM node.
 * @param status - Optional status chip.
 */
export function highlightVoiceTarget(el: Element, status?: string): void {
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  } catch {
    /* ignore */
  }
  markDomTarget(el);
  const ring = ringFromElement(el);
  // Tip of the OS-style cursor sits near the visual click point.
  setState({
    status: status ?? state.status,
    pointer: {
      x: ring.x + Math.min(22, ring.w * 0.35),
      y: ring.y + Math.min(18, ring.h * 0.4),
    },
    ring,
    active: true,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function micOrigin(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: Math.max(24, window.innerWidth - 72),
    y: Math.max(24, window.innerHeight - 140),
  };
}

async function waitTwoFrames(): Promise<void> {
  if (typeof window === "undefined") return;
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/** Bumps when a newer guided nav starts — older runs must not push. */
let guideEpoch = 0;

/**
 * Highlight sidebar, then always push the route.
 * Latest call wins (older in-flight guides are cancelled before they push).
 * Navigation is guaranteed even if highlight/rAF fails or times out.
 * @param href - Allowlisted path to open.
 * @param push - Router push.
 * @param opts - Display label and optional row code to highlight after land.
 */
export async function guidedNavigateTo(
  href: string,
  push: (href: string) => void,
  opts?: { label?: string; rowCode?: string }
): Promise<void> {
  const epoch = ++guideEpoch;
  const label = opts?.label?.trim() || href;
  const reduced = prefersReducedMotion();
  let pushed = false;

  const doPush = () => {
    if (epoch !== guideEpoch || pushed) return;
    pushed = true;
    try {
      push(href);
    } catch {
      /* push failures are non-fatal for guide teardown */
    }
  };

  try {
    setVoiceGuideStatus(`Opening ${label}…`);

    await Promise.race([
      (async () => {
        await sleep(reduced ? 60 : VOICE_GUIDE_STATUS_MS);
        if (epoch !== guideEpoch) return;

        try {
          ensureSidebarWide?.();
        } catch {
          /* ignore */
        }
        await waitTwoFrames();
        if (epoch !== guideEpoch) return;
        if (!reduced) await sleep(120);

        const navEl = resolveVoiceNavElement(href);
        if (navEl && epoch === guideEpoch) {
          if (!reduced) {
            setState({
              status: `Opening ${label}…`,
              pointer: micOrigin(),
              ring: null,
              active: true,
            });
            await sleep(VOICE_GUIDE_POINTER_TRAVEL_MS * 0.4);
          }
          if (epoch !== guideEpoch) return;
          highlightVoiceTarget(navEl, `Opening ${label}…`);
          await sleep(reduced ? 120 : VOICE_GUIDE_HIGHLIGHT_MS);
        } else if (epoch === guideEpoch) {
          await sleep(reduced ? 80 : 280);
        }
      })(),
      sleep(reduced ? 400 : VOICE_GUIDE_MAX_MS),
    ]);
  } finally {
    // Always navigate for the latest request — highlight must never block routing.
    doPush();
  }

  if (epoch !== guideEpoch) return;

  // Soft land (non-blocking for the tool await — keep short).
  await sleep(reduced ? 40 : 160);
  if (epoch !== guideEpoch) return;

  if (typeof document !== "undefined") {
    const main = document.querySelector("main.materio-main");
    if (main instanceof HTMLElement) {
      try {
        main.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      } catch {
        /* ignore */
      }
    }
    if (opts?.rowCode) {
      await sleep(reduced ? 40 : 200);
      if (epoch !== guideEpoch) return;
      const row = resolveVoiceRowElement(opts.rowCode);
      if (row) {
        highlightVoiceTarget(row, `Opening ${opts.rowCode}…`);
        await sleep(reduced ? 80 : 450);
      }
    }
  }

  if (epoch === guideEpoch) clearVoiceGuide();
}

/** Extract business code from a detail path when present (/blockers/BLK-0001). */
export function voiceRowCodeFromPath(href: string): string | null {
  const path = href.trim().split("?")[0] ?? "";
  const seg = path.split("/").filter(Boolean).pop();
  if (!seg) return null;
  if (/^[A-Z]{2,4}-\d{3,}$/i.test(seg)) return seg.toUpperCase();
  return null;
}

/**
 * Soft page scroll without screen share (DOM scroll, not OCR).
 * @param direction - up / down / top.
 */
export function voiceScrollMain(
  direction: "up" | "down" | "top" = "down"
): void {
  if (typeof document === "undefined") return;
  const main = document.querySelector("main.materio-main");
  const el =
    main instanceof HTMLElement
      ? main
      : document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : null;
  if (!el) return;
  const delta = Math.round(
    typeof window !== "undefined" ? window.innerHeight * 0.7 : 400
  );
  try {
    if (direction === "top") {
      el.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    el.scrollBy({
      top: direction === "up" ? -delta : delta,
      behavior: "smooth",
    });
  } catch {
    /* ignore */
  }
}

/**
 * True when the user wants the page scrolled (no screen share required).
 * @param raw - User utterance.
 */
export function isScrollPageQuery(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  return (
    /\bscroll\b/.test(t) ||
    /\b(page|go)\s+down\b/.test(t) ||
    /\b(page|go)\s+up\b/.test(t) ||
    /\b(top of (the )?page|bottom of (the )?page)\b/.test(t)
  );
}

/**
 * Parse scroll direction from speech.
 * @param raw - User utterance.
 */
export function parseScrollDirection(raw: string): "up" | "down" | "top" {
  const t = raw.trim().toLowerCase();
  if (/\btop\b/.test(t)) return "top";
  if (/\bup\b/.test(t)) return "up";
  return "down";
}
