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
  "Counts, ticket details, and summaries from work already synced in Connectors. Answers stay limited to what is indexed.";

export const ASK_EMPTY_HINT =
  "Need to sync first? Open Connectors. This is separate from the in-app assistant.";

export const ASK_LIMITED_INDEX_HINT =
  "No matching documents were found in the index. The answer is based only on what Connectors have already synced.";

export const ASK_SEARCHING_LABEL = "Looking up indexed work…";

export const ASK_COMPOSER_PLACEHOLDER = "Ask about a ticket, count, or breakdown…";

export const ASK_GROUNDING_SEARCH = "Based on search";

export const ASK_EXAMPLE_PROMPTS = [
  "How many tickets are in To Do?",
  "What is RD-3 about?",
  "Break down tickets by status",
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
- list_queryable_fields: which fields you may query (published schema, not raw DB columns).
- get_verified_count: exact unique document count; optional AND filters. Count, not IDs.
- get_breakdown_by_field: group-and-count by one field.
- list_distinct_values: stored values for one field. Use before filtering on status, type, dates, or parent.
- list_documents_matching: exact ticket list for AND filters, including keys. Children = parent=<key>. Subtasks = parent=<key> AND issuetype=Subtask.
- get_document_by_key: one ticket's allow-listed fields (parent, duedate, status, …). Never emails.
- search_indexed_documents: ranked sample for what/tell-me-about only. Never facts (counts, parent, children, due dates).

Rules:
- Call tools for facts. Do not guess counts, people, dates, or ticket ids.
- Map the user's words onto published fields and stored values. Do not hardcode phrasing. Names/labels may be a substring; key and parent are exact (RD-9 is not RD-90).
- Discover stored values before filtering closed fields (status, issuetype, dates). A 0 from a guessed spelling is not proof of absence — retry with a stored value.
- AND filters are one operation (issuetype + assignee + status). Date ranges (due this week) are not supported — say so, do not guess.
- Always say the stored values you used. If truncated, say showing first cap of count.
- If a field is not on the published list, say you cannot query it. Never invent a value.
- ${ASK_NO_TOOL_HINT}
- If a tool returns an error object, explain that this lookup failed. Never dump internals.
- Do not invent tickets, people, or releases. Do not name internal search engines.
- Keep answers concise. Use the numbers, keys, and fields the tools return.
- When showing one ticket from get_document_by_key, use a markdown table with columns Field and Value (one row per stored field). Do not rewrite the ticket as a paragraph.`;
