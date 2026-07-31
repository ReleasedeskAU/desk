/**
 * Previous list-filter URL stack for voice undo_filters.
 * Client-only; remembers the href before each apply_list_filters navigation.
 */

const MAX_STACK = 8;
const stack: string[] = [];

/**
 * Remember the current list href before applying new filters.
 * @param href - Full pathname + query before the filter change.
 */
export function pushVoiceFilterHistory(href: string): void {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/")) return;
  const top = stack[stack.length - 1];
  if (top === trimmed) return;
  stack.push(trimmed);
  if (stack.length > MAX_STACK) stack.shift();
}

/**
 * Pop the previous filter href (for undo).
 * @returns Previous href or null when empty.
 */
export function popVoiceFilterHistory(): string | null {
  return stack.pop() ?? null;
}

/**
 * Peek without popping (tests / diagnostics).
 */
export function peekVoiceFilterHistory(): string | null {
  return stack[stack.length - 1] ?? null;
}

/**
 * Clear history (session stop / tests).
 */
export function clearVoiceFilterHistory(): void {
  stack.length = 0;
}
