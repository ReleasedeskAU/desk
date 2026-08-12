/**
 * Planning-entry and date-order rules for Release create/update (§1-02, §1-03, VR-01).
 *
 * These are API boundary checks — separate from lifecycle gate evaluation, so direct
 * API callers cannot bypass the Release form's client-side required fields.
 */

/**
 * §1-02 / §1-03 — reject create (or Planning entry) when name or applications are missing.
 *
 * @param args.name - Proposed release name
 * @param args.applicationIds - Linked application ids (create body)
 * @returns User-facing error message, or null when valid
 */
export function validateReleaseNameAndApplications(args: {
  name: unknown;
  applicationIds: unknown;
}): string | null {
  const name =
    typeof args.name === "string" ? args.name.trim() : String(args.name ?? "").trim();
  if (!name) {
    return "Release name is required.";
  }
  const ids = Array.isArray(args.applicationIds)
    ? args.applicationIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  if (ids.length === 0) {
    return "Select at least one application.";
  }
  return null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * VR-01 — End Date (`releaseDate`) cannot be before Start Date.
 * Missing either side is allowed (ordering only applies when both are set).
 *
 * @param args.startDate - Release start date
 * @param args.endDate - Release end / go-live date (`releaseDate`)
 * @returns User-facing error message, or null when valid
 */
export function validateReleaseDateOrder(args: {
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
}): string | null {
  const start = toTime(args.startDate);
  const end = toTime(args.endDate);
  if (start == null || end == null) return null;
  if (end < start) {
    return "End Date cannot be before Start Date.";
  }
  return null;
}

/**
 * True when release size is Large (or XL / L shorthand) for VR-26 dress-rehearsal warning.
 *
 * @param releaseSize - Release.size value from DB/UI
 */
export function isLargeReleaseSize(
  releaseSize: string | null | undefined
): boolean {
  if (releaseSize == null) return false;
  const normalized = releaseSize.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "l" ||
    normalized === "xl" ||
    normalized === "large" ||
    normalized.startsWith("large")
  );
}
