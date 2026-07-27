/**
 * Silent in-app viewport capture for Gemini Live video frames.
 * Uses DOM→JPEG (html-to-image) — no getDisplayMedia, so no Chrome share
 * picker and no yellow “Sharing this tab” browser strip.
 *
 * Kept intentionally light (main content only, low pixelRatio) — full-page
 * 1fps capture freezes the mic UI on busy tables.
 */
"use client";

import { toJpeg } from "html-to-image";

const CAPTURE_EXCLUDE =
  '[data-voice-mic], [data-chat-panel], [data-testid="voice-mic"]';

/**
 * Capture the main app content as a JPEG data-URL (base64 with prefix).
 * @param maxWidth - Downscale width for payload size.
 * @returns data:image/jpeg;base64,... or null on failure.
 */
export async function captureAppViewportDataUrl(
  maxWidth = 720
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  // Prefer main only — sidebar + full shell is too expensive on booking tables.
  const target =
    (document.querySelector("main.materio-main") as HTMLElement | null) ??
    (document.querySelector("main") as HTMLElement | null) ??
    (document.body as HTMLElement);

  const width = Math.max(320, Math.min(target.clientWidth || window.innerWidth, maxWidth));
  const pixelRatio = Math.min(0.55, width / Math.max(1, target.clientWidth || window.innerWidth));

  try {
    const dataUrl = await toJpeg(target, {
      quality: 0.55,
      pixelRatio,
      cacheBust: false,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.closest(CAPTURE_EXCLUDE)) return false;
        if (node.dataset?.voiceMic != null) return false;
        // Skip heavy table bodies beyond a shallow snapshot budget via class hints.
        if (node.getAttribute("aria-hidden") === "true") return false;
        return true;
      },
    });
    return dataUrl?.startsWith("data:image/jpeg") ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * Strip the data-URL prefix to raw base64 for Live realtimeInput.video.
 * @param dataUrl - JPEG data URL from captureAppViewportDataUrl.
 */
export function dataUrlToRawBase64(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  return dataUrl.slice(comma + 1);
}
