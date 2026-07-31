/**
 * Voice list-filter catalog — maps allowlisted list pages to URL filter schemas.
 * Filters are applied by updating the query string (same contract as the UI).
 */
import { RELEASE_FILTER_URL_MAP } from "@/lib/release-filters";
import {
  APPLICATIONS_FILTER_SCHEMA,
  APPLICATION_STATUS_FILTER_SCHEMA,
  APPROVALS_FILTER_SCHEMA,
  BLOCKERS_FILTER_SCHEMA,
  BOOKING_FILTER_SCHEMA,
  CONFLICTS_FILTER_SCHEMA,
  DEPARTMENTS_FILTER_SCHEMA,
  DEPENDENCIES_FILTER_SCHEMA,
  DRIFTS_FILTER_SCHEMA,
  ENVIRONMENTS_FILTER_SCHEMA,
  INCIDENTS_FILTER_SCHEMA,
  INTEGRATION_FLOWS_FILTER_SCHEMA,
  LEAVES_FILTER_SCHEMA,
  MONITORING_ALERTS_FILTER_SCHEMA,
  PLANNED_MAINTENANCE_FILTER_SCHEMA,
  REFERENCE_DATA_FILTER_SCHEMA,
  RISK_FACTORS_FILTER_SCHEMA,
  RISKS_FILTER_SCHEMA,
  SHARED_ENVIRONMENTS_FILTER_SCHEMA,
  USERS_FILTER_SCHEMA,
  type FilterFieldDef,
  type FilterSchema,
  type FilterValues,
  valuesFromSearchParams,
  valuesToSearchParams,
} from "@/lib/table-filters";
import { normalizeVoicePath } from "@/lib/voice/route-allowlist";
import { resolveVoiceNavTarget } from "@/lib/voice/sidebar-catalog";

/** Max length for a single filter value (security boundary). */
export const VOICE_FILTER_VALUE_MAX_LEN = 120;

/** Max filter keys per apply_list_filters call. */
export const VOICE_FILTER_KEYS_MAX = 20;

/** Releases / calendar share ReleaseFiltersContext URL params. */
const RELEASE_FAMILY_SCHEMA: FilterSchema = [
  ...RELEASE_FILTER_URL_MAP.map(({ key, param }) => ({ key, param })),
  { key: "sort", param: "sort" },
  { key: "sortDir", param: "dir" },
  { key: "period", param: "period" },
  { key: "anchor", param: "anchor" },
  { key: "tab", param: "tab" },
];

export type VoiceListFilterPage = {
  /** Canonical list pathname. */
  path: string;
  /** Human label for speech / action lines. */
  label: string;
  /** URL filter contract for this page. */
  schema: FilterSchema;
  /** Compact hint of common filter keys for the Live brief. */
  commonKeys: string[];
};

/**
 * Filterable list pages — keep in sync with table-filter schemas / release filters.
 */
export const VOICE_LIST_FILTER_PAGES: readonly VoiceListFilterPage[] = [
  {
    path: "/releases",
    label: "Releases",
    schema: RELEASE_FAMILY_SCHEMA,
    commonKeys: ["status", "priority", "impact", "dept", "app", "env", "conflict", "hasBlockers"],
  },
  {
    path: "/calendar",
    label: "Calendar",
    schema: RELEASE_FAMILY_SCHEMA,
    commonKeys: ["status", "priority", "dept", "app", "dateFrom", "dateTo", "eventType"],
  },
  {
    path: "/booking",
    label: "Env Booking",
    schema: BOOKING_FILTER_SCHEMA,
    commonKeys: ["dept", "app", "env", "conflict", "release", "releaseSize"],
  },
  {
    path: "/dependencies",
    label: "Dependencies",
    schema: DEPENDENCIES_FILTER_SCHEMA,
    commonKeys: ["status", "type", "dept", "app", "release"],
  },
  {
    path: "/conflicts",
    label: "Conflicts",
    schema: CONFLICTS_FILTER_SCHEMA,
    commonKeys: ["status", "priority", "dept", "app", "assignedTo", "conflictType", "release1"],
  },
  {
    path: "/blockers",
    label: "Blockers",
    schema: BLOCKERS_FILTER_SCHEMA,
    commonKeys: ["status", "severity", "type", "dept", "app", "assignedTo", "release"],
  },
  {
    path: "/approvals",
    label: "Approval Queue",
    schema: APPROVALS_FILTER_SCHEMA,
    commonKeys: ["decision", "type", "approver", "release"],
  },
  {
    path: "/leaves",
    label: "Leave Calendar",
    schema: LEAVES_FILTER_SCHEMA,
    commonKeys: ["type", "dept", "risk", "staff", "affectedRelease"],
  },
  {
    path: "/incidents",
    label: "Incidents",
    schema: INCIDENTS_FILTER_SCHEMA,
    commonKeys: ["severity", "status", "app", "env", "assignedTo", "title"],
  },
  {
    path: "/monitoring-alerts",
    label: "Monitoring Alerts",
    schema: MONITORING_ALERTS_FILTER_SCHEMA,
    commonKeys: ["severity", "status", "app", "env", "alertType", "assignedTo"],
  },
  {
    path: "/application-status",
    label: "Application Status",
    schema: APPLICATION_STATUS_FILTER_SCHEMA,
    commonKeys: ["status", "env", "app", "department"],
  },
  {
    path: "/planned-maintenance",
    label: "Planned Maintenance",
    schema: PLANNED_MAINTENANCE_FILTER_SCHEMA,
    commonKeys: ["type", "approvalStatus", "app", "env", "impact"],
  },
  {
    path: "/integration-flows",
    label: "Integration Flows",
    schema: INTEGRATION_FLOWS_FILTER_SCHEMA,
    commonKeys: ["type", "frequency", "source", "target"],
  },
  {
    path: "/system-mapping",
    label: "System Mapping",
    schema: SHARED_ENVIRONMENTS_FILTER_SCHEMA,
    commonKeys: ["environmentCodeQ", "environmentType", "conflictRisk"],
  },
  {
    path: "/risks",
    label: "Risk",
    schema: RISKS_FILTER_SCHEMA,
    commonKeys: ["status", "category", "likelihood", "impact", "band", "owner", "release"],
  },
  {
    path: "/drifts",
    label: "Drift Dashboard",
    schema: DRIFTS_FILTER_SCHEMA,
    commonKeys: ["driftType", "severity", "status", "app", "release", "env"],
  },
  {
    path: "/environments",
    label: "Versions & Config",
    schema: ENVIRONMENTS_FILTER_SCHEMA,
    commonKeys: ["app", "dept", "env", "status"],
  },
  {
    path: "/departments",
    label: "Departments",
    schema: DEPARTMENTS_FILTER_SCHEMA,
    commonKeys: ["q", "name", "head"],
  },
  {
    path: "/applications",
    label: "Applications",
    schema: APPLICATIONS_FILTER_SCHEMA,
    commonKeys: ["q", "dept", "criticality", "type", "name"],
  },
  {
    path: "/users",
    label: "Users",
    schema: USERS_FILTER_SCHEMA,
    commonKeys: ["q", "dept", "role", "access", "status", "name"],
  },
  {
    path: "/risk-factors",
    label: "Risk Factors",
    schema: RISK_FACTORS_FILTER_SCHEMA,
    commonKeys: ["q", "category", "active", "factorName"],
  },
  {
    path: "/admin/reference-data",
    label: "Reference Data",
    schema: REFERENCE_DATA_FILTER_SCHEMA,
    commonKeys: ["cat", "active", "value"],
  },
] as const;

const PAGE_BY_PATH = new Map(
  VOICE_LIST_FILTER_PAGES.map((p) => [p.path, p] as const)
);

/** Spoken / shorthand aliases → schema key or param. */
const FILTER_NAME_ALIASES: Record<string, string> = {
  department: "dept",
  dept: "dept",
  application: "app",
  app: "app",
  environment: "env",
  env: "env",
  severity: "severity",
  status: "status",
  priority: "priority",
  impact: "impact",
  type: "type",
  owner: "owner",
  assigned: "assignedTo",
  assignee: "assignedTo",
  assignedto: "assignedTo",
  release: "release",
  decision: "decision",
  category: "category",
  likelihood: "likelihood",
  band: "band",
  conflict: "conflict",
  hasblockers: "hasBlockers",
  blockers: "hasBlockers",
  q: "q",
  search: "q",
  name: "name",
  sort: "sort",
  sortdir: "dir",
  dir: "dir",
};

/**
 * Resolve a list page that supports voice filters.
 * Accepts sidebar names, list paths, or detail paths (maps to parent list).
 * @param raw - Page hint (optional when currentHref is provided).
 * @param currentHref - Browser href including query (fallback page).
 * @returns Page entry or null when the route has no filter schema.
 */
export function resolveVoiceFilterPage(
  raw: string | undefined,
  currentHref?: string
): VoiceListFilterPage | null {
  const candidates: string[] = [];
  if (raw?.trim()) {
    const spoken = resolveVoiceNavTarget(raw.trim());
    if (spoken?.path) candidates.push(spoken.path);
    candidates.push(raw.trim());
  }
  if (currentHref?.trim()) candidates.push(currentHref.trim());

  for (const c of candidates) {
    const pathname = normalizeVoicePath(c.split(/[?#]/)[0] ?? c);
    if (!pathname) continue;
    const page = findFilterPageForPathname(pathname);
    if (page) return page;
  }
  return null;
}

/**
 * Walk pathname and parents until a filterable list page is found.
 * @param pathname - Normalized pathname (no query).
 */
export function findFilterPageForPathname(
  pathname: string
): VoiceListFilterPage | null {
  const parts = pathname.split("/").filter(Boolean);
  for (let len = parts.length; len >= 1; len--) {
    const candidate = `/${parts.slice(0, len).join("/")}`;
    const hit = PAGE_BY_PATH.get(candidate);
    if (hit) return hit;
  }
  return null;
}

/**
 * Map a spoken/tool filter name to a schema field (key or URL param).
 * @param schema - Page filter schema.
 * @param name - Tool-provided filter name.
 */
export function resolveFilterField(
  schema: FilterSchema,
  name: string
): FilterFieldDef | null {
  const raw = name.trim();
  if (!raw) return null;
  const aliased = FILTER_NAME_ALIASES[raw.toLowerCase()] ?? raw;

  const byKey = schema.find(
    (f) => f.key === aliased || f.key.toLowerCase() === aliased.toLowerCase()
  );
  if (byKey) return byKey;

  const byParam = schema.find(
    (f) => f.param === aliased || f.param.toLowerCase() === aliased.toLowerCase()
  );
  return byParam ?? null;
}

/**
 * Sanitize a filter value at the voice boundary.
 * Empty string clears that filter. Rejects oversized / control-character values.
 * @param value - Raw tool value.
 * @returns Trimmed value, or null when invalid (caller should reject the key).
 */
export function sanitizeVoiceFilterValue(value: unknown): string | null {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > VOICE_FILTER_VALUE_MAX_LEN) return null;
  // Reject control chars / newlines that could break URL or logging.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

export type BuildVoiceFilterHrefInput = {
  page: VoiceListFilterPage;
  /** Current full href (pathname + search) for merge. */
  currentHref?: string;
  /** Filter map: key or param → value ("" clears). */
  filters?: Record<string, unknown>;
  /** Drop all schema-owned params, then apply filters. */
  clear?: boolean;
  /** When true with filters, replace schema params instead of merging. */
  replace?: boolean;
};

export type BuildVoiceFilterHrefResult =
  | {
      ok: true;
      href: string;
      applied: Record<string, string>;
      cleared: boolean;
      unknownKeys: string[];
    }
  | { ok: false; reason: string; unknownKeys?: string[] };

/**
 * Build a list href with allowlisted query params from voice filter args.
 * Only schema-owned params are written; other query keys are preserved unless clear/replace.
 * @param input - Page + filter args.
 */
export function buildVoiceFilterHref(
  input: BuildVoiceFilterHrefInput
): BuildVoiceFilterHrefResult {
  const { page, clear = false, replace = false } = input;
  const filtersIn = input.filters ?? {};
  const entries = Object.entries(filtersIn);

  if (entries.length > VOICE_FILTER_KEYS_MAX) {
    return {
      ok: false,
      reason: `Too many filters (max ${VOICE_FILTER_KEYS_MAX})`,
    };
  }

  let baseParams = new URLSearchParams();
  const currentPath = normalizeVoicePath(
    (input.currentHref ?? page.path).split(/[?#]/)[0] ?? page.path
  );
  if (input.currentHref?.includes("?")) {
    try {
      const q = input.currentHref.includes("://")
        ? new URL(input.currentHref).searchParams
        : new URL(input.currentHref, "http://voice.local").searchParams;
      baseParams = new URLSearchParams(q.toString());
    } catch {
      baseParams = new URLSearchParams();
    }
  }

  // When navigating from a detail page, start from a clean list query.
  const onThisList = currentPath === page.path;
  if (!onThisList) {
    baseParams = new URLSearchParams();
  }

  if (clear || replace) {
    for (const field of page.schema) {
      // Match useTableFilters.clearAll — clear keeps sort/dir unless replace.
      if (clear && !replace && (field.key === "sort" || field.key === "sortDir")) {
        continue;
      }
      baseParams.delete(field.param);
      if (field.key === "sortDir") baseParams.delete("sortDir");
    }
  }

  const currentValues: FilterValues = valuesFromSearchParams(
    baseParams,
    page.schema
  );
  const nextValues: FilterValues = { ...currentValues };
  const applied: Record<string, string> = {};
  const unknownKeys: string[] = [];

  for (const [name, rawVal] of entries) {
    const field = resolveFilterField(page.schema, name);
    if (!field) {
      unknownKeys.push(name);
      continue;
    }
    const sanitized = sanitizeVoiceFilterValue(rawVal);
    if (sanitized === null) {
      return {
        ok: false,
        reason: `Invalid value for filter "${name}"`,
        unknownKeys,
      };
    }
    nextValues[field.key] = sanitized;
    if (sanitized) applied[field.param] = sanitized;
    else applied[field.param] = "";
  }

  if (!clear && entries.length === 0) {
    return {
      ok: false,
      reason: "Provide filters and/or clear=true",
      unknownKeys,
    };
  }

  if (unknownKeys.length && entries.length && Object.keys(applied).length === 0 && !clear) {
    return {
      ok: false,
      reason: `Unknown filter keys: ${unknownKeys.join(", ")}. Use keys like: ${page.commonKeys.join(", ")}`,
      unknownKeys,
    };
  }

  const params = valuesToSearchParams(nextValues, page.schema, baseParams);
  const qs = params.toString();
  const href = qs ? `${page.path}?${qs}` : page.path;

  return {
    ok: true,
    href,
    applied,
    cleared: clear || replace,
    unknownKeys,
  };
}

/**
 * Compact Live brief so the model knows filters work on every list page.
 */
export function voiceListFiltersBrief(): string {
  const lines = VOICE_LIST_FILTER_PAGES.map(
    (p) => `${p.label} (${p.path}): ${p.commonKeys.join(", ")}`
  );
  return [
    "List filters (apply_list_filters — URL filters on every filterable list page):",
    "Omit page to filter the current list; or pass page=\"blockers\" / \"/risks\".",
    "clear=true removes filters but keeps sort/dir. replace=true replaces all filters with the new set.",
    "Sort with sort + dir (e.g. sort=conflictCode, dir=asc). Same as the UI sort button.",
    "Filter keys may be schema keys or URL params (status, severity, dept, app, type, sort, dir, …).",
    lines.join(" | "),
  ].join(" ");
}
