import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { parseNlSearch } from "@/lib/nl-search";
import { prisma } from "@/lib/prisma";
import { dbReleaseToSearchResult, demoReleaseMatchesQuery } from "@/lib/unified-releases";
import { releases as demoReleases } from "@/lib/dummy-data";
import type { SearchResult } from "@/lib/dummy-data";
import { normalizeSpokenEnvBookingCode } from "@/lib/search-seed-catalog";

/**
 * Authenticated global / voice search across domain entities.
 * Extends release/app keyword search with booking, risk, blocker, etc. code lookups.
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [], interpreted: null });

  const departments = await prisma.department.findMany();
  const nl = parseNlSearch(q, departments);

  const lower = q.toLowerCase();
  const envCode = normalizeSpokenEnvBookingCode(q);
  const results: SearchResult[] = [...nl.extraResults];

  const dbReleases = await prisma.release.findMany({
    where: {
      OR: [
        { releaseCode: { contains: q } },
        { name: { contains: q } },
        { owner: { contains: q } },
        { programProject: { contains: q } },
      ],
    },
    include: { department: true },
    take: 8,
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
      if (!results.some((x) => x.href === `/releases/${r.id}`)) {
        results.push(dbReleaseToSearchResult(r));
      }
    });
  }

  const apps = await prisma.application.findMany({
    where: { OR: [{ name: { contains: q } }, { type: { contains: q } }] },
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

  const bookingQuery = envCode ?? q;
  const bookings = await prisma.envBooking.findMany({
    where: {
      OR: [
        { bookingCode: { contains: bookingQuery } },
        { departmentName: { contains: q } },
        { purpose: { contains: q } },
        { team: { contains: q } },
        { bookedBy: { contains: q } },
        { application: { name: { contains: q } } },
        { release: { releaseCode: { contains: q } } },
      ],
    },
    include: {
      application: { select: { name: true } },
      release: { select: { releaseCode: true } },
    },
    take: 6,
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
        { riskCode: { contains: q } },
        { description: { contains: q } },
        { applicationName: { contains: q } },
        { departmentName: { contains: q } },
        { release: { name: { contains: q } } },
        { release: { releaseCode: { contains: q } } },
      ],
    },
    include: { release: { select: { name: true, releaseCode: true } } },
    take: 5,
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
        { blockerCode: { contains: q } },
        { blockerDescription: { contains: q } },
        { applicationName: { contains: q } },
        { releaseName: { contains: q } },
        { releaseCode: { contains: q } },
      ],
    },
    take: 5,
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
        { driftCode: { contains: q } },
        { description: { contains: q } },
        { departmentName: { contains: q } },
        { application: { name: { contains: q } } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 4,
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
        { approvalCode: { contains: q } },
        { approvalType: { contains: q } },
        { applicationName: { contains: q } },
        { release: { releaseCode: { contains: q } } },
        { approver: { name: { contains: q } } },
      ],
    },
    include: {
      release: { select: { releaseCode: true } },
      approver: { select: { name: true } },
    },
    take: 4,
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
        { incidentCode: { contains: q } },
        { title: { contains: q } },
        { departmentName: { contains: q } },
        { application: { name: { contains: q } } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 4,
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
        { conflictCode: { contains: q } },
        { applicationName: { contains: q } },
        { departmentName: { contains: q } },
        { notes: { contains: q } },
        { release1Code: { contains: q } },
        { release2Code: { contains: q } },
      ],
    },
    take: 4,
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
        { dependencyCode: { contains: q } },
        { notes: { contains: q } },
        { release: { releaseCode: { contains: q } } },
        { dependsOnRelease: { releaseCode: { contains: q } } },
        { dependsOnRelease: { name: { contains: q } } },
      ],
    },
    include: {
      release: { select: { releaseCode: true } },
      dependsOnRelease: { select: { name: true, releaseCode: true } },
    },
    take: 4,
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
        { leaveCode: { contains: q } },
        { leaveType: { contains: q } },
        { user: { name: { contains: q } } },
        { user: { department: { contains: q } } },
      ],
    },
    include: { user: { select: { name: true, department: true } } },
    take: 4,
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
        { alertCode: { contains: q } },
        { alertType: { contains: q } },
        { metric: { contains: q } },
        { application: { name: { contains: q } } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 4,
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
        { maintenanceCode: { contains: q } },
        { type: { contains: q } },
        { notes: { contains: q } },
        { environmentName: { contains: q } },
        { application: { name: { contains: q } } },
      ],
    },
    include: { application: { select: { name: true } } },
    take: 4,
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
        { flowCode: { contains: q } },
        { sourceSystem: { contains: q } },
        { targetSystem: { contains: q } },
        { businessPurpose: { contains: q } },
      ],
    },
    take: 4,
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
        { userId: { contains: q } },
        { name: { contains: q } },
        { email: { contains: q } },
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

  demoReleases
    .filter((r) => demoReleaseMatchesQuery(r, q))
    .slice(0, 8)
    .forEach((r) =>
      results.push({
        id: `demo-rel-${r.id}`,
        type: "release",
        label: `${r.version} — ${r.name}`,
        sublabel: `${r.team} · ${r.status} · Demo command center`,
        href: `/releases/${r.id}`,
      })
    );

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

  const seen = new Set<string>();
  const merged = results
    .filter((r) => {
      if (seen.has(r.href + r.label)) return false;
      seen.add(r.href + r.label);
      return true;
    })
    .slice(0, 20);

  return NextResponse.json({
    results: merged,
    interpreted: nl.interpreted !== `Keyword search for “${q}”` ? nl.interpreted : null,
    redirectHref: nl.redirectHref ?? null,
  });
}
