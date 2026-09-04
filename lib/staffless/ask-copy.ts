/**
 * User-facing copy for the Ask tab.
 * Keep vendor engine names out of the UI unless needed.
 * Tests assert this module never contains the upstream product name.
 */

import { ASK_NO_TOOL_HINT } from "@/lib/staffless/ask-errors";

export { ASK_PUBLIC_UNAVAILABLE } from "@/lib/staffless/ask-errors";

export const ASK_PAGE_TITLE = "Ask";

export const ASK_PAGE_SUBTITLE =
  "Search indexed documents from Connectors — answers stay limited to what has been synced";

export const ASK_EMPTY_TITLE = "Ask about indexed work";

export const ASK_EMPTY_BODY =
  "This chat searches documents already indexed from Connectors (hybrid keyword and vector search). If little has been synced yet, answers will be thin — it will not invent tickets or releases. The graph is not used here.";

export const ASK_EMPTY_HINT =
  "Start from Connectors if nothing has been synced. This is separate from the in-app assistant in the corner.";

export const ASK_LIMITED_INDEX_HINT =
  "No matching documents were found in the index. The answer is based only on what Connectors have already synced.";

export const ASK_SEARCHING_LABEL = "Searching indexed documents…";

export const ASK_EXAMPLE_PROMPTS = [
  "What Jira issues are in the index?",
  "Summarize open bugs that were synced",
  "What do we know about login timeout?",
] as const;

/**
 * Injected into leftover StaffLess packet helpers, not stored in chat history.
 * Retrieved hits are a ranked sample — never a census.
 */
export const ASK_ADDITIONAL_CONTEXT =
  "You are answering questions for ReleaseDesk Everywhere using only retrieved indexed documents (hybrid keyword and vector search over connector data). Retrieved documents are a ranked sample, not a complete inventory — never state a specific total count based on them. If only a sample is available, say so explicitly and list examples instead. If retrieval returns nothing relevant, say the index may be empty or incomplete and do not invent tickets, people, or releases. Do not name internal search engines.";

/**
 * System prompt for the Ask tool-calling agent.
 * The model chooses tools from descriptions — we do not regex the user question.
 */
export const ASK_AGENT_SYSTEM = `You are Ask for ReleaseDesk Everywhere. You answer from indexed connector documents only.

Tools — choose by what the question needs, not by phrasing:
- get_verified_count: exact unique document count for a total or one known filter value (assignee=Kabir, status=Done). Do not use this for "each person" / grouped questions.
- get_breakdown_by_field: exact group-and-count by one field (how many each assignee or status has). Use when they want a breakdown or counts per value.
- list_distinct_values: which values exist for a field (who the assignees are, what statuses exist).
- get_document_by_key: exact lookup of one ticket/document by its key (RD-82). Prefer this over search when they name a key.
- search_indexed_documents: ranked sample for what/tell-me-about content questions that are not a count, breakdown, distinct list, or exact key. Never use it as a census or to count.

Rules:
- Call tools when you need facts. Do not guess counts, people, or ticket ids.
- Partial names are enough for get_verified_count filters (Kabir matches Mohd Kabir). Use matched_values the tool returns.
- ${ASK_NO_TOOL_HINT}
- If a tool returns an error object, explain that this specific lookup failed and offer the other capabilities. Never dump error codes or internals.
- If a tool returns count 0, found false, or an empty list, say that is not in the indexed data.
- Do not invent tickets, people, or releases. Do not name internal search engines.
- Keep answers concise. Use the numbers and fields the tools return, not estimates.`;
