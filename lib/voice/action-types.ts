/**
 * Voice write actions — propose → confirm only.
 * Each type maps to an existing Zod-validated PATCH route.
 */

export const VOICE_WRITE_ACTION_TYPES = [
  "set_approval_decision",
  "acknowledge_alert",
  "update_blocker",
  "update_conflict",
] as const;

export type VoiceWriteActionType = (typeof VOICE_WRITE_ACTION_TYPES)[number];

/**
 * Whether a string is an allowed voice write actionType.
 * @param value - Candidate actionType from the model.
 */
export function isVoiceWriteActionType(value: string): value is VoiceWriteActionType {
  return (VOICE_WRITE_ACTION_TYPES as readonly string[]).includes(value);
}

/** Human list for error / tool docs. */
export function voiceWriteActionTypesList(): string {
  return VOICE_WRITE_ACTION_TYPES.join(", ");
}
