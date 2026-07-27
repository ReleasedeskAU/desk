/**
 * Ordered entity lists for voice ordinals ("first release", "first booking").
 * Prefer DB rows sorted by business code (REL-0001, CNF-0001, …) so ordinals
 * match human expectations, not raw API insertion order.
 */
import { releases, type SearchResult } from "@/lib/dummy-data";
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";
import { seedBookingsOrdered, seedRisksOrdered } from "@/lib/search-seed-catalog";
import type { VoiceEntityKind } from "@/lib/voice/spoken-query";

function demoReleaseResults(): SearchResult[] {
  return releases.map((r) => ({
    id: `rel-${r.id}`,
    type: "release" as const,
    label: `${r.version} — ${r.name}`,
    sublabel: `${r.team} · ${r.status}`,
    href: `/releases/${r.id}`,
  }));
}

/**
 * Sort key for business codes — PREFIX-0001 before PREFIX-0002; non-coded ids last.
 * @param a - Code or id string.
 * @param b - Code or id string.
 */
export function compareBusinessCode(a: string, b: string): number {
  const parse = (s: string) => {
    const m = s.trim().match(/^([A-Za-z]+)[_-]?(\d+)$/);
    if (!m) return null;
    return { prefix: m[1]!.toUpperCase(), n: Number(m[2]) };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa && pb) {
    if (pa.prefix === pb.prefix) return pa.n - pb.n;
    return pa.prefix.localeCompare(pb.prefix);
  }
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b);
}

/** @deprecated Use compareBusinessCode — kept for existing release tests. */
export function compareReleaseCode(a: string, b: string): number {
  return compareBusinessCode(a, b);
}

type DbReleaseRow = {
  id: string;
  releaseCode?: string | null;
  name?: string | null;
  status?: string | null;
  owner?: string | null;
  department?: { name?: string | null } | null;
};

type DbListRow = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  bookingCode?: string | null;
  riskCode?: string | null;
  blockerCode?: string | null;
  driftCode?: string | null;
  incidentCode?: string | null;
  approvalCode?: string | null;
  conflictCode?: string | null;
  dependencyCode?: string | null;
  leaveCode?: string | null;
  alertCode?: string | null;
  maintenanceCode?: string | null;
  flowCode?: string | null;
  description?: string | null;
  applicationName?: string | null;
};

const LIST_API: Partial<Record<VoiceEntityKind, string>> = {
  risk: "/api/risks",
  blocker: "/api/blockers",
  drift: "/api/drifts",
  incident: "/api/incidents",
  approval: "/api/approvals",
  booking: "/api/bookings",
  conflict: "/api/conflicts",
  dependency: "/api/dependencies",
  leave: "/api/leaves",
  alert: "/api/monitoring-alerts",
  maintenance: "/api/planned-maintenance",
  flow: "/api/integration-flows",
};

const HREF_PREFIX: Partial<Record<VoiceEntityKind, string>> = {
  risk: "/risks",
  blocker: "/blockers",
  drift: "/drifts",
  incident: "/incidents",
  approval: "/approvals",
  booking: "/booking",
  conflict: "/conflicts",
  dependency: "/dependencies",
  leave: "/leaves",
  alert: "/monitoring-alerts",
  maintenance: "/planned-maintenance",
  flow: "/integration-flows",
};

function codeForRow(entityType: VoiceEntityKind, row: DbListRow): string {
  switch (entityType) {
    case "booking":
      return row.bookingCode ?? row.id;
    case "risk":
      return row.riskCode ?? row.id;
    case "blocker":
      return row.blockerCode ?? row.id;
    case "drift":
      return row.driftCode ?? row.id;
    case "incident":
      return row.incidentCode ?? row.id;
    case "approval":
      return row.approvalCode ?? row.id;
    case "conflict":
      return row.conflictCode ?? row.id;
    case "dependency":
      return row.dependencyCode ?? row.id;
    case "leave":
      return row.leaveCode ?? row.id;
    case "alert":
      return row.alertCode ?? row.id;
    case "maintenance":
      return row.maintenanceCode ?? row.id;
    case "flow":
      return row.flowCode ?? row.id;
    default:
      return row.id;
  }
}

function mapSortedListRows(
  entityType: VoiceEntityKind,
  rows: DbListRow[],
  prefix: string
): SearchResult[] {
  const mapped = rows.map((row) => {
    const code = codeForRow(entityType, row);
    return {
      id: `${entityType}-${row.id}`,
      type: entityType as SearchResult["type"],
      label:
        entityType === "booking"
          ? `${code} — ${row.applicationName ?? row.name ?? "Booking"}`
          : entityType === "risk"
            ? `${code} — ${row.description ?? row.title ?? row.name ?? code}`
            : `${code} — ${row.title ?? row.name ?? row.description ?? code}`,
      sublabel: row.status ?? entityType,
      href: `${prefix}/${code}`,
      code,
    };
  });
  mapped.sort((a, b) => compareBusinessCode(a.code, b.code));
  return mapped.map(({ code: _c, ...rest }) => rest);
}

/**
 * Build an ordered list for ordinal voice picks.
 * Releases: prefer DB rows sorted by releaseCode (REL-0001, REL-0002, …).
 * Other types: sort by business code when present.
 * @param entityType - release | booking | risk | …
 * @returns SearchResult[] in stable code order.
 */
export async function listEntitiesForVoiceOrdinal(
  entityType: VoiceEntityKind
): Promise<SearchResult[]> {
  if (entityType === "release") {
    const api = await safeFetchJson<DbReleaseRow[]>("/api/releases", {
      label: "voice-ordinal-releases",
    });
    if (!isFetchAbort(api) && api.ok && Array.isArray(api.data) && api.data.length > 0) {
      const rows = api.data.map((r) => {
        const code = (r.releaseCode ?? "").trim() || r.id;
        return {
          id: `db-rel-${r.id}`,
          type: "release" as const,
          label: `${code} — ${r.name ?? "Release"}`,
          sublabel: `${r.department?.name ?? "—"} · ${r.status ?? "—"}`,
          href: `/releases/${code}`,
          code,
        };
      });
      rows.sort((a, b) => compareBusinessCode(a.code, b.code));
      return rows.map(({ code: _code, ...row }) => row);
    }
    return demoReleaseResults();
  }

  if (entityType === "booking") {
    const seed = seedBookingsOrdered();
    const api = await safeFetchJson<DbListRow[]>("/api/bookings", {
      label: "voice-ordinal-booking",
    });
    if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data) || api.data.length === 0) {
      return seed;
    }
    return mapSortedListRows("booking", api.data, "/booking");
  }

  if (entityType === "risk") {
    const seed = seedRisksOrdered();
    const api = await safeFetchJson<DbListRow[]>("/api/risks", {
      label: "voice-ordinal-risk",
    });
    if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data) || api.data.length === 0) {
      return seed;
    }
    return mapSortedListRows("risk", api.data, "/risks");
  }

  const path = LIST_API[entityType];
  const prefix = HREF_PREFIX[entityType];
  if (!path || !prefix) return [];

  const api = await safeFetchJson<DbListRow[]>(path, {
    label: `voice-ordinal-${entityType}`,
  });
  if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data)) return [];

  return mapSortedListRows(entityType, api.data, prefix);
}
