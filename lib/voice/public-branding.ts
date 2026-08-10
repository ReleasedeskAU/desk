/**
 * Keep Release Desk Voice vendor-neutral in anything the end user can see or hear.
 * Internal comments / server logs may still name the Live provider.
 */

/** Spoken / UI product name — never a third-party model brand. */
export const VOICE_PRODUCT_NAME = "Release Desk Voice";

/**
 * Strip or rewrite provider/billing wording so Voice Log and spoken errors
 * stay Release Desk–branded.
 * @param message - Raw error or status text (may contain vendor phrases).
 * @returns Safe copy for transcripts / UI.
 */
export function sanitizeVoicePublicMessage(message: string): string {
  const raw = message.trim();
  if (!raw) return "Voice connection failed";

  if (/prepayment|credits?\s+are\s+depleted|billing|ai\.studio\/projects/i.test(raw)) {
    return "Voice is temporarily unavailable — try again later or contact your Release Desk admin";
  }
  if (/GEMINI_API_KEY|not configured/i.test(raw)) {
    return "Voice is not configured on this server";
  }
  if (/generativelanguage\.googleapis|auth_tokens\//i.test(raw)) {
    return "Voice connection failed — try again shortly";
  }

  // Drop leftover vendor names from otherwise useful messages.
  return raw
    .replace(/\bGemini(\s+Live)?\b/gi, "voice")
    .replace(/\bGoogle(\s+AI)?\b/gi, "the service")
    .replace(/\bOpenAI\b/gi, "the service")
    .replace(/\bAnthropic\b/gi, "the service");
}
