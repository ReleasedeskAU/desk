/**
 * Response-header channel for user-facing notices after a successful write
 * (e.g. VR-21 status revert). Keeps the JSON body as the entity row.
 */

export const UX_NOTICE_HEADER = "X-ReleaseDesk-Ux-Notice";

export type UxNotice = {
  title: string;
  message: string;
  details?: string[];
};

/**
 * Encode notices for an HTTP response header (URI-encoded JSON).
 */
export function encodeUxNoticeHeader(notices: UxNotice[]): string {
  return encodeURIComponent(JSON.stringify(notices));
}

/**
 * Parse notices from a fetch Response / Headers object.
 */
export function parseUxNoticesFromHeaders(
  headers: Headers | null | undefined
): UxNotice[] {
  if (!headers) return [];
  const raw = headers.get(UX_NOTICE_HEADER);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is UxNotice =>
        !!n &&
        typeof n === "object" &&
        typeof (n as UxNotice).title === "string" &&
        typeof (n as UxNotice).message === "string"
    );
  } catch {
    return [];
  }
}
