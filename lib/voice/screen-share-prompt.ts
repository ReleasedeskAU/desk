/**
 * Screen-share ask store — VoiceMic pulses the share CTA when explain intents fire.
 */
type SharePrompt = {
  active: boolean;
  reason: string;
  at: number;
};

type Listener = (prompt: SharePrompt) => void;

const IDLE: SharePrompt = { active: false, reason: "", at: 0 };
let current: SharePrompt = IDLE;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(current);
}

/**
 * Ask the UI to pulse “Enable screen share” (user must click — never auto-start).
 * @param reason - Short user-visible why (explain page / read table).
 */
export function requestVoiceScreenSharePrompt(reason: string): void {
  current = {
    active: true,
    reason: reason.trim() || "Enable screen share so I can see this page",
    at: Date.now(),
  };
  emit();
}

/** Clear the share CTA pulse (after enable or dismiss). */
export function clearVoiceScreenSharePrompt(): void {
  current = IDLE;
  emit();
}

/** Subscribe to share-prompt pulses. */
export function subscribeVoiceScreenSharePrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function getVoiceScreenSharePrompt(): SharePrompt {
  return current;
}

/**
 * True when the user wants an on-screen explanation (ask share; don’t dump app data).
 * Broader than capture-only heuristics — includes “explain this page/table”.
 * @param raw - User utterance.
 */
export function isExplainPageQuery(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(explain|describe|walk\s*me\s*through|tell me about)\b.*\b(this |the )?(page|screen|table|dashboard|view)\b/.test(
      t
    ) ||
    /\bwhat('?s| is)\b.*\b(on (this |the )?(page|screen|table)|showing|visible)\b/.test(t) ||
    /\b(read|summarize)\b.*\b(this |the )?(page|screen|table|dashboard)\b/.test(t) ||
    /\b(can you |could you )?(see|look at|read)\b.*\b(my |the |this )?(screen|page|table)\b/.test(
      t
    ) ||
    /^(what am i looking at|what'?s on (this|the) (page|screen|table))\b/.test(t)
  );
}
