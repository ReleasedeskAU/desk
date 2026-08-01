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
    // Landing on a new page resets instantly (no slow reading scroll here);
    // reset both scrollports since the page can be offset even when a table owns scroll.
    try {
      cancelVoiceScroll();
      const port = resolveVoiceScrollTarget("top");
      if (port) port.scrollTop = 0;
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      }
    } catch {
      /* ignore */
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

export type VoiceScrollDirection = "up" | "down" | "top" | "bottom";

/**
 * Whether an element can scroll vertically (overflow + content taller than box).
 * Pure helper for tests — pass computed overflowY from the DOM in production.
 * @param scrollHeight - Element scrollHeight.
 * @param clientHeight - Element clientHeight.
 * @param overflowY - Computed overflow-y.
 */
export function elementCanScrollY(
  scrollHeight: number,
  clientHeight: number,
  overflowY: string
): boolean {
  const oy = overflowY.trim().toLowerCase();
  const allows =
    oy === "auto" || oy === "scroll" || oy === "overlay" || oy === "hidden";
  // `hidden` still scrolls programmatically; skip visible/clip (not a scrollport).
  return allows && scrollHeight > clientHeight + 1;
}

/**
 * Whether a scrollport still has room to move in the requested direction.
 * Lets a maxed-out inner table hand the gesture back to the page.
 * @param scrollTop - Current scroll offset.
 * @param scrollHeight - Content height.
 * @param clientHeight - Viewport height of the scrollport.
 * @param direction - Requested direction.
 */
export function canScrollFurther(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  direction: VoiceScrollDirection
): boolean {
  const max = scrollHeight - clientHeight;
  if (max <= 1) return false;
  if (direction === "up") return scrollTop > 1;
  if (direction === "top") return scrollTop > 1;
  return scrollTop < max - 1;
}

/** Scrollports the voice agent always prefers when present (page-sized by design). */
const VOICE_PRIMARY_SCROLLPORTS = "[data-voice-scroll], .data-table-body";
/** Generic scrollports — only used when they are big enough to be the page's content. */
const VOICE_GENERIC_SCROLLPORTS =
  '.overflow-y-auto, .overflow-auto, [class*="overflow-y-auto"], [class*="overflow-auto"]';

/**
 * Whether a nested scrollport is large enough to be what the user means by "the page".
 * Small cards (a 10rem activity list) must not swallow a page scroll.
 * @param clientHeight - Scrollport height.
 * @param viewportHeight - Window height.
 */
export function isMajorScrollport(
  clientHeight: number,
  viewportHeight: number
): boolean {
  if (viewportHeight <= 0) return clientHeight >= 240;
  return clientHeight >= Math.max(240, viewportHeight * 0.5);
}

function isScrollableNow(el: HTMLElement): boolean {
  const overflowY =
    typeof window !== "undefined"
      ? window.getComputedStyle(el).overflowY
      : "auto";
  return elementCanScrollY(el.scrollHeight, el.clientHeight, overflowY);
}

/**
 * Ordered scroll candidates for the current page.
 * Open dialog scrollports first, then in-page scrollports, then the document —
 * so every route has a working target, not just data tables.
 */
function voiceScrollCandidates(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const viewport = typeof window !== "undefined" ? window.innerHeight : 0;
  const out: HTMLElement[] = [];
  const push = (el: Element | null, requireMajor = false) => {
    if (!(el instanceof HTMLElement) || out.includes(el)) return;
    if (requireMajor && !isMajorScrollport(el.clientHeight, viewport)) return;
    if (isScrollableNow(el)) out.push(el);
  };

  // An open modal owns the gesture while it is visible.
  const dialog = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
  if (dialog instanceof HTMLElement) {
    push(dialog);
    dialog
      .querySelectorAll(`${VOICE_PRIMARY_SCROLLPORTS}, ${VOICE_GENERIC_SCROLLPORTS}`)
      .forEach((el) => push(el));
  }

  const main = document.querySelector("main.materio-main");
  if (main instanceof HTMLElement) {
    main.querySelectorAll(VOICE_PRIMARY_SCROLLPORTS).forEach((el) => push(el));
    main
      .querySelectorAll(VOICE_GENERIC_SCROLLPORTS)
      .forEach((el) => push(el, true));
    push(main);
  }

  // Any route where the shell itself scrolls (dashboard, detail pages, settings…).
  const doc = document.scrollingElement ?? document.documentElement;
  if (doc instanceof HTMLElement) out.push(doc);
  return out;
}

/**
 * Resolve the node that should scroll for this direction.
 * Falls through exhausted inner scrollports so the page keeps moving.
 * @param direction - Requested direction.
 * @returns Scroll target, or null if DOM unavailable.
 */
export function resolveVoiceScrollTarget(
  direction: VoiceScrollDirection = "down"
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const candidates = voiceScrollCandidates();
  if (!candidates.length) return null;

  for (const el of candidates) {
    if (canScrollFurther(el.scrollTop, el.scrollHeight, el.clientHeight, direction)) {
      return el;
    }
  }
  // Nothing can move further — return the page so the call is still a no-op, not an error.
  return candidates[candidates.length - 1] ?? null;
}

/** Reading pace in px/s — a person skimming, not a jump-cut. */
const VOICE_SCROLL_SPEED_PX_PER_SEC = 420;
const VOICE_SCROLL_MIN_MS = 550;
const VOICE_SCROLL_MAX_MS = 4000;

/**
 * How long a voice scroll of this distance should take to feel hand-driven.
 * @param distancePx - Signed or absolute pixels to travel.
 */
export function voiceScrollDurationMs(distancePx: number): number {
  const d = Math.abs(distancePx);
  if (d < 2) return 0;
  const raw = (d / VOICE_SCROLL_SPEED_PX_PER_SEC) * 1000;
  return Math.round(
    Math.min(VOICE_SCROLL_MAX_MS, Math.max(VOICE_SCROLL_MIN_MS, raw))
  );
}

/** Ease-in-out so the scroll starts and settles gently instead of snapping. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let voiceScrollFrame: number | null = null;
let voiceScrollAbort: (() => void) | null = null;

/** Stop any in-flight voice scroll (new command, or the user grabbed the page). */
export function cancelVoiceScroll(): void {
  if (voiceScrollFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(voiceScrollFrame);
  }
  voiceScrollFrame = null;
  voiceScrollAbort?.();
  voiceScrollAbort = null;
}

/**
 * Animate a scrollport to an absolute offset at reading pace.
 * Uses rAF rather than `behavior: "smooth"`, which is a fixed ~300ms snap.
 */
function animateVoiceScroll(
  el: HTMLElement,
  isDocumentScroll: boolean,
  to: number
): void {
  cancelVoiceScroll();

  const read = (): number =>
    isDocumentScroll && typeof window !== "undefined"
      ? (window.scrollY ?? el.scrollTop)
      : el.scrollTop;
  const write = (top: number) => {
    if (isDocumentScroll && typeof window !== "undefined") {
      window.scrollTo(window.scrollX ?? 0, top);
    } else {
      el.scrollTop = top;
    }
  };

  const from = read();
  const distance = to - from;
  const duration = voiceScrollDurationMs(distance);
  if (duration === 0 || typeof requestAnimationFrame !== "function") {
    write(to);
    return;
  }

  // A human interrupting beats the agent — drop the animation on real input.
  const stop = () => cancelVoiceScroll();
  const events: (keyof WindowEventMap)[] = [
    "wheel",
    "touchstart",
    "pointerdown",
    "keydown",
  ];
  if (typeof window !== "undefined") {
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    voiceScrollAbort = () =>
      events.forEach((e) => window.removeEventListener(e, stop));
  }

  const start =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const step = (now: number) => {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    write(from + distance * easeInOutCubic(t));
    if (t < 1) {
      voiceScrollFrame = requestAnimationFrame(step);
      return;
    }
    voiceScrollFrame = null;
    voiceScrollAbort?.();
    voiceScrollAbort = null;
  };
  voiceScrollFrame = requestAnimationFrame(step);
}

/**
 * Soft page scroll without screen share (DOM scroll, not OCR).
 * Works on every route: modal → in-page scrollport → document.
 * Moves at a human reading pace so the user can follow along while the agent talks.
 * @param direction - up / down / top / bottom.
 */
export function voiceScrollMain(direction: VoiceScrollDirection = "down"): void {
  if (typeof document === "undefined") return;
  const el = resolveVoiceScrollTarget(direction);
  if (!el) return;

  const viewport =
    typeof window !== "undefined" && window.innerHeight > 0
      ? window.innerHeight
      : el.clientHeight || 600;
  // Leave a couple of lines of overlap so the user keeps their place.
  const step = Math.round(Math.max(220, viewport * 0.7));
  const isDocumentScroll =
    el === document.documentElement ||
    el === document.body ||
    el === document.scrollingElement;
  const current =
    isDocumentScroll && typeof window !== "undefined"
      ? (window.scrollY ?? el.scrollTop)
      : el.scrollTop;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);

  let to: number;
  if (direction === "top") to = 0;
  else if (direction === "bottom") to = max;
  else to = current + (direction === "up" ? -step : step);
  to = Math.min(max, Math.max(0, to));

  try {
    if (prefersReducedMotion()) {
      cancelVoiceScroll();
      if (isDocumentScroll && typeof window !== "undefined") {
        window.scrollTo(window.scrollX ?? 0, to);
      } else {
        el.scrollTop = to;
      }
      return;
    }
    animateVoiceScroll(el, isDocumentScroll, to);
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
    /\b(top|bottom|end) of (the )?page\b/.test(t) ||
    /\ball the way (down|up)\b/.test(t)
  );
}

/**
 * Parse scroll direction from speech.
 * @param raw - User utterance.
 */
export function parseScrollDirection(raw: string): VoiceScrollDirection {
  const t = raw.trim().toLowerCase();
  if (/\btop\b/.test(t)) return "top";
  if (/\b(bottom|end of (the )?page|all the way down)\b/.test(t)) return "bottom";
  if (/\bup\b/.test(t)) return "up";
  return "down";
}
