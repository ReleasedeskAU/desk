/**
 * StaffLess chat session helpers for the Ask tab.
 */

import { StafflessApiError, stafflessFetch } from "@/lib/staffless/client";
import { STAFFLESS_CREATE_SESSION_PATH } from "@/lib/staffless/ask-packets";

/**
 * Create a StaffLess chat session so later turns keep conversation context.
 * @returns chat_session_id UUID.
 * @throws StafflessApiError when the id is missing.
 */
export async function createAskSession(): Promise<string> {
  const body = await stafflessFetch<{ chat_session_id?: string }>(
    STAFFLESS_CREATE_SESSION_PATH,
    { json: { persona_id: 0, description: "Release Desk Ask" } }
  );
  const id = body?.chat_session_id;
  if (typeof id !== "string" || !id) {
    throw new StafflessApiError(502, "StaffLess AI is unavailable");
  }
  return id;
}
