/**
 * Read-only entity detail + spoken summary for Conversation Agent / voice get_summary.
 *
 * Release path reuses `lookupReleaseByCode` from conversation-context (the same
 * function wired to the chat `lookup_release` tool). Other entity types use the
 * same Prisma client and find-by-code/id patterns as that module — no parallel
 * data-access layer for voice.
 */
import { lookupReleaseByCode } from "@/lib/conversation-context";
import { prisma } from "@/lib/prisma";
import {
  SEARCH_ENTITY_TYPES,
  type SearchEntityType,
} from "@/lib/search-entity-types";
import { normalizeSpokenEnvBookingCode } from "@/lib/search-seed-catalog";
import { releases as demoReleases } from "@/lib/dummy-data";
import { getBlockers } from "@/lib/utils";
import { assessReleaseReadiness } from "@/lib/voice/release-readiness";

export type EntitySummaryLookupResult =
  | { status: "found"; entityType: SearchEntityType; entityId: string; summary: string; facts: Record<string, unknown> }
  | { status: "not_found"; entityType: SearchEntityType; entityId: string; reason: string }
  | { status: "unsupported"; entityType: string; entityId: string; reason: string }
  | { status: "invalid"; reason: string };

function isSearchEntityType(value: string): value is SearchEntityType {
  return (SEARCH_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Normalize search_entity refIds / spoken codes into a DB lookup key.
 * @param entityType - Canonical entity kind.
 * @param rawId - refId, business code, or cuid from search_entity.
 */
export function normalizeSummaryEntityId(entityType: string, rawId: string): string {
  let id = rawId.trim();
  if (!id) return id;

  id = id
    .replace(/^seed-(?:book|risk|blk|drift|appr|inc|cnf|dep|leave|alert|maint|flow|rel)-/i, "")
    .replace(/^db-(?:book|risk|blk|drift|appr|inc|cnf|dep|leave|alert|maint|flow|rel|app|user)-/i, "");

  if (entityType === "booking") {
    return normalizeSpokenEnvBookingCode(id) ?? id.toUpperCase();
  }

  if (entityType === "release") {
    const m = id.match(/^REL-0*(\d+)$/i);
    if (m) return `REL-${m[1]!.padStart(4, "0")}`;
    return id;
  }

  return id;
}

function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function sentences(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p && String(p).trim()))
    .map((p) => {
      const s = p.trim();
      return /[.!?]$/.test(s) ? s : `${s}.`;
    })
    .join(" ");
}

/**
 * Load a concise spoken summary for one entity (read-only).
 * @param entityType - Must be a search_entity enum value.
 * @param entityId - Business code, cuid, or search refId.
 */
export async function lookupEntitySpokenSummary(
  entityTypeRaw: string,
  entityIdRaw: string
): Promise<EntitySummaryLookupResult> {
  const entityType = entityTypeRaw.trim().toLowerCase();
  const entityIdIn = entityIdRaw.trim();
  if (!entityType || !entityIdIn) {
    return { status: "invalid", reason: "entityType and entityId are required" };
  }
  if (!isSearchEntityType(entityType)) {
    return {
      status: "unsupported",
      entityType,
      entityId: entityIdIn,
      reason: `No summary available for entity type “${entityType}”`,
    };
  }

  const entityId = normalizeSummaryEntityId(entityType, entityIdIn);

  switch (entityType) {
    case "release":
      return summarizeRelease(entityId);
    case "booking":
      return summarizeBooking(entityId);
    case "risk":
      return summarizeRisk(entityId);
    case "blocker":
      return summarizeBlocker(entityId);
    case "drift":
      return summarizeDrift(entityId);
    case "approval":
      return summarizeApproval(entityId);
    case "incident":
      return summarizeIncident(entityId);
    case "conflict":
      return summarizeConflict(entityId);
    case "dependency":
      return summarizeDependency(entityId);
    case "leave":
      return summarizeLeave(entityId);
    case "alert":
      return summarizeAlert(entityId);
    case "maintenance":
      return summarizeMaintenance(entityId);
    case "flow":
      return summarizeFlow(entityId);
    case "application":
      return summarizeApplication(entityId);
    case "department":
      return summarizeDepartment(entityId);
    case "user":
      return summarizeUser(entityId);
    case "environment":
      return summarizeEnvironment(entityId);
    case "version":
      return summarizeVersion(entityId);
    case "risk-factor":
      return summarizeRiskFactor(entityId);
    case "status":
      return summarizeAppStatus(entityId);
    default:
      return {
        status: "unsupported",
        entityType,
        entityId,
        reason: `No summary available for entity type “${entityType}”`,
      };
  }
}

async function summarizeRelease(entityId: string): Promise<EntitySummaryLookupResult> {
  // Same DB tool as Conversation Agent chat `lookup_release`.
  try {
    const detail = await lookupReleaseByCode(entityId);
    if (detail) {
      const blockers = await prisma.blocker.findMany({
        where: { releaseCode: detail.releaseCode },
        orderBy: { sourceOrder: "asc" },
        take: 8,
        select: {
          blockerCode: true,
          blockerDescription: true,
          severity: true,
          status: true,
        },
      });
      const openBlockers = blockers.filter((b) => !/resolved|closed|done/i.test(b.status));
      const pendingApprovals = await prisma.approval.count({
        where: {
          release: { releaseCode: detail.releaseCode },
          decision: { equals: "Pending", mode: "insensitive" },
        },
      });
      const conflictBookings = detail.bookings.filter((b) => b.conflict).length;
      const dependenciesBlocked = detail.dependencies
        .filter((d) => /blocked|at\s*risk/i.test(d.status))
        .map((d) => d.code);

      const assessment = assessReleaseReadiness({
        releaseCode: detail.releaseCode,
        name: detail.name,
        status: detail.status,
        owner: detail.owner,
        department: detail.department,
        priority: detail.priority,
        releaseDate: detail.releaseDate,
        decision: detail.decision,
        conflictFlag: detail.conflictFlag,
        readinessPercent: detail.readinessPercent,
        goLiveChecklistPercent: detail.goLiveChecklistPercent,
        approvalStatus: detail.approvalStatus,
        releaseHealth: detail.releaseHealth,
        rollbackPlan: detail.rollbackPlan,
        devSignoff: detail.devSignoff,
        testSignoff: detail.testSignoff,
        uatSignoff: detail.uatSignoff,
        securityClearance: detail.securityClearance,
        openBlockers,
        conflictBookings,
        openRisks: detail.risks,
        pendingApprovals,
        dependenciesBlocked,
      });

      return {
        status: "found",
        entityType: "release",
        entityId: detail.releaseCode,
        summary: assessment.spokenSummary,
        facts: {
          ...detail,
          blockers: openBlockers,
          readinessVerdict: assessment.verdict,
          blockingFactors: assessment.blockingFactors,
          readySignals: assessment.readySignals,
        },
      };
    }
  } catch {
    // Fall through to demo catalog when DB is unavailable (unit tests / offline).
  }

  // Demo command-center releases (search_entity may return rel-v2140).
  const demo = demoReleases.find((r) => r.id === entityId || r.version === entityId);
  if (demo) {
    const blockers = getBlockers(demo);
    const assessment = assessReleaseReadiness({
      releaseCode: demo.version,
      name: demo.name,
      status: demo.status,
      owner: demo.owner,
      department: demo.team,
      openBlockers: blockers.map((b, i) => ({
        blockerCode: `demo-${i + 1}`,
        blockerDescription: b,
        severity: "High",
        status: "Open",
      })),
    });
    return {
      status: "found",
      entityType: "release",
      entityId: demo.id,
      summary: assessment.spokenSummary,
      facts: {
        demo: true,
        id: demo.id,
        version: demo.version,
        status: demo.status,
        blockers,
        readinessVerdict: assessment.verdict,
      },
    };
  }

  return {
    status: "not_found",
    entityType: "release",
    entityId,
    reason: `No release found for “${entityId}”`,
  };
}

async function summarizeBooking(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.envBooking.findFirst({
      where: { bookingCode: { equals: entityId, mode: "insensitive" } },
      include: {
        application: { select: { name: true } },
        release: { select: { releaseCode: true, name: true, status: true } },
        environment: { select: { name: true, type: true } },
      },
    })) ??
    (await prisma.envBooking.findUnique({
      where: { id: entityId },
      include: {
        application: { select: { name: true } },
        release: { select: { releaseCode: true, name: true, status: true } },
        environment: { select: { name: true, type: true } },
      },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "booking",
      entityId,
      reason: `No env booking found for “${entityId}”`,
    };
  }

  const code = row.bookingCode ?? row.id;
  const summary = sentences(
    `Booking ${code} covers ${row.application.name}${row.environment ? ` on ${row.environment.name}` : ""}.`,
    row.release
      ? `Linked release ${row.release.releaseCode} (${row.release.name}) is ${row.release.status}.`
      : "No linked release.",
    `Window ${row.fromDate.toISOString().slice(0, 10)} to ${row.toDate.toISOString().slice(0, 10)}; status ${row.status}.`,
    row.conflictFlag ? "Conflict flag is set — check overlapping bookings." : "No booking conflict flag."
  );

  return {
    status: "found",
    entityType: "booking",
    entityId: code,
    summary,
    facts: {
      bookingCode: code,
      application: row.application.name,
      status: row.status,
      conflictFlag: row.conflictFlag,
      releaseCode: row.release?.releaseCode ?? null,
    },
  };
}

async function summarizeRisk(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.risk.findFirst({
      where: { riskCode: { equals: entityId, mode: "insensitive" } },
      include: { release: { select: { releaseCode: true, name: true, status: true } } },
    })) ??
    (await prisma.risk.findUnique({
      where: { id: entityId },
      include: { release: { select: { releaseCode: true, name: true, status: true } } },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "risk",
      entityId,
      reason: `No risk found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Risk ${row.riskCode} is ${row.status} with score ${row.riskScore} (likelihood ${row.likelihood}, impact ${row.impact}).`,
    clip(row.description, 140),
    `Tied to ${row.release.releaseCode} (${row.release.name}), currently ${row.release.status}.`,
    row.mitigationStrategy ? `Mitigation: ${clip(row.mitigationStrategy, 100)}.` : null
  );

  return {
    status: "found",
    entityType: "risk",
    entityId: row.riskCode,
    summary,
    facts: {
      riskCode: row.riskCode,
      status: row.status,
      riskScore: row.riskScore,
      releaseCode: row.release.releaseCode,
    },
  };
}

async function summarizeBlocker(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.blocker.findFirst({
      where: { blockerCode: { equals: entityId, mode: "insensitive" } },
    })) ?? (await prisma.blocker.findUnique({ where: { id: entityId } }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "blocker",
      entityId,
      reason: `No blocker found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Blocker ${row.blockerCode} is ${row.status} at ${row.severity} severity on ${row.releaseCode}.`,
    clip(row.blockerDescription, 140),
    `Application ${row.applicationName}; ${row.daysOpen} day(s) open.`,
    row.assignedTo ? `Assigned to ${row.assignedTo}.` : null
  );

  return {
    status: "found",
    entityType: "blocker",
    entityId: row.blockerCode,
    summary,
    facts: {
      blockerCode: row.blockerCode,
      status: row.status,
      severity: row.severity,
      releaseCode: row.releaseCode,
    },
  };
}

async function summarizeDrift(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.drift.findFirst({
      where: { driftCode: { equals: entityId, mode: "insensitive" } },
      include: {
        application: { select: { name: true } },
        release: { select: { releaseCode: true, name: true } },
      },
    })) ??
    (await prisma.drift.findUnique({
      where: { id: entityId },
      include: {
        application: { select: { name: true } },
        release: { select: { releaseCode: true, name: true } },
      },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "drift",
      entityId,
      reason: `No drift found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Drift ${row.driftCode} is ${row.status} (${row.severity}) on ${row.application.name} / ${row.environmentName}.`,
    clip(row.description, 140),
    `Related release ${row.release.releaseCode}.`
  );

  return {
    status: "found",
    entityType: "drift",
    entityId: row.driftCode,
    summary,
    facts: { driftCode: row.driftCode, status: row.status, severity: row.severity },
  };
}

async function summarizeApproval(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.approval.findFirst({
      where: { approvalCode: { equals: entityId, mode: "insensitive" } },
      include: {
        release: { select: { releaseCode: true, name: true } },
        approver: { select: { name: true, role: true } },
      },
    })) ??
    (await prisma.approval.findUnique({
      where: { id: entityId },
      include: {
        release: { select: { releaseCode: true, name: true } },
        approver: { select: { name: true, role: true } },
      },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "approval",
      entityId,
      reason: `No approval found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Approval ${row.approvalCode} for ${row.approvalType} on ${row.release.releaseCode} is ${row.decision}.`,
    `Approver ${row.approver.name} (${row.approver.role}).`,
    row.comments ? clip(row.comments, 100) : null
  );

  return {
    status: "found",
    entityType: "approval",
    entityId: row.approvalCode,
    summary,
    facts: { approvalCode: row.approvalCode, decision: row.decision },
  };
}

async function summarizeIncident(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.incident.findFirst({
      where: { incidentCode: { equals: entityId, mode: "insensitive" } },
      include: { application: { select: { name: true } } },
    })) ??
    (await prisma.incident.findUnique({
      where: { id: entityId },
      include: { application: { select: { name: true } } },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "incident",
      entityId,
      reason: `No incident found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Incident ${row.incidentCode} is ${row.status} at ${row.severity} on ${row.application.name}.`,
    clip(row.title, 120),
    `Impact: ${clip(row.impact, 100)}.`,
    row.assignedTo ? `Assigned to ${row.assignedTo}.` : null
  );

  return {
    status: "found",
    entityType: "incident",
    entityId: row.incidentCode,
    summary,
    facts: { incidentCode: row.incidentCode, status: row.status, severity: row.severity },
  };
}

async function summarizeConflict(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.environmentConflict.findFirst({
      where: { conflictCode: { equals: entityId, mode: "insensitive" } },
    })) ?? (await prisma.environmentConflict.findUnique({ where: { id: entityId } }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "conflict",
      entityId,
      reason: `No conflict found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Conflict ${row.conflictCode} is ${row.status} (${row.priority}) for ${row.applicationName}.`,
    `${row.release1Code} vs ${row.release2Code} on ${row.conflictingEnvironment}.`,
    row.notes ? clip(row.notes, 100) : null
  );

  return {
    status: "found",
    entityType: "conflict",
    entityId: row.conflictCode,
    summary,
    facts: { conflictCode: row.conflictCode, status: row.status },
  };
}

async function summarizeDependency(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.releaseDependency.findFirst({
      where: { dependencyCode: { equals: entityId, mode: "insensitive" } },
      include: {
        release: { select: { releaseCode: true, name: true, status: true } },
        dependsOnRelease: { select: { releaseCode: true, name: true, status: true } },
      },
    })) ??
    (await prisma.releaseDependency.findUnique({
      where: { id: entityId },
      include: {
        release: { select: { releaseCode: true, name: true, status: true } },
        dependsOnRelease: { select: { releaseCode: true, name: true, status: true } },
      },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "dependency",
      entityId,
      reason: `No dependency found for “${entityId}”`,
    };
  }

  const code = row.dependencyCode ?? row.id;
  const summary = sentences(
    `Dependency ${code}: ${row.release.releaseCode} depends on ${row.dependsOnRelease.releaseCode} (${row.dependsOnRelease.name}).`,
    `Upstream is ${row.dependsOnRelease.status}; link status ${row.status ?? "n/a"}.`,
    row.impactIfBlocked ? `If blocked: ${clip(row.impactIfBlocked, 100)}.` : null
  );

  return {
    status: "found",
    entityType: "dependency",
    entityId: code,
    summary,
    facts: { dependencyCode: code, status: row.status },
  };
}

async function summarizeLeave(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.leaveRecord.findFirst({
      where: { leaveCode: { equals: entityId, mode: "insensitive" } },
      include: { user: { select: { name: true, role: true, department: true } } },
    })) ??
    (await prisma.leaveRecord.findUnique({
      where: { id: entityId },
      include: { user: { select: { name: true, role: true, department: true } } },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "leave",
      entityId,
      reason: `No leave record found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Leave ${row.leaveCode}: ${row.user.name} (${row.user.role}, ${row.user.department}) is out ${row.leaveStart.toISOString().slice(0, 10)} to ${row.leaveEnd.toISOString().slice(0, 10)}.`,
    `${row.leaveType}, ${row.days} day(s).`,
    row.riskImpact ? `Coverage risk: ${clip(row.riskImpact, 100)}.` : null
  );

  return {
    status: "found",
    entityType: "leave",
    entityId: row.leaveCode,
    summary,
    facts: { leaveCode: row.leaveCode, days: row.days },
  };
}

async function summarizeAlert(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.monitoringAlert.findFirst({
      where: { alertCode: { equals: entityId, mode: "insensitive" } },
      include: { application: { select: { name: true } } },
    })) ??
    (await prisma.monitoringAlert.findUnique({
      where: { id: entityId },
      include: { application: { select: { name: true } } },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "alert",
      entityId,
      reason: `No monitoring alert found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Alert ${row.alertCode} is ${row.status} (${row.severity}) on ${row.application.name} / ${row.environmentName}.`,
    `${row.alertType}: ${row.metric}${row.currentValue ? ` at ${row.currentValue}` : ""}${row.threshold ? ` (threshold ${row.threshold})` : ""}.`
  );

  return {
    status: "found",
    entityType: "alert",
    entityId: row.alertCode,
    summary,
    facts: { alertCode: row.alertCode, status: row.status },
  };
}

async function summarizeMaintenance(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.plannedMaintenance.findFirst({
      where: { maintenanceCode: { equals: entityId, mode: "insensitive" } },
      include: { application: { select: { name: true } } },
    })) ??
    (await prisma.plannedMaintenance.findUnique({
      where: { id: entityId },
      include: { application: { select: { name: true } } },
    }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "maintenance",
      entityId,
      reason: `No planned maintenance found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Maintenance ${row.maintenanceCode} (${row.type}) is ${row.approvalStatus} on ${row.scheduledDate.toISOString().slice(0, 10)}.`,
    `${row.application?.name ?? "Org-wide"} / ${row.environmentName}, ${row.startTime}–${row.endTime}.`,
    clip(row.impact, 100)
  );

  return {
    status: "found",
    entityType: "maintenance",
    entityId: row.maintenanceCode,
    summary,
    facts: { maintenanceCode: row.maintenanceCode, approvalStatus: row.approvalStatus },
  };
}

async function summarizeFlow(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.integrationFlow.findFirst({
      where: { flowCode: { equals: entityId, mode: "insensitive" } },
    })) ?? (await prisma.integrationFlow.findUnique({ where: { id: entityId } }));

  if (!row) {
    return {
      status: "not_found",
      entityType: "flow",
      entityId,
      reason: `No integration flow found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Flow ${row.flowCode} moves data from ${row.sourceSystem} to ${row.targetSystem} (${row.integrationType}, ${row.frequency}).`,
    clip(row.businessPurpose, 140)
  );

  return {
    status: "found",
    entityType: "flow",
    entityId: row.flowCode,
    summary,
    facts: { flowCode: row.flowCode, integrationType: row.integrationType },
  };
}

async function summarizeApplication(entityId: string): Promise<EntitySummaryLookupResult> {
  const row =
    (await prisma.application.findFirst({
      where: {
        OR: [{ id: entityId }, { name: { equals: entityId, mode: "insensitive" } }],
      },
      include: { department: { select: { name: true } } },
    })) ?? null;

  if (!row) {
    return {
      status: "not_found",
      entityType: "application",
      entityId,
      reason: `No application found for “${entityId}”`,
    };
  }

  const [openRisks, openBlockers] = await Promise.all([
    prisma.risk.count({
      where: { applicationName: row.name, status: { notIn: ["Closed", "Resolved", "Mitigated"] } },
    }),
    prisma.blocker.count({
      where: { applicationName: row.name, status: { notIn: ["Resolved", "Closed", "Done"] } },
    }),
  ]);

  const summary = sentences(
    `${row.name} is a ${row.type} application in ${row.department.name}.`,
    `Product owner ${row.productOwner}; tech lead ${row.techLead}.`,
    `Open risks ${openRisks}, open blockers ${openBlockers}.`
  );

  return {
    status: "found",
    entityType: "application",
    entityId: row.id,
    summary,
    facts: { name: row.name, openRisks, openBlockers },
  };
}

async function summarizeDepartment(entityId: string): Promise<EntitySummaryLookupResult> {
  const row = await prisma.department.findFirst({
    where: {
      OR: [{ id: entityId }, { name: { equals: entityId, mode: "insensitive" } }],
    },
  });

  if (!row) {
    return {
      status: "not_found",
      entityType: "department",
      entityId,
      reason: `No department found for “${entityId}”`,
    };
  }

  const releaseCount = await prisma.release.count({ where: { departmentId: row.id } });
  const summary = sentences(
    `Department ${row.name}, headed by ${row.head}.`,
    `${releaseCount} release(s) on record.`
  );

  return {
    status: "found",
    entityType: "department",
    entityId: row.id,
    summary,
    facts: { name: row.name, releaseCount },
  };
}

async function summarizeUser(entityId: string): Promise<EntitySummaryLookupResult> {
  const row = await prisma.user.findFirst({
    where: {
      OR: [
        { id: entityId },
        { userId: { equals: entityId, mode: "insensitive" } },
        { email: { equals: entityId, mode: "insensitive" } },
        { name: { equals: entityId, mode: "insensitive" } },
      ],
    },
  });

  if (!row) {
    return {
      status: "not_found",
      entityType: "user",
      entityId,
      reason: `No user found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `${row.name} (${row.userId}) is ${row.role} in ${row.department}, access ${row.accessLevel}, status ${row.status}.`,
    row.manager ? `Manager ${row.manager}.` : null
  );

  return {
    status: "found",
    entityType: "user",
    entityId: row.userId,
    summary,
    facts: { userId: row.userId, role: row.role, status: row.status },
  };
}

async function summarizeEnvironment(entityId: string): Promise<EntitySummaryLookupResult> {
  const row = await prisma.environment.findFirst({
    where: {
      OR: [{ id: entityId }, { name: { equals: entityId, mode: "insensitive" } }],
    },
    include: { application: { select: { name: true } } },
  });

  if (!row) {
    // Hub page fallback — Conversation Agent has no env desk tool; give a short desk summary.
    if (/environment|desk|versions?/i.test(entityId)) {
      const bookingConflicts = await prisma.envBooking.count({ where: { conflictFlag: true } });
      const summary = `Environment desk overview: ${bookingConflicts} booking(s) currently flagged with conflicts. Open Versions & Config for the matrix.`;
      return {
        status: "found",
        entityType: "environment",
        entityId: "desk",
        summary,
        facts: { bookingConflicts },
      };
    }
    return {
      status: "not_found",
      entityType: "environment",
      entityId,
      reason: `No environment found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Environment ${row.name} (${row.type}) for ${row.application.name} is ${row.status}.`,
    `Owner ${row.owner}.`
  );

  return {
    status: "found",
    entityType: "environment",
    entityId: row.id,
    summary,
    facts: { name: row.name, type: row.type },
  };
}

async function summarizeVersion(entityId: string): Promise<EntitySummaryLookupResult> {
  const row = await prisma.environmentVersion.findFirst({
    where: { OR: [{ id: entityId }, { version: { equals: entityId, mode: "insensitive" } }] },
    include: {
      environment: { select: { name: true } },
      application: { select: { name: true } },
    },
  });

  if (!row) {
    return {
      status: "not_found",
      entityType: "version",
      entityId,
      reason: `No environment version found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Version ${row.version} is deployed on ${row.environment.name} for ${row.application.name}.`,
    row.buildNumber ? `Build ${row.buildNumber}.` : null,
    row.status ? `Status ${row.status}.` : null
  );

  return {
    status: "found",
    entityType: "version",
    entityId: row.id,
    summary,
    facts: { version: row.version, status: row.status },
  };
}

async function summarizeRiskFactor(entityId: string): Promise<EntitySummaryLookupResult> {
  const row = await prisma.riskFactor.findFirst({
    where: {
      OR: [{ id: entityId }, { factorName: { equals: entityId, mode: "insensitive" } }],
    },
  });

  if (!row) {
    return {
      status: "not_found",
      entityType: "risk-factor",
      entityId,
      reason: `No risk factor found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `Risk factor “${row.factorName}” in ${row.category}, weight ${row.weight}, ${row.active ? "active" : "inactive"}.`,
    row.description ? clip(row.description, 120) : null
  );

  return {
    status: "found",
    entityType: "risk-factor",
    entityId: row.id,
    summary,
    facts: { factorName: row.factorName, weight: row.weight },
  };
}

async function summarizeAppStatus(entityId: string): Promise<EntitySummaryLookupResult> {
  const row = await prisma.applicationStatus.findFirst({
    where: {
      OR: [
        { id: entityId },
        { application: { name: { equals: entityId, mode: "insensitive" } } },
      ],
    },
    include: { application: { select: { name: true } } },
    orderBy: { lastCheck: "desc" },
  });

  if (!row) {
    return {
      status: "not_found",
      entityType: "status",
      entityId,
      reason: `No application status found for “${entityId}”`,
    };
  }

  const summary = sentences(
    `${row.application.name} on ${row.environmentName} is ${row.status}.`,
    `Last check ${row.lastCheck.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    row.uptimePercent != null ? `Uptime ${row.uptimePercent}%.` : null
  );

  return {
    status: "found",
    entityType: "status",
    entityId: row.id,
    summary,
    facts: { status: row.status, environmentName: row.environmentName },
  };
}
