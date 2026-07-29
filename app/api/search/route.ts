import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { parseNlSearch } from "@/lib/nl-search";
import { prisma } from "@/lib/prisma";
import { dbReleaseToSearchResult, demoReleaseMatchesQuery } from "@/lib/unified-releases";
import { releases as demoReleases } from "@/lib/dummy-data";
import type { SearchResult } from "@/lib/dummy-data";
import { normalizeSpokenEnvBookingCode } from "@/lib/search-seed-catalog";
import {
  containsAnyKey,
  rankSearchResults,
  strengthenSearchKeys,
} from "@/lib/search-strengthen";

/**
 * Authenticated global / voice search across domain entities.
 * Strengthened with context-agent query keys (shorthand codes + multi-term).
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [], interpreted: null });

  const { plan, keys, interpreted: strengthenInterpreted } =
    strengthenSearchKeys(q);
  const primary = plan.primaryQuery || q;

  const departments = await prisma.department.findMany();
  const nl = parseNlSearch(q, departments);

  const lower = q.toLowerCase();
  const envCode = normalizeSpokenEnvBookingCode(q) ?? normalizeSpokenEnvBookingCode(primary);
  const results: SearchResult[] = [...nl.extraResults];

  const dbReleases = await prisma.release.findMany({
    where: {
      OR: [
        ...containsAnyKey("releaseCode", keys),
        ...containsAnyKey("name", keys),
        ...containsAnyKey("owner", keys),
        ...containsAnyKey("programProject", keys),
      ],
    },
    include: { department: true },
    take: 12,
  });
  dbReleases.forEach((r) => results.push(dbReleaseToSearchResult(r)));

  const dept = departments.find((d) => lower.includes(d.name.toLowerCase()));
  if (dept && (lower.includes("blocked") || lower.includes("at risk") || lower.includes("release"))) {
    const deptReleases = await prisma.release.findMany({
      where: {
        departmentId: dept.id,
        ...(lower.includes("blocked")
          ? { status: "Blocked" }
          : lower.includes("at risk")
            ? { status: "At Risk" }
            : {}),
      },
      include: { department: true },
      take: 6,
    });
    deptReleases.forEach((r) => {
      if (!results.some((x) => x.href === `/releases/${r.id}` || x.href === `/releases/${r.releaseCode}`)) {
        results.push(dbReleaseToSearchResult(r));
      }
    });
  }

  const apps = await prisma.application.findMany({
    where: {
      OR: [
        ...containsAnyKey("name", keys),
        ...containsAnyKey("type", keys),
      ],
    },
    include: { department: true },
    take: 5,
  });
  apps.forEach((a) =>
    results.push({
      id: `db-app-${a.id}`,
      type: "application",
      label: a.name,
      sublabel: `${a.department.name} · Application · Database`,
      href: "/applications",
    })
  );

  const bookingQueryKeys = envCode
    ? [...new Set([envCode, ...keys])]
    : keys;
  const bookings = await prisma.envBooking.findMany({
    where: {
      OR: [
        ...containsAnyKey("bookingCode", bookingQueryKeys),
        ...containsAnyKey("departmentName", keys),
        ...containsAnyKey("purpose", keys),
        ...containsAnyKey("team", keys),
        ...containsAnyKey("bookedBy", keys),
        { application: { OR: containsAnyKey("name", keys) } },
        { release: { OR: containsAnyKey("releaseCode", keys) } },
      ],
    },
    include: {
      application: { select: { name: true } },
      release: { select: { releaseCode: true } },
    },
    take: 8,
  });
  bookings.forEach((b) => {
    const code = b.bookingCode ?? b.id;
    results.push({
      id: `db-book-${b.id}`,
      type: "booking",
      label: `${code} — ${b.application.name}`,
      sublabel: `${b.departmentName ?? "—"} · ${b.release?.releaseCode ?? "—"} · Env booking`,
      href: `/booking/${code}`,
    });
  });

  const risks = await prisma.risk.findMany({
    where: {
      OR: [
        ...containsAnyKey("riskCode", keys),
        ...containsAnyKey("description", keys),
        ...containsAnyKey("applicationName", keys),
        ...containsAnyKey("departmentName", keys),
        { release: { OR: [...containsAnyKey("name", keys), ...containsAnyKey("releaseCode", keys)] } },
      ],
    },
    include: { release: { select: { name: true, releaseCode: true } } },
    take: 8,
  });
  risks.forEach((r) => {
    results.push({
      id: `db-risk-${r.id}`,
      type: "risk",
      label: `${r.riskCode} — ${r.description}`,
      sublabel: `${r.release.name} · ${r.status}`,
      href: `/risks/${r.riskCode}`,
    });
  });

  const blockers = await prisma.blocker.findMany({
    where: {
      OR: [
        ...containsAnyKey("blockerCode", keys),
        ...containsAnyKey("blockerDescription", keys),
        ...containsAnyKey("applicationName", keys),
        ...containsAnyKey("releaseName", keys),
        ...containsAnyKey("releaseCode", keys),
      ],
    },
    take: 8,
  });
  blockers.forEach((b) => {
    results.push({
      id: `db-blk-${b.id}`,
      type: "blocker",
      label: `${b.blockerCode} — ${b.blockerDescription}`,
      sublabel: `${b.releaseName} · ${b.severity}`,
      href: `/blockers/${b.blockerCode}`,
    });
  });

  const drifts = await prisma.drift.findMany({
    where: {
      OR: [
        ...containsAnyKey("driftCode", keys),
        ...containsAnyKey("description", keys),
        ...containsAnyKey("departmentName", keys),
        { application: { OR: containsAnyKey("name", keys) } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 6,
  });
  drifts.forEach((d) => {
    results.push({
      id: `db-drift-${d.id}`,
      type: "drift",
      label: `${d.driftCode} — ${d.description}`,
      sublabel: `${d.application.name} · Drift`,
      href: `/drifts/${d.driftCode}`,
    });
  });

  const approvals = await prisma.approval.findMany({
    where: {
      OR: [
        ...containsAnyKey("approvalCode", keys),
        ...containsAnyKey("approvalType", keys),
        ...containsAnyKey("applicationName", keys),
        { release: { OR: containsAnyKey("releaseCode", keys) } },
        { approver: { OR: containsAnyKey("name", keys) } },
      ],
    },
    include: {
      release: { select: { releaseCode: true } },
      approver: { select: { name: true } },
    },
    take: 6,
  });
  approvals.forEach((a) => {
    results.push({
      id: `db-appr-${a.id}`,
      type: "approval",
      label: `${a.approvalCode} — ${a.approvalType}`,
      sublabel: `${a.release.releaseCode} · ${a.decision}`,
      href: `/approvals/${a.approvalCode}`,
    });
  });

  const incidents = await prisma.incident.findMany({
    where: {
      OR: [
        ...containsAnyKey("incidentCode", keys),
        ...containsAnyKey("title", keys),
        ...containsAnyKey("departmentName", keys),
        { application: { OR: containsAnyKey("name", keys) } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 6,
  });
  incidents.forEach((i) => {
    results.push({
      id: `db-inc-${i.id}`,
      type: "incident",
      label: `${i.incidentCode} — ${i.title}`,
      sublabel: `${i.severity} · ${i.status}`,
      href: `/incidents/${i.incidentCode}`,
    });
  });

  const conflicts = await prisma.environmentConflict.findMany({
    where: {
      OR: [
        ...containsAnyKey("conflictCode", keys),
        ...containsAnyKey("applicationName", keys),
        ...containsAnyKey("departmentName", keys),
        ...containsAnyKey("notes", keys),
        ...containsAnyKey("release1Code", keys),
        ...containsAnyKey("release2Code", keys),
      ],
    },
    take: 6,
  });
  conflicts.forEach((c) => {
    results.push({
      id: `db-cnf-${c.id}`,
      type: "conflict",
      label: `${c.conflictCode} — ${c.applicationName}`,
      sublabel: `${c.status} · Conflict`,
      href: `/conflicts/${c.conflictCode}`,
    });
  });

  const deps = await prisma.releaseDependency.findMany({
    where: {
      OR: [
        ...containsAnyKey("dependencyCode", keys),
        ...containsAnyKey("notes", keys),
        { release: { OR: containsAnyKey("releaseCode", keys) } },
        {
          dependsOnRelease: {
            OR: [...containsAnyKey("releaseCode", keys), ...containsAnyKey("name", keys)],
          },
        },
      ],
    },
    include: {
      release: { select: { releaseCode: true } },
      dependsOnRelease: { select: { name: true, releaseCode: true } },
    },
    take: 6,
  });
  deps.forEach((d) => {
    const code = d.dependencyCode ?? d.id;
    results.push({
      id: `db-dep-${d.id}`,
      type: "dependency",
      label: `${code} — ${d.dependsOnRelease.name}`,
      sublabel: `${d.release.releaseCode} · Dependency`,
      href: `/dependencies/${code}`,
    });
  });

  const leaves = await prisma.leaveRecord.findMany({
    where: {
      OR: [
        ...containsAnyKey("leaveCode", keys),
        ...containsAnyKey("leaveType", keys),
        { user: { OR: [...containsAnyKey("name", keys), ...containsAnyKey("department", keys)] } },
      ],
    },
    include: { user: { select: { name: true, department: true } } },
    take: 6,
  });
  leaves.forEach((l) => {
    results.push({
      id: `db-leave-${l.id}`,
      type: "leave",
      label: `${l.leaveCode} — ${l.user.name}`,
      sublabel: `${l.user.department} · Leave`,
      href: `/leaves/${l.leaveCode}`,
    });
  });

  const alerts = await prisma.monitoringAlert.findMany({
    where: {
      OR: [
        ...containsAnyKey("alertCode", keys),
        ...containsAnyKey("alertType", keys),
        ...containsAnyKey("metric", keys),
        { application: { OR: containsAnyKey("name", keys) } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 6,
  });
  alerts.forEach((a) => {
    results.push({
      id: `db-alert-${a.id}`,
      type: "alert",
      label: `${a.alertCode} — ${a.alertType}`,
      sublabel: `${a.severity} · Monitoring alert`,
      href: `/monitoring-alerts/${a.alertCode}`,
    });
  });

  const maint = await prisma.plannedMaintenance.findMany({
    where: {
      OR: [
        ...containsAnyKey("maintenanceCode", keys),
        ...containsAnyKey("type", keys),
        ...containsAnyKey("notes", keys),
        ...containsAnyKey("environmentName", keys),
        { application: { OR: containsAnyKey("name", keys) } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 6,
  });
  maint.forEach((m) => {
    results.push({
      id: `db-maint-${m.id}`,
      type: "maintenance",
      label: `${m.maintenanceCode} — ${m.type}`,
      sublabel: `${m.application?.name ?? "—"} · Planned maintenance`,
      href: `/planned-maintenance/${m.maintenanceCode}`,
    });
  });

  const flows = await prisma.integrationFlow.findMany({
    where: {
      OR: [
        ...containsAnyKey("flowCode", keys),
        ...containsAnyKey("sourceSystem", keys),
        ...containsAnyKey("targetSystem", keys),
        ...containsAnyKey("businessPurpose", keys),
      ],
    },
    take: 6,
  });
  flows.forEach((f) => {
    results.push({
      id: `db-flow-${f.id}`,
      type: "flow",
      label: `${f.flowCode} — ${f.sourceSystem} → ${f.targetSystem}`,
      sublabel: `${f.integrationType} · Integration flow`,
      href: `/integration-flows/${f.flowCode}`,
    });
  });

  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...containsAnyKey("userId", keys),
        ...containsAnyKey("name", keys),
        ...containsAnyKey("email", keys),
      ],
    },
    take: 4,
  });
  users.forEach((u) => {
    results.push({
      id: `db-user-${u.id}`,
      type: "user",
      label: u.name,
      sublabel: `${u.role} · User`,
      href: "/users",
    });
  });

  for (const key of keys) {
    demoReleases
      .filter((r) => demoReleaseMatchesQuery(r, key))
      .slice(0, 4)
      .forEach((r) =>
        results.push({
          id: `demo-rel-${r.id}`,
          type: "release",
          label: `${r.version} — ${r.name}`,
          sublabel: `${r.team} · ${r.status} · Demo command center`,
          href: `/releases/${r.id}`,
        })
      );
  }

  if (lower.includes("booking") || lower.includes("book env") || envCode) {
    results.push({
      id: "link-booking",
      type: "booking",
      label: "Environment Booking",
      sublabel: "Check availability across applications",
      href: "/booking",
    });
  }

  if (lower.includes("mapping") || lower.includes("upstream") || lower.includes("downstream")) {
    results.push({
      id: "link-mapping",
      type: "change",
      label: "System Mapping",
      sublabel: "Env relationships and booking risks",
      href: "/system-mapping",
    });
  }

  const merged = rankSearchResults(results, plan, 20);
  const interpreted =
    strengthenInterpreted ??
    (nl.interpreted !== `Keyword search for “${q}”` ? nl.interpreted : null);

  return NextResponse.json({
    results: merged,
    interpreted,
    redirectHref: nl.redirectHref ?? null,
  });
}
