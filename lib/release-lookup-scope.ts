/**
 * Which /api/release-lookups slices a page actually needs.
 * Default (no include) stays full so voice and older callers keep working.
 */

export type ReleaseLookupInclude = {
  directories: boolean;
  bookings: boolean;
  releases: boolean;
  calendar: boolean;
};

const ALL_INCLUDE: ReleaseLookupInclude = {
  directories: true,
  bookings: true,
  releases: true,
  calendar: true,
};

const NONE_INCLUDE: ReleaseLookupInclude = {
  directories: false,
  bookings: false,
  releases: false,
  calendar: false,
};

const MAX_INCLUDE_PARAM_LENGTH = 120;

const INCLUDE_TOKENS = new Set([
  "directories",
  "bookings",
  "releases",
  "calendar",
  "calendarevents",
  "all",
]);

/**
 * Parse `include` query (comma-separated). Missing/blank = full payload.
 * Oversized or empty-after-filter values fail closed to no extra queries.
 * @param raw - Request `include` query value.
 */
export function parseLookupInclude(raw: string | null | undefined): ReleaseLookupInclude {
  if (raw == null) return { ...ALL_INCLUDE };
  const trimmed = raw.trim();
  if (!trimmed) return { ...ALL_INCLUDE };
  if (trimmed.length > MAX_INCLUDE_PARAM_LENGTH) return { ...NONE_INCLUDE };

  const tokens = trimmed
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && INCLUDE_TOKENS.has(part));

  if (tokens.length === 0) return { ...NONE_INCLUDE };
  if (tokens.includes("all")) return { ...ALL_INCLUDE };

  return {
    directories: tokens.includes("directories"),
    bookings: tokens.includes("bookings"),
    releases: tokens.includes("releases"),
    calendar: tokens.includes("calendar") || tokens.includes("calendarevents"),
  };
}

function pathOnly(pathname: string): string {
  const noQuery = pathname.split("?")[0] ?? "/";
  if (noQuery.length > 1 && noQuery.endsWith("/")) return noQuery.slice(0, -1);
  return noQuery || "/";
}

/**
 * Include list for the shell lookup fetch, or null to skip (dashboard, settings, detail pages).
 * @param pathname - Current app path (query string ignored).
 */
export function lookupIncludeQueryForPath(pathname: string): string | null {
  const path = pathOnly(pathname);
  if (path === "/calendar") return "directories,bookings,releases,calendar";
  if (path === "/releases") return "directories,bookings,releases";
  if (path === "/inbox") return "directories";
  return null;
}
