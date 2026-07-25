/**
 * Phase-3 voice write actions — frozen short list (exactly two).
 * record_release_decision is deferred until its route has Zod.
 */

export const VOICE_WRITE_ACTION_TYPES = [
  "set_approval_decision",
  "acknowledge_alert",
] as const;

export type VoiceWriteActionType = (typeof VOICE_WRITE_ACTION_TYPES)[number];

/**
 * Whether a string is an allowed voice write actionType.
 * @param value - Candidate actionType from the model.
 */
export function isVoiceWriteActionType(value: string): value is VoiceWriteActionType {
  return (VOICE_WRITE_ACTION_TYPES as readonly string[]).includes(value);
}
