/**
 * Opt-in tab screen-share helpers for Gemini Live.
 * Frame RATE (≤1 fps / on-demand) and MEDIA_RESOLUTION (HIGH for OCR) are separate knobs.
 *
 * Token costs (docs): video LOW/MEDIUM = 70 tokens/frame; HIGH = 280 tokens/frame.
 * A+V sessions without compression ≈ 2 minutes — see VOICE_AV_* constants.
 */

/** Official Live max send rate for video frames. */
export const VOICE_SCREEN_MAX_FPS = 1;

/** Min gap between frames (enforce ≤1 fps). */
export const VOICE_SCREEN_MIN_FRAME_GAP_MS = 1_000;

/** While share is on, refresh a silent video frame every 4s (≤1 fps; no text — text would trigger spoken turns). */
export const VOICE_SCREEN_IDLE_FRAME_MS = 4_000;

/**
 * Session-level media resolution for text-heavy Release Desk screens.
 * Docs: for video, LOW===MEDIUM (70); HIGH = 280 — required for dense OCR.
 */
export const VOICE_SCREEN_MEDIA_RESOLUTION = "MEDIA_RESOLUTION_HIGH" as const;

/** Hard Live limit for audio+video without context-window compression (~2 min). */
export const VOICE_AV_SESSION_LIMIT_MS = 2 * 60 * 1000;

/**
 * Proactive remint/resume before the hard A+V cut so reconnect is planned,
 * not a surprise drop (Phase 4 failure mode).
 */
export const VOICE_AV_PROACTIVE_RECONNECT_MS = 100 * 1000;

/** Max pixel width when encoding a tab frame — wider than 768 so table IDs stay readable. */
export const VOICE_SCREEN_CAPTURE_MAX_WIDTH = 1280;

/** JPEG quality for tab frames (clarity for OCR of REL-#### / status badges). */
export const VOICE_SCREEN_JPEG_QUALITY = 0.92;

/**
 * Whether spoken/typed text is asking about the visible screen (on-demand capture).
 * @param raw - User utterance.
 */
export function isScreenRelatedQuery(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(can|could|do|are)\b.*\byou\b.*\b(see|view|look at|read)\b/.test(t) ||
    /\b(see|seeing|view|look at)\b.*\b(my |the )?(screen|page|display|monitor)\b/.test(
      t
    ) ||
    /\b(what('?s| is| am i)|whats)\b.*\b(looking at|on (this |the )?screen|on (this |the )?page|seeing)\b/.test(
      t
    ) ||
    /\b(summarize|describe|read|explain)\b.*\b(this |the )?(page|screen|table|dashboard)\b/.test(
      t
    ) ||
    /\bwhat('?s| is)\b.*\bwrong with (this |the )?(page|screen)\b/.test(t) ||
    /\b(look at|see|visible on)\b.*\b(screen|page)\b/.test(t) ||
    /\bon[- ]screen\b/.test(t) ||
    /^(what am i looking at|what'?s on (this|the) (page|screen))\b/.test(t)
  );
}

/**
 * Explicit spoken write intent — required before propose/confirm when screen share is on.
 * Screen OCR text alone must never authorize writes.
 * @param raw - User utterance.
 */
export function utteranceHasWriteIntent(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(approve|reject|acknowledge|confirm|deny|accept|cancel)\b/.test(t) ||
    /\b(yes|no|yeah|yep|nope)\b/.test(t) ||
    /\b(set|change|update)\b.*\b(approval|status|decision)\b/.test(t) ||
    /\bpropose\b/.test(t)
  );
}

/**
 * Capture one JPEG frame from a display MediaStream (tab share).
 * @param stream - getDisplayMedia video track stream.
 * @returns Raw base64 JPEG (no data-URL prefix), or null.
 */
export async function captureTabFrameBase64(
  stream: MediaStream
): Promise<string | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== "live") return null;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    return null;
  }

  // Wait briefly for dimensions.
  await new Promise<void>((r) => {
    if (video.videoWidth > 0) {
      r();
      return;
    }
    video.onloadeddata = () => r();
    setTimeout(r, 400);
  });

  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (vw < 2 || vh < 2) {
    video.srcObject = null;
    return null;
  }

  const scale = Math.min(1, VOICE_SCREEN_CAPTURE_MAX_WIDTH / vw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(vw * scale));
  canvas.height = Math.max(1, Math.floor(vh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    video.srcObject = null;
    return null;
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.srcObject = null;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", VOICE_SCREEN_JPEG_QUALITY)
  );
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Native Chrome/Edge getDisplayMedia picker — Entire Screen, Window, and Tab.
 * Note: browsers always show a “Sharing …” banner while a display track is live;
 * web apps cannot hide that chrome.
 */
export function displayMediaPickerOptions(): DisplayMediaStreamOptions {
  return {
    video: {
      frameRate: { ideal: VOICE_SCREEN_MAX_FPS, max: VOICE_SCREEN_MAX_FPS },
      width: { ideal: VOICE_SCREEN_CAPTURE_MAX_WIDTH },
    },
    audio: false,
  };
}

/** @deprecated Use displayMediaPickerOptions — kept as alias for older imports. */
export function tabPreferDisplayMediaOptions(): DisplayMediaStreamOptions {
  return displayMediaPickerOptions();
}
