/**
 * Voice catalog for Manage Columns / Manage Filters / sort presets.
 * Maps list paths → pageKey + field registries (same keys as the UI pickers).
 */
import {
  BLOCKER_COLUMNS,
  BLOCKER_DEFAULT_HIDDEN_COLUMN_KEYS,
  BLOCKER_DEFAULT_HIDDEN_FILTER_KEYS,
  BLOCKER_FILTER_FIELDS,
  BOOKING_COLUMNS,
  BOOKING_DEFAULT_HIDDEN_COLUMN_KEYS,
  BOOKING_DEFAULT_HIDDEN_FILTER_KEYS,
  BOOKING_FILTER_FIELDS,
  CONFLICT_COLUMNS,
  CONFLICT_DEFAULT_HIDDEN_COLUMN_KEYS,
  CONFLICT_DEFAULT_HIDDEN_FILTER_KEYS,
  CONFLICT_FILTER_FIELDS,
  DEPENDENCY_COLUMNS,
  DEPENDENCY_DEFAULT_HIDDEN_COLUMN_KEYS,
  DEPENDENCY_DEFAULT_HIDDEN_FILTER_KEYS,
  DEPENDENCY_FILTER_FIELDS,
  DRIFT_COLUMNS,
  DRIFT_DEFAULT_HIDDEN_COLUMN_KEYS,
  DRIFT_DEFAULT_HIDDEN_FILTER_KEYS,
  DRIFT_FILTER_FIELDS,
  INCIDENT_COLUMNS,
  INCIDENT_DEFAULT_HIDDEN_COLUMN_KEYS,
  INCIDENT_DEFAULT_HIDDEN_FILTER_KEYS,
  INCIDENT_FILTER_FIELDS,
  MONITORING_ALERT_COLUMNS,
  MONITORING_ALERT_DEFAULT_HIDDEN_COLUMN_KEYS,
  MONITORING_ALERTS_DEFAULT_HIDDEN_FILTER_KEYS,
  MONITORING_ALERTS_FILTER_FIELDS,
  RELEASE_COLUMNS,
  RELEASE_DEFAULT_HIDDEN_COLUMN_KEYS,
  RELEASE_DEFAULT_HIDDEN_FILTER_KEYS,
  RELEASE_FILTER_FIELDS,
  RISK_COLUMNS,
  RISK_DEFAULT_HIDDEN_COLUMN_KEYS,
  RISK_DEFAULT_HIDDEN_FILTER_KEYS,
  RISK_FILTER_FIELDS,
  APPROVAL_COLUMNS,
  APPROVAL_DEFAULT_HIDDEN_COLUMN_KEYS,
  APPROVALS_DEFAULT_HIDDEN_FILTER_KEYS,
  APPROVALS_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import type { ColumnDef, FilterFieldDef } from "@/lib/table-column-types";
import {
  BLOCKER_SORT_PRESETS,
  BOOKING_SORT_PRESETS,
  CONFLICT_SORT_PRESETS,
  DEPENDENCY_SORT_PRESETS,
  DRIFT_SORT_PRESETS,
  INCIDENT_SORT_PRESETS,
  ALERT_SORT_PRESETS,
  RELEASE_TABLE_SORT_PRESETS,
  RISK_SORT_PRESETS,
  APPROVAL_SORT_PRESETS,
  type TableSortPreset,
} from "@/lib/table-sort-presets";
import { normalizeVoicePath } from "@/lib/voice/route-allowlist";
import { resolveVoiceNavTarget } from "@/lib/voice/sidebar-catalog";

export type VoiceTableViewPage = {
  path: string;
  pageKey: string;
  label: string;
  columns: ColumnDef[];
  filterFields: FilterFieldDef[];
  lockedColumnKeys: string[];
  defaultHiddenColumns: string[];
  defaultHiddenFilters: string[];
  sortPresets: TableSortPreset[];
};

const PAGES: readonly VoiceTableViewPage[] = [
  {
    path: "/conflicts",
    pageKey: "conflicts",
    label: "Conflicts",
    columns: CONFLICT_COLUMNS,
    filterFields: CONFLICT_FILTER_FIELDS,
    lockedColumnKeys: ["conflictCode"],
    defaultHiddenColumns: CONFLICT_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: CONFLICT_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: CONFLICT_SORT_PRESETS,
  },
  {
    path: "/blockers",
    pageKey: "blockers",
    label: "Blockers",
    columns: BLOCKER_COLUMNS,
    filterFields: BLOCKER_FILTER_FIELDS,
    lockedColumnKeys: ["blockerCode"],
    defaultHiddenColumns: BLOCKER_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: BLOCKER_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: BLOCKER_SORT_PRESETS,
  },
  {
    path: "/releases",
    pageKey: "releases",
    label: "Releases",
    columns: RELEASE_COLUMNS,
    filterFields: RELEASE_FILTER_FIELDS,
    lockedColumnKeys: ["releaseCode"],
    defaultHiddenColumns: RELEASE_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: RELEASE_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: RELEASE_TABLE_SORT_PRESETS,
  },
  {
    path: "/booking",
    pageKey: "env-booking",
    label: "Env Booking",
    columns: BOOKING_COLUMNS,
    filterFields: BOOKING_FILTER_FIELDS,
    lockedColumnKeys: ["bookingCode"],
    defaultHiddenColumns: BOOKING_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: BOOKING_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: BOOKING_SORT_PRESETS,
  },
  {
    path: "/dependencies",
    pageKey: "dependencies",
    label: "Dependencies",
    columns: DEPENDENCY_COLUMNS,
    filterFields: DEPENDENCY_FILTER_FIELDS,
    lockedColumnKeys: ["depCode"],
    defaultHiddenColumns: DEPENDENCY_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: DEPENDENCY_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: DEPENDENCY_SORT_PRESETS,
  },
  {
    path: "/risks",
    pageKey: "risks",
    label: "Risk",
    columns: RISK_COLUMNS,
    filterFields: RISK_FILTER_FIELDS,
    lockedColumnKeys: ["riskCode"],
    defaultHiddenColumns: RISK_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: RISK_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: RISK_SORT_PRESETS,
  },
  {
    path: "/drifts",
    pageKey: "drifts",
    label: "Drift Dashboard",
    columns: DRIFT_COLUMNS,
    filterFields: DRIFT_FILTER_FIELDS,
    lockedColumnKeys: ["driftCode"],
    defaultHiddenColumns: DRIFT_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: DRIFT_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: DRIFT_SORT_PRESETS,
  },
  {
    path: "/approvals",
    pageKey: "approvals",
    label: "Approval Queue",
    columns: APPROVAL_COLUMNS,
    filterFields: APPROVALS_FILTER_FIELDS,
    lockedColumnKeys: ["approvalCode"],
    defaultHiddenColumns: APPROVAL_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: APPROVALS_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: APPROVAL_SORT_PRESETS,
  },
  {
    path: "/incidents",
    pageKey: "incidents",
    label: "Incidents",
    columns: INCIDENT_COLUMNS,
    filterFields: INCIDENT_FILTER_FIELDS,
    lockedColumnKeys: ["incidentCode"],
    defaultHiddenColumns: INCIDENT_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: INCIDENT_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: INCIDENT_SORT_PRESETS,
  },
  {
    path: "/monitoring-alerts",
    pageKey: "monitoring-alerts",
    label: "Monitoring Alerts",
    columns: MONITORING_ALERT_COLUMNS,
    filterFields: MONITORING_ALERTS_FILTER_FIELDS,
    lockedColumnKeys: ["alertCode"],
    defaultHiddenColumns: MONITORING_ALERT_DEFAULT_HIDDEN_COLUMN_KEYS,
    defaultHiddenFilters: MONITORING_ALERTS_DEFAULT_HIDDEN_FILTER_KEYS,
    sortPresets: ALERT_SORT_PRESETS,
  },
];

const BY_PATH = new Map(PAGES.map((p) => [p.path, p] as const));

/**
 * Resolve a table-view page from a path hint or current href.
 */
export function resolveVoiceTableViewPage(
  raw?: string,
  currentHref?: string
): VoiceTableViewPage | null {
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
    const parts = pathname.split("/").filter(Boolean);
    for (let len = parts.length; len >= 1; len--) {
      const candidate = `/${parts.slice(0, len).join("/")}`;
      const hit = BY_PATH.get(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Match a spoken column/filter name to a registry key (key or label).
 */
export function matchTableFieldKey(
  fields: Array<{ key: string; label: string }>,
  spoken: string
): string | null {
  const q = spoken.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!q) return null;
  const exactKey = fields.find((f) => f.key.toLowerCase() === q.replace(/\s+/g, ""));
  if (exactKey) return exactKey.key;
  const byKey = fields.find((f) => f.key.toLowerCase() === q);
  if (byKey) return byKey.key;
  const byLabel = fields.find((f) => f.label.toLowerCase() === q);
  if (byLabel) return byLabel.key;
  const includes = fields.filter(
    (f) =>
      f.label.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q.replace(/\s+/g, ""))
  );
  if (includes.length === 1) return includes[0]!.key;
  return null;
}

/**
 * Compact Live brief for table view tools.
 */
export function voiceTableViewBrief(): string {
  return [
    "configure_table_view: show/hide Manage Columns and Manage Filters fields (same as the UI pickers). Actions: show_columns, hide_columns, show_all_columns, show_filters, hide_filters, show_all_filters, list.",
    "Sort with apply_list_filters using sort + dir (e.g. sort=conflictCode, dir=asc).",
    "scroll_page: scroll the current page (up/down/top/bottom) while explaining — works on any page, no screen share needed.",
    "Open a row with navigate_to using search_entity.path (e.g. /conflicts/CNF-0001).",
  ].join(" ");
}
