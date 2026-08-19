/**
 * Sign-off queue is a read projection of Release checklist fields.
 * There is no SignOff table — writes stay on PATCH /api/releases/[id].
 */
import type { SignoffLifecycleConfig, SignoffReleaseField, SignoffTypeConfig } from "@/lib/signoff-lifecycle-config";
import { isSignoffReleaseField } from "@/lib/signoff-lifecycle-transition";

const ROW_ID_SEPARATOR = "--";

/** Prisma `select` for the Sign-offs queue projection. */
export const SIGNOFF_RELEASE_LIST_SELECT = {
  id: true,
  releaseCode: true,
  name: true,
  status: true,
  owner: true,
  department: { select: { name: true } },
  releaseOwner: { select: { name: true, userId: true } },
  applications: { select: { application: { select: { name: true } } } },
  devSignoff: true,
  testSignoff: true,
  uatSignoff: true,
  securityClearance: true,
  businessSignoff: true,
  opsSignoff: true,
  dressRehearsal: true,
  trainingStatus: true,
  supportBriefed: true,
} as const;

export type SignoffListRow = {
  id: string;
  signoffCode: string;
  releaseId: string;
  releaseCode: string;
  releaseName: string;
  releaseStatus: string;
  department: string;
  application: string;
  owner: string;
  typeKey: string;
  typeLabel: string;
  releaseField: SignoffReleaseField;
  mandatory: boolean;
  status: string;
};

export type SignoffSourceRelease = {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
  owner?: string | null;
  department?: { name?: string | null } | null;
  releaseOwner?: { name?: string | null; userId?: string | null } | null;
  applications?: { application: { name: string } }[];
} & Partial<Record<SignoffReleaseField, string | null | undefined>>;

export type SignoffListFilters = {
  status?: string;
  type?: string;
  required?: string;
  release?: string;
  releaseName?: string;
  signoffCode?: string;
  application?: string;
  department?: string;
  owner?: string;
};

/**
 * Stable row id for /signoffs/[id] (release UUID + checklist field).
 */
export function encodeSignoffRowId(releaseId: string, field: SignoffReleaseField): string {
  return `${releaseId}${ROW_ID_SEPARATOR}${field}`;
}

/**
 * Parse a composite sign-off row id.
 * @returns null when the id is not `{releaseId}--{releaseField}`.
 */
export function parseSignoffRowId(raw: string): { releaseId: string; field: SignoffReleaseField } | null {
  const idx = raw.lastIndexOf(ROW_ID_SEPARATOR);
  if (idx <= 0) return null;
  const releaseId = raw.slice(0, idx).trim();
  const field = raw.slice(idx + ROW_ID_SEPARATOR.length).trim();
  if (!releaseId || !isSignoffReleaseField(field)) return null;
  return { releaseId, field };
}

/**
 * Display code such as REL-0001-DEV (not stored — derived from release + type key).
 */
export function signoffCodeFor(releaseCode: string, typeKey: string): string {
  return `${releaseCode}-${typeKey.replace(/_/g, "-").toUpperCase()}`;
}

/**
 * Parse a display code back to release code + type key (longest type suffix wins).
 */
export function parseSignoffCode(
  code: string,
  typeKeys: readonly string[]
): { releaseCode: string; typeKey: string } | null {
  const raw = code.trim();
  if (!raw) return null;
  const suffixes = typeKeys
    .map((key) => ({ key, suffix: key.replace(/_/g, "-").toUpperCase() }))
    .sort((a, b) => b.suffix.length - a.suffix.length);
  const upper = raw.toUpperCase();
  for (const item of suffixes) {
    const tail = `-${item.suffix}`;
    if (!upper.endsWith(tail)) continue;
    const releaseCode = raw.slice(0, raw.length - tail.length).trim();
    if (releaseCode) return { releaseCode, typeKey: item.key };
  }
  return null;
}

function enabledTypes(config: SignoffLifecycleConfig): SignoffTypeConfig[] {
  return config.types
    .filter((type) => type.enabled && type.releaseField)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function ownerLabel(release: SignoffSourceRelease): string {
  if (release.releaseOwner?.name) {
    return release.releaseOwner.userId
      ? `${release.releaseOwner.userId} (${release.releaseOwner.name})`
      : release.releaseOwner.name;
  }
  return release.owner?.trim() || "—";
}

function applicationLabel(release: SignoffSourceRelease): string {
  const names = (release.applications ?? []).map((item) => item.application.name).filter(Boolean);
  return names.join(", ") || "—";
}

/**
 * One queue row for an enabled type on a release.
 */
export function buildSignoffRow(
  release: SignoffSourceRelease,
  type: SignoffTypeConfig
): SignoffListRow | null {
  if (!type.releaseField) return null;
  const raw = release[type.releaseField];
  const status = typeof raw === "string" && raw.trim() ? raw.trim() : "Pending";
  return {
    id: encodeSignoffRowId(release.id, type.releaseField),
    signoffCode: signoffCodeFor(release.releaseCode, type.key),
    releaseId: release.id,
    releaseCode: release.releaseCode,
    releaseName: release.name,
    releaseStatus: release.status,
    department: release.department?.name?.trim() || "—",
    application: applicationLabel(release),
    owner: ownerLabel(release),
    typeKey: type.key,
    typeLabel: type.label,
    releaseField: type.releaseField,
    mandatory: Boolean(type.mandatory),
    status,
  };
}

/**
 * Flatten enabled Sign-off Lifecycle types across releases (no extra table).
 */
export function flattenReleaseSignoffs(
  releases: SignoffSourceRelease[],
  config: SignoffLifecycleConfig
): SignoffListRow[] {
  const types = enabledTypes(config);
  const rows: SignoffListRow[] = [];
  for (const release of releases) {
    for (const type of types) {
      const row = buildSignoffRow(release, type);
      if (row) rows.push(row);
    }
  }
  return rows;
}

function includesCI(hay: string, needle?: string): boolean {
  const q = needle?.trim();
  if (!q) return true;
  return hay.toLocaleLowerCase().includes(q.toLocaleLowerCase());
}

/**
 * Apply Sign-offs list query filters (case-insensitive contains / exact required).
 */
export function filterSignoffRows(rows: SignoffListRow[], filters: SignoffListFilters): SignoffListRow[] {
  const required = filters.required?.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (filters.status && row.status.toLocaleLowerCase() !== filters.status.trim().toLocaleLowerCase()) {
      return false;
    }
    if (filters.type) {
      const typeQ = filters.type.trim().toLocaleLowerCase();
      const hit =
        row.typeLabel.toLocaleLowerCase() === typeQ ||
        row.typeKey.toLocaleLowerCase() === typeQ ||
        row.typeLabel.toLocaleLowerCase().includes(typeQ);
      if (!hit) return false;
    }
    if (required === "required" && !row.mandatory) return false;
    if (required === "optional" && row.mandatory) return false;
    if (!includesCI(row.releaseCode, filters.release)) return false;
    if (!includesCI(row.releaseName, filters.releaseName)) return false;
    if (!includesCI(row.signoffCode, filters.signoffCode)) return false;
    if (!includesCI(row.application, filters.application)) return false;
    if (!includesCI(row.department, filters.department)) return false;
    if (!includesCI(row.owner, filters.owner)) return false;
    return true;
  });
}
