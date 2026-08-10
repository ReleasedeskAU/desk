import { parseReleaseFilters, prismaReleaseWhere } from "./db-release-filter";
import {
  sortInboxItems,
  type InboxItem,
  type InboxSection,
} from "./inbox-shared";
import {
  buildDbAttentionItem,
  isNeedsAttentionStatus,
  sortAttentionItems,
  type NeedsAttentionItem,
} from "./needs-attention";
import { getLiveState } from "./release-state-repo";
import { loadReleaseLifecycleConfig } from "./release-lifecycle-config-db";
import { attentionStatusLabels } from "./release-lifecycle-status-ui";
import { periodRange, type Period } from "./unified-releases";
import type { ReleaseDecision } from "./types";
import { isApprovalOverdue } from "./utils";
import { ownerMatches } from "./user-match";
import { cacheKey, cachedJson, DEFAULT_CACHE_TTL_SECONDS } from "./cache";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function attentionToInboxItem(item: NeedsAttentionItem): InboxItem {
  return {
    id: `attention-${item.source}-${item.id}`,
    section: "attention",
    priority: isNeedsAttentionStatus(item.status) ? 0 : 1,
    title: `${item.code} — ${item.name}`,
    subtitle: `${item.group} · ${item.owner}`,
    reason: item.reason,
    responsible: item.responsible,
    href: item.href,
    date: item.date,
    source: item.source,
  };
}

export type InboxBuildDeps = {
  period: Period;
  filters: ReturnType<typeof parseReleaseFilters>;
  sessionName: string;
  prisma: typeof import("./prisma").prisma;
  clerkUserId?: string | null;
};

export async function buildInboxItems(deps: InboxBuildDeps): Promise<{
  period: Period;
  range: { start: Date; end: Date };
  counts: Record<InboxSection, number>;
  items: InboxItem[];
  attention: NeedsAttentionItem[];
}> {
  const { period, filters, sessionName, prisma, clerkUserId } = deps;
  const { start, end } = periodRange(period);

  let attentionLabels = ["Blocked", "Rolled Back"];
  if (clerkUserId) {
    try {
      attentionLabels = attentionStatusLabels(
        (await loadReleaseLifecycleConfig(clerkUserId)).config
      );
    } catch {
      /* keep fallback */
    }
  }
  if (attentionLabels.length === 0) attentionLabels = ["__none__"];
  const attentionSet = new Set(
    attentionLabels.map((l) => l.toLocaleLowerCase())
  );

  const filterApp = filters.applicationId
    ? await prisma.application.findUnique({ where: { id: filters.applicationId } })
    : null;

  const [departments, applications, environments, dbRows, liveState, p1Issues, edges, allBookings, approachingRows, myRows] =
    await Promise.all([
      prisma.department.findMany(),
      prisma.application.findMany(),
      prisma.environment.findMany({ include: { application: true } }),
      prisma.release.findMany({
        where: prismaReleaseWhere(filters, {
          releaseDate: { gte: start, lte: end },
          status: { in: attentionLabels },
        }),
        include: {
          department: true,
          auditEvents: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { releaseDate: "asc" },
      }),
      getLiveState(),
      prisma.p1Issue.findMany({
        where: {
          status: { notIn: ["Closed", "Done", "Resolved"] },
          ...(filterApp ? { application: filterApp.name } : {}),
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.systemMappingEdge.findMany({
        include: {
          sourceApp: true,
          sourceEnv: true,
          targetApp: true,
          targetEnv: true,
        },
      }),
      prisma.envBooking.findMany({
        where: { status: "BOOKED" },
        include: { application: true, environment: true },
      }),
      prisma.release.findMany({
        where: prismaReleaseWhere(filters, {
          releaseDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) },
          decision: null,
          status: { not: "Complete" },
        }),
        include: { department: true },
        orderBy: { releaseDate: "asc" },
      }),
      sessionName
        ? prisma.release.findMany({
            where: prismaReleaseWhere(filters, {
              releaseDate: { gte: start, lte: end },
            }),
            include: { department: true },
            orderBy: { releaseDate: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const dbAttention = dbRows.map(buildDbAttentionItem);
  const attention = sortAttentionItems(dbAttention);
  const items: InboxItem[] = attention.map(attentionToInboxItem);

  p1Issues.forEach((p) => {
    items.push({
      id: `p1-${p.externalId}`,
      section: "p1",
      priority: 2,
      title: p.externalId,
      subtitle: p.application ?? "Cross-app",
      reason: p.title,
      responsible: "Release manager",
      href: p.releaseCode ? `/releases?search=${encodeURIComponent(p.releaseCode)}` : "/releases",
      date: p.updatedAt.toISOString(),
      source: "database",
    });
  });

  approachingRows.forEach((r) => {
    items.push({
      id: `approaching-${r.id}`,
      section: "approaching",
      priority: 3,
      title: `${r.releaseCode} — ${r.name}`,
      subtitle: `${r.department.name} · ${r.owner}`,
      reason: "Target within 7 days — no Go / No-Go recorded",
      responsible: r.owner,
      href: `/releases/${r.id}#go-nogo`,
      date: r.releaseDate.toISOString(),
      source: "database",
    });
  });

  edges.forEach((edge) => {
    const targetBooking = allBookings.find(
      (b) =>
        b.applicationId === edge.targetAppId &&
        (!b.environmentId || b.environmentId === edge.targetEnvId) &&
        overlaps(start, end, b.fromDate, b.toDate)
    );
    if (!targetBooking) return;

    items.push({
      id: `mapping-${edge.id}`,
      section: "mapping",
      priority: 4,
      title: `${edge.sourceApp.name} → ${edge.targetApp.name}`,
      subtitle: `${edge.sourceEnv.name} needs ${edge.targetEnv.name}`,
      reason: `${edge.targetEnv.name} booked by ${targetBooking.bookedBy} (${targetBooking.team})`,
      responsible: targetBooking.bookedBy,
      href: "/system-mapping",
      date: targetBooking.fromDate.toISOString(),
      source: "database",
    });
  });



  if (sessionName) {
    myRows
      .filter((r) => ownerMatches(sessionName, r.owner))
      .filter((r) => r.status !== "Complete")
      .forEach((r) => {
        items.push({
          id: `mine-${r.id}`,
          section: "mine",
          priority: 6,
          title: `${r.releaseCode} — ${r.name}`,
          subtitle: `${r.department.name} · ${r.status}`,
          reason: attentionSet.has(r.status.toLocaleLowerCase())
            ? `Your release is ${r.status.toLowerCase()}`
            : `Target ${r.releaseDate.toLocaleDateString("en-AU")}`,
          responsible: r.owner,
          href: `/releases/${r.id}`,
          date: r.releaseDate.toISOString(),
          source: "database",
        });
      });
  }

  const sorted = sortInboxItems(items);
  const counts: Record<InboxSection, number> = {
    attention: sorted.filter((i) => i.section === "attention").length,
    p1: sorted.filter((i) => i.section === "p1").length,
    approaching: sorted.filter((i) => i.section === "approaching").length,
    mapping: sorted.filter((i) => i.section === "mapping").length,
    approvals: sorted.filter((i) => i.section === "approvals").length,
    mine: sorted.filter((i) => i.section === "mine").length,
  };

  return { period, range: { start, end }, counts, items: sorted, attention };
}

function inboxCacheKey(deps: InboxBuildDeps): string {
  return cacheKey("inbox", {
    period: deps.period,
    dept: deps.filters.departmentId,
    app: deps.filters.applicationId,
    env: deps.filters.environmentId,
    user: deps.sessionName,
  });
}

/** Redis-cached inbox build — shared by /api/inbox and /api/actions/today. */
export async function buildInboxItemsCached(deps: InboxBuildDeps) {
  return cachedJson(inboxCacheKey(deps), DEFAULT_CACHE_TTL_SECONDS, () => buildInboxItems(deps));
}

export type { InboxItem, InboxSection } from "./inbox-shared";
