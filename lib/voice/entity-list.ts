/**
 * Ordered entity lists for voice ordinals ("first release", "first booking").
 * Releases use the same demo catalog as GlobalSearch's local index, then DB rows.
 * Bookings/risks fall back to seed JSON when APIs are unavailable (offline repro).
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

/**
 * Build an ordered list for ordinal voice picks.
 * @param entityType - release | booking | risk | …
 * @returns SearchResult[] in stable order.
 */
export async function listEntitiesForVoiceOrdinal(
  entityType: VoiceEntityKind
): Promise<SearchResult[]> {
  if (entityType === "release") {
    const local = demoReleaseResults();
    const api = await safeFetchJson<DbReleaseRow[]>("/api/releases", {
      label: "voice-ordinal-releases",
    });
    if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data)) {
      return local;
    }
    const fromDb: SearchResult[] = api.data.map((r) => ({
      id: `db-rel-${r.id}`,
      type: "release" as const,
      label: `${r.releaseCode ?? r.id} — ${r.name ?? "Release"}`,
      sublabel: `${r.department?.name ?? "—"} · ${r.status ?? "—"}`,
      href: `/releases/${r.id}`,
    }));
    const seen = new Set<string>();
    const merged: SearchResult[] = [];
    for (const r of [...local, ...fromDb]) {
      if (seen.has(r.href)) continue;
      seen.add(r.href);
      merged.push(r);
    }
    return merged;
  }

  if (entityType === "booking") {
    const seed = seedBookingsOrdered();
    const api = await safeFetchJson<DbListRow[]>("/api/bookings", {
      label: "voice-ordinal-booking",
    });
    if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data) || api.data.length === 0) {
      return seed;
    }
    return api.data.map((row) => {
      const code = codeForRow("booking", row);
      return {
        id: `booking-${row.id}`,
        type: "booking" as const,
        label: `${code} — ${row.applicationName ?? row.name ?? "Booking"}`,
        sublabel: row.status ?? "booking",
        href: `/booking/${code}`,
      };
    });
  }

  if (entityType === "risk") {
    const seed = seedRisksOrdered();
    const api = await safeFetchJson<DbListRow[]>("/api/risks", {
      label: "voice-ordinal-risk",
    });
    if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data) || api.data.length === 0) {
      return seed;
    }
    return api.data.map((row) => {
      const code = codeForRow("risk", row);
      return {
        id: `risk-${row.id}`,
        type: "risk" as const,
        label: `${code} — ${row.description ?? row.title ?? row.name ?? code}`,
        sublabel: row.status ?? "risk",
        href: `/risks/${code}`,
      };
    });
  }

  const path = LIST_API[entityType];
  const prefix = HREF_PREFIX[entityType];
  if (!path || !prefix) return [];

  const api = await safeFetchJson<DbListRow[]>(path, {
    label: `voice-ordinal-${entityType}`,
  });
  if (isFetchAbort(api) || !api.ok || !Array.isArray(api.data)) return [];

  return api.data.map((row) => {
    const code = codeForRow(entityType, row);
    return {
      id: `${entityType}-${row.id}`,
      type: entityType,
      label: row.title ?? row.name ?? row.description ?? code,
      sublabel: row.status ?? entityType,
      href: `${prefix}/${code}`,
    };
  });
}
