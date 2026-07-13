import {
  calcDbReadiness,
  computeDbLifecycleStages,
  liveBlockersToCommandBlockers,
  type DbBlocker,
} from "./db-release-command";
import { predictDbRelease, type DbReleasePrediction } from "./db-predictive";
import {
  buildDependencyImpact,
  summarizeWorkItems,
  type DependencyImpactReport,
  type WorkItemSummary,
} from "./dependency-impact";
import type { LifecycleStageView } from "./types";
import type { TodayAction } from "./top-actions";
import type { InboxSection } from "./inbox-shared";
import type { Period } from "./unified-releases";
import type { RiskFlag } from "./types";

export type DbRiskAgentContext = {
  mode: "db-release-risk";
  release: {
    releaseCode: string;
    name: string;
    owner: string;
    status: string;
    releaseDate: string;
    department: string;
    priority: string;
    impact: string;
    decision: string | null;
    applications: string[];
    dependsOn: { releaseCode: string; status: string }[];
  };
  readiness: number;
  blockers: DbBlocker[];
  lifecycleStages: LifecycleStageView[];
  prediction: DbReleasePrediction;
  impact: Pick<
    DependencyImpactReport,
    "summary" | "slipScenario" | "transitiveDownstreamCount" | "atRiskDownstream"
  > & {
    downstream: { releaseCode: string; status: string; owner: string }[];
    upstream: { releaseCode: string; status: string }[];
    sharedBookingCount: number;
  };
  workItems: WorkItemSummary;
  p1Issues: { externalId: string; title: string; status: string }[];
  bookings: { application: string; fromDate: string; toDate: string }[];
};

export type InboxBriefingContext = {
  mode: "inbox-briefing";
  period: Period;
  sessionName: string;
  scopeLabel: string | null;
  counts: Record<InboxSection, number>;
  topActions: TodayAction[];
};

const releaseInclude = {
  department: true,
  applications: { include: { application: true } },
  dependsOn: { include: { dependsOnRelease: true } },
  dependedBy: { include: { release: true } },
  bookings: {
    include: {
      application: true,
      environment: true,
      release: { select: { releaseCode: true } },
    },
  },
};

export async function buildDbRiskAgentContext(
  prisma: typeof import("./prisma").prisma,
  releaseId: string
): Promise<DbRiskAgentContext | null> {
  const [release, allReleases] = await Promise.all([
    prisma.release.findUnique({ where: { id: releaseId }, include: releaseInclude }),
    prisma.release.findMany({ include: releaseInclude }),
  ]);

  if (!release) return null;

  const [p1Issues, workItems, liveBlockerRows] = await Promise.all([
    prisma.p1Issue.findMany({ where: { releaseCode: release.releaseCode } }),
    prisma.workItem.findMany({ where: { releaseCode: release.releaseCode } }),
    prisma.blocker.findMany({
      where: { releaseCode: release.releaseCode },
      orderBy: { sourceOrder: "asc" },
      select: {
        id: true,
        blockerCode: true,
        blockerDescription: true,
        status: true,
        severity: true,
      },
    }),
  ]);

  const blockers = liveBlockersToCommandBlockers(liveBlockerRows);
  const readiness = calcDbReadiness(release, p1Issues, blockers.length);
  const stages = computeDbLifecycleStages(release, p1Issues, blockers);
  const prediction = predictDbRelease(release, p1Issues, blockers);
  const impact = buildDependencyImpact(release, allReleases);
  const workSummary = summarizeWorkItems(workItems);

  return {
    mode: "db-release-risk",
    release: {
      releaseCode: release.releaseCode,
      name: release.name,
      owner: release.owner,
      status: release.status,
      releaseDate:
        typeof release.releaseDate === "string"
          ? release.releaseDate
          : release.releaseDate.toISOString(),
      department: release.department.name,
      priority: release.priority,
      impact: release.impact,
      decision: release.decision,
      applications: release.applications.map((a) => a.application.name),
      dependsOn: release.dependsOn.map((d) => ({
        releaseCode: d.dependsOnRelease.releaseCode,
        status: d.dependsOnRelease.status,
      })),
    },
    readiness,
    blockers,
    lifecycleStages: stages,
    prediction,
    impact: {
      summary: impact.summary,
      slipScenario: impact.slipScenario,
      transitiveDownstreamCount: impact.transitiveDownstreamCount,
      atRiskDownstream: impact.atRiskDownstream,
      downstream: impact.downstream.map((d) => ({
        releaseCode: d.releaseCode,
        status: d.status,
        owner: d.owner,
      })),
      upstream: impact.upstream.map((u) => ({
        releaseCode: u.releaseCode,
        status: u.status,
      })),
      sharedBookingCount: impact.sharedBookings.length,
    },
    workItems: workSummary,
    p1Issues: p1Issues.map((p) => ({
      externalId: p.externalId,
      title: p.title,
      status: p.status,
    })),
    bookings: release.bookings.map((b) => ({
      application: b.application.name,
      fromDate:
        typeof b.fromDate === "string" ? b.fromDate : b.fromDate.toISOString(),
      toDate: typeof b.toDate === "string" ? b.toDate : b.toDate.toISOString(),
    })),
  };
}

export function buildInboxBriefingContext(input: {
  actions: TodayAction[];
  counts: Record<InboxSection, number>;
  period: Period;
  sessionName: string;
  scopeLabel?: string | null;
}): InboxBriefingContext {
  return {
    mode: "inbox-briefing",
    period: input.period,
    sessionName: input.sessionName,
    scopeLabel: input.scopeLabel ?? null,
    counts: input.counts,
    topActions: input.actions,
  };
}

export function blockersToRiskFlags(
  blockers: DbBlocker[],
  releaseCode: string,
  readiness: number
): RiskFlag[] {
  if (!blockers.length) {
    return [
      {
        title: "No open blockers detected",
        explanation: `Readiness is ${readiness}%. Continue monitoring bookings, dependencies, and Go / No-Go before target date.`,
        severity: readiness >= 70 ? "low" : "medium",
        citations: [releaseCode, `Readiness ${readiness}%`],
      },
    ];
  }

  const severityFromBlocker = (s?: string, fallbackIndex = 0): RiskFlag["severity"] => {
    const key = (s ?? "").toLowerCase();
    if (key === "critical" || key === "high") return "high";
    if (key === "medium") return "medium";
    if (key === "low") return "low";
    return fallbackIndex === 0 ? "high" : fallbackIndex === 1 ? "medium" : "low";
  };

  return blockers.slice(0, 4).map((b, i) => ({
    title: b.text.length > 72 ? `${b.text.slice(0, 69)}…` : b.text,
    explanation: b.text,
    severity: severityFromBlocker(b.severity, i),
    citations: [releaseCode, b.href ? "Blockers register" : "Release desk"].filter(Boolean) as string[],
  }));
}

export function buildFallbackInboxBriefing(ctx: InboxBriefingContext): string {
  const lines = [`Morning briefing for ${ctx.sessionName} (${ctx.period} view):`];
  if (!ctx.topActions.length) {
    lines.push("• No urgent actions in scope — review the full inbox for P1s and mapping items.");
  } else {
    ctx.topActions.forEach((a) => {
      lines.push(`• ${a.label}: ${a.detail}`);
    });
  }
  lines.push(
    "",
    `Citations: ${ctx.counts.attention} blocked/at-risk, ${ctx.counts.p1} P1s, ${ctx.counts.approaching} undecided soon`
  );
  return lines.join("\n");
}
