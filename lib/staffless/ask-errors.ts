/**
 * User-facing Ask copy. Infrastructure failures use ASK_PUBLIC_UNAVAILABLE —
 * never raw exceptions, stack traces, or vendor internals.
 */

export const ASK_PUBLIC_UNAVAILABLE =
  "I couldn't complete that lookup just now. I can give exact counts and breakdowns from the index, list tickets matching a filter with their IDs, list values like assignees or statuses, look up a ticket by its key, or search indexed documents — try one of those.";

export const ASK_TOOL_FAILURE_HINT =
  "This lookup failed. Tell the user you could not complete that specific request. Offer exact counts, breakdowns by field, listing matching ticket IDs, listing values, looking up a ticket by key, or searching indexed documents. Do not guess numbers or invent tickets.";

export const ASK_NO_TOOL_HINT =
  "If no tool can answer the question, say clearly what they asked for that you cannot do, then offer the closest thing that is possible: exact counts, breakdowns by field, listing matching ticket IDs, listing values, looking up a ticket by key, or searching indexed content. Do not invent an answer.";
