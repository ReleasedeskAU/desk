/**
 * Local search index built from prisma/seed-data JSON (same business codes as DB seed).
 * Extends searchAll coverage for entity types that are not in dummy-data demo releases.
 */
import type { SearchResult } from "@/lib/dummy-data";
import envBooking from "@/prisma/seed-data/env_booking.json";
import risks from "@/prisma/seed-data/risk.json";
import blockers from "@/prisma/seed-data/blockers.json";
import drifts from "@/prisma/seed-data/drift.json";
import approvals from "@/prisma/seed-data/approvals.json";
import incidents from "@/prisma/seed-data/incidents.json";
import conflicts from "@/prisma/seed-data/conflicts.json";
import dependencies from "@/prisma/seed-data/dependencies.json";
import leaves from "@/prisma/seed-data/leave_calendar.json";
import alerts from "@/prisma/seed-data/monitoring-alerts.json";
import maintenance from "@/prisma/seed-data/planned-maintenance.json";
import flows from "@/prisma/seed-data/integration-flows.json";
import departments from "@/prisma/seed-data/departments.json";
import applications from "@/prisma/seed-data/applications.json";
import users from "@/prisma/seed-data/users.json";
import riskFactors from "@/prisma/seed-data/risk_factors.json";
import appStatus from "@/prisma/seed-data/application-status.json";
import versions from "@/prisma/seed-data/versions.json";
import releases from "@/prisma/seed-data/releases.json";

type Row = Record<string, string>;

/** JSON seed rows often include non-string fields (arrays, numbers) — cast via unknown. */
function asRows(data: unknown): Row[] {
  return data as unknown as Row[];
}

function matches(q: string, ...parts: Array<string | undefined | null>): boolean {
  return parts.some((p) => p && p.toLowerCase().includes(q));
}

function push(out: SearchResult[], row: SearchResult, limit: number) {
  if (out.length >= limit) return;
  out.push(row);
}

/**
 * Normalize spoken env booking codes: "env 001" / "env-1" → "ENV-0001".
 * @param query - Raw or lowercased query.
 * @returns Padded business code or null when not an env-code shape.
 */
export function normalizeSpokenEnvBookingCode(query: string): string | null {
  const m = query.trim().toLowerCase().match(/^env[-\s]?0*(\d{1,4})$/);
  if (!m) return null;
  return `ENV-${m[1]!.padStart(4, "0")}`;
}

const SEED_BOOKING_CODES = new Set(
  asRows(envBooking).map((r) => (r["Booking ID"] ?? "").toUpperCase()).filter(Boolean)
);
const SEED_RELEASE_CODES = new Set(
  asRows(releases).map((r) => (r["Release ID"] ?? "").toUpperCase()).filter(Boolean)
);

/**
 * Whether a booking business code exists in seed JSON (offline path-exists).
 * @param code - Booking id segment (e.g. ENV-0001).
 */
export function seedBookingCodeExists(code: string): boolean {
  return SEED_BOOKING_CODES.has(code.trim().toUpperCase());
}

/**
 * Whether a release business code exists in seed JSON (offline path-exists).
 * @param code - Release id segment (e.g. REL-0001).
 */
export function seedReleaseCodeExists(code: string): boolean {
  return SEED_RELEASE_CODES.has(code.trim().toUpperCase());
}

/**
 * Search seed-backed catalogs (business codes + names).
 * @param query - Raw user query (already trimmed).
 * @param limit - Max rows to append.
 */
export function searchSeedCatalog(query: string, limit = 40): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];
  const envCode = normalizeSpokenEnvBookingCode(q);
  const envLower = envCode?.toLowerCase() ?? null;

  for (const r of asRows(releases)) {
    const code = r["Release ID"] ?? "";
    const name = r["Release Name"] ?? "";
    if (matches(q, code, name, r.Application, r.Department, r.Owner)) {
      push(
        out,
        {
          id: `seed-rel-${code}`,
          type: "release",
          label: `${code} — ${name}`,
          sublabel: `${r.Department ?? "—"} · ${r.Application ?? "—"} · Seed`,
          href: `/releases/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(envBooking)) {
    const code = r["Booking ID"] ?? "";
    if (
      matches(q, code, r.Application, r.Department, r["Release ID"], r.Notes) ||
      (envLower && code.toLowerCase() === envLower)
    ) {
      push(
        out,
        {
          id: `seed-book-${code}`,
          type: "booking",
          label: `${code} — ${r.Application ?? "Booking"}`,
          sublabel: `${r.Department ?? "—"} · ${r["Release ID"] ?? "—"} · Env booking`,
          href: `/booking/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(risks)) {
    const code = r["Risk ID"] ?? "";
    if (matches(q, code, r["Risk Description"], r["Release Name"], r.Application, r.Department)) {
      push(
        out,
        {
          id: `seed-risk-${code}`,
          type: "risk",
          label: `${code} — ${r["Risk Description"] ?? "Risk"}`,
          sublabel: `${r["Release Name"] ?? "—"} · ${r.Status ?? "—"}`,
          href: `/risks/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(blockers)) {
    const code = r["Blocker ID"] ?? "";
    if (matches(q, code, r["Blocker Description"], r["Release Name"], r.Application)) {
      push(
        out,
        {
          id: `seed-blk-${code}`,
          type: "blocker",
          label: `${code} — ${r["Blocker Description"] ?? "Blocker"}`,
          sublabel: `${r["Release Name"] ?? "—"} · ${r.Severity ?? "—"}`,
          href: `/blockers/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(drifts)) {
    const code = r["Drift ID"] ?? "";
    const label = r.Description ?? r["Drift Type:"] ?? code;
    if (matches(q, code, label, r.Application, r.Department, r["Drift Category"])) {
      push(
        out,
        {
          id: `seed-drift-${code}`,
          type: "drift",
          label: `${code} — ${label}`,
          sublabel: `${r.Application ?? "—"} · Drift`,
          href: `/drifts/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(approvals)) {
    const code = r["Approval ID"] ?? "";
    const label = r["Approval Type"] ?? code;
    if (matches(q, code, label, r["Release ID"], r.Decision, r["Approver Name"])) {
      push(
        out,
        {
          id: `seed-appr-${code}`,
          type: "approval",
          label: `${code} — ${label}`,
          sublabel: `${r["Release ID"] ?? "—"} · ${r.Decision ?? "—"}`,
          href: `/approvals/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(incidents)) {
    const code = r["Incident ID"] ?? "";
    const label = r.Title ?? code;
    if (matches(q, code, label, r.Application, r.Severity, r.Status)) {
      push(
        out,
        {
          id: `seed-inc-${code}`,
          type: "incident",
          label: `${code} — ${label}`,
          sublabel: `${r.Severity ?? "—"} · ${r.Status ?? "—"}`,
          href: `/incidents/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(conflicts)) {
    const code = r["Conflict ID"] ?? "";
    if (matches(q, code, r.Application, r.Department, r.Notes, r["Release 1"], r["Release 2"])) {
      push(
        out,
        {
          id: `seed-cnf-${code}`,
          type: "conflict",
          label: `${code} — ${r.Application ?? "Conflict"}`,
          sublabel: `${r.Department ?? "—"} · ${r.Status ?? "—"}`,
          href: `/conflicts/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(dependencies)) {
    const code = r["Dep ID"] ?? "";
    const label = r["Depends On Name"] ?? r["Dependency Type"] ?? code;
    if (matches(q, code, label, r["Release ID"], r["Release Name"], r["Depends On Release"])) {
      push(
        out,
        {
          id: `seed-dep-${code}`,
          type: "dependency",
          label: `${code} — ${label}`,
          sublabel: `${r["Release ID"] ?? "—"} · Dependency`,
          href: `/dependencies/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(leaves)) {
    const code = r["Leave ID"] ?? "";
    const name = r["User Name"] ?? code;
    if (matches(q, code, name, r.Department, r.Role, r["Leave Type"])) {
      push(
        out,
        {
          id: `seed-leave-${code}`,
          type: "leave",
          label: `${code} — ${name}`,
          sublabel: `${r.Department ?? "—"} · Leave`,
          href: `/leaves/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(alerts)) {
    const code = r["Alert ID"] ?? "";
    const label = r["Alert Type"] ?? r.Metric ?? code;
    if (matches(q, code, label, r.Application, r.Severity, r.Status)) {
      push(
        out,
        {
          id: `seed-alert-${code}`,
          type: "alert",
          label: `${code} — ${label}`,
          sublabel: `${r.Severity ?? "—"} · Monitoring alert`,
          href: `/monitoring-alerts/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(maintenance)) {
    const code = r["Maintenance ID"] ?? "";
    const label = r.Type ?? code;
    if (
      matches(
        q,
        code,
        label,
        r["Application(s)"],
        r["Environment(s)"],
        r.Department,
        r.Notes
      )
    ) {
      push(
        out,
        {
          id: `seed-maint-${code}`,
          type: "maintenance",
          label: `${code} — ${label}`,
          sublabel: `${r["Application(s)"] ?? "—"} · Planned maintenance`,
          href: `/planned-maintenance/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(flows)) {
    const code = r["Flow ID"] ?? "";
    const label = `${r["Source System"] ?? "?"} → ${r["Target System"] ?? "?"}`;
    if (
      matches(
        q,
        code,
        label,
        r["Source System"],
        r["Target System"],
        r["Integration Type"],
        r["Business Purpose"]
      )
    ) {
      push(
        out,
        {
          id: `seed-flow-${code}`,
          type: "flow",
          label: `${code} — ${label}`,
          sublabel: `${r["Integration Type"] ?? "—"} · Integration flow`,
          href: `/integration-flows/${code}`,
        },
        limit
      );
    }
  }

  for (const r of asRows(departments)) {
    const code = r.deptId ?? r.code ?? "";
    const name = r.name ?? code;
    if (matches(q, code, name, r.code)) {
      push(
        out,
        {
          id: `seed-dept-${code || name}`,
          type: "department",
          label: name,
          sublabel: `${r.code ?? "—"} · Department`,
          href: "/departments",
        },
        limit
      );
    }
  }

  for (const r of asRows(applications)) {
    const name = r.application ?? "";
    if (matches(q, name, r.department, r.applicationOwner, r.techLead)) {
      push(
        out,
        {
          id: `seed-app-${name}`,
          type: "application",
          label: name,
          sublabel: `${r.department ?? "—"} · Application`,
          href: "/applications",
        },
        limit
      );
    }
  }

  for (const r of asRows(users)) {
    const code = r["User ID"] ?? "";
    const name = r.Name ?? code;
    if (matches(q, code, name, r.Email, r.Role, r.Department)) {
      push(
        out,
        {
          id: `seed-user-${code || name}`,
          type: "user",
          label: name,
          sublabel: `${r.Role ?? "—"} · User`,
          href: "/users",
        },
        limit
      );
    }
  }

  for (const r of asRows(riskFactors)) {
    const name = r["Factor Name"] ?? "";
    if (matches(q, name, r.Category, r.Description)) {
      push(
        out,
        {
          id: `seed-rf-${name}`,
          type: "risk-factor",
          label: name,
          sublabel: `${r.Category ?? "—"} · Risk factor`,
          href: "/risk-factors",
        },
        limit
      );
    }
  }

  for (const r of asRows(appStatus)) {
    const name = r.Application ?? "";
    if (matches(q, name, r.Status, r.Environment, r.Department, r.Notes)) {
      push(
        out,
        {
          id: `seed-status-${name}-${r.Environment ?? ""}`,
          type: "status",
          label: `${name} (${r.Environment ?? "—"})`,
          sublabel: `${r.Status ?? "—"} · Application status`,
          href: "/application-status",
        },
        limit
      );
    }
  }

  for (const r of asRows(versions)) {
    const app = r.Application ?? r["App ID"] ?? "";
    const ver = r.Version ?? "";
    if (matches(q, app, ver, r.Environment, r.Notes, r.Department)) {
      push(
        out,
        {
          id: `seed-ver-${app}-${ver}-${r.Environment ?? ""}`,
          type: "version",
          label: `${app} — ${ver}`,
          sublabel: `${r.Environment ?? "—"} · Environment version`,
          href: "/environments",
        },
        limit
      );
    }
  }

  if (matches(q, "environment", "environments", "env desk", "version matrix")) {
    push(
      out,
      {
        id: "seed-env-desk",
        type: "environment",
        label: "Environments / Versions & Config",
        sublabel: "Environment desk",
        href: "/environments",
      },
      limit
    );
  }

  return out;
}

/**
 * Ordered seed bookings for voice ordinals ("first booking", "env 001").
 */
export function seedBookingsOrdered(): SearchResult[] {
  return asRows(envBooking).map((r) => {
    const code = r["Booking ID"] ?? "";
    return {
      id: `seed-book-${code}`,
      type: "booking" as const,
      label: `${code} — ${r.Application ?? "Booking"}`,
      sublabel: `${r.Department ?? "—"} · ${r["Release ID"] ?? "—"}`,
      href: `/booking/${code}`,
    };
  });
}

/**
 * Ordered seed risks for voice ordinals.
 */
export function seedRisksOrdered(): SearchResult[] {
  return asRows(risks).map((r) => {
    const code = r["Risk ID"] ?? "";
    return {
      id: `seed-risk-${code}`,
      type: "risk" as const,
      label: `${code} — ${r["Risk Description"] ?? "Risk"}`,
      sublabel: `${r["Release Name"] ?? "—"} · ${r.Status ?? "—"}`,
      href: `/risks/${code}`,
    };
  });
}
