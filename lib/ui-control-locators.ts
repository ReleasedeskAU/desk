/**
 * Unique, stable hooks for test automation (id + data-test-id; name on fields).
 * Tokens are snake_case. HTML id must stay unique in the document.
 */

/**
 * Turn parts into one snake_case locator token.
 *
 * @param parts - Surface and control names (camelCase or free text OK).
 * @returns Token such as `release_edit_go_live_date`.
 */
export function locatorToken(...parts: string[]): string {
  return parts
    .map((part) =>
      part
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase()
    )
    .filter(Boolean)
    .join("_");
}

/**
 * Spread onto buttons and action links.
 *
 * @param token - Already-snake_case or raw; passed through locatorToken.
 */
export function controlLoc(token: string): { id: string; "data-test-id": string } {
  const id = locatorToken(token);
  return { id, "data-test-id": id };
}

/**
 * Spread onto inputs, selects, and textareas.
 *
 * @param token - Locator token.
 * @param name - Form `name`; defaults to the same token as `id`.
 */
export function fieldLoc(
  token: string,
  name?: string
): { id: string; name: string; "data-test-id": string } {
  const id = locatorToken(token);
  return { id, name: name ? locatorToken(name) : id, "data-test-id": id };
}
