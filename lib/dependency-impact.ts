export type ReleaseImpactNode = {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
  owner: string;
  releaseDate: string;
  href: string;
};

export type BookingImpact = {
  id: string;
  application: string;
  environment: string | null;
  fromDate: string;
  toDate: string;
  purpose: string | null;
  bookedBy: string;
  releaseCode: string | null;
};

export type DependencyImpactReport = {
  release: ReleaseImpactNode;
  upstream: ReleaseImpactNode[];
  downstream: ReleaseImpactNode[];
  transitiveDownstreamCount: number;
  sharedBookings: BookingImpact[];
  atRiskDownstream: number;
  summary: string;
  slipScenario: string;
};

type ReleaseNode = {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
  owner: string;
  releaseDate: Date | string;
};

type ReleaseRow = ReleaseNode & {
  dependsOn: { dependsOnRelease: ReleaseNode }[];
  dependedBy: { release: ReleaseNode }[];
  bookings: {
    id: string;
    fromDate: Date | string;
    toDate: Date | string;
    purpose: string | null;
    bookedBy: string;
    application: { name: string };
    environment: { name: string } | null;
  }[];
  applications: { application: { id: string; name: string } }[];
};

export type ReleaseRowForImpact = ReleaseRow;

function toNode(r: ReleaseNode): ReleaseImpactNode {
  const date =
    typeof r.releaseDate === "string" ? r.releaseDate : r.releaseDate.toISOString();
  return {
    id: r.id,
    releaseCode: r.releaseCode,
    name: r.name,
    status: r.status,
    owner: r.owner,
    releaseDate: date,
    href: `/releases/${r.id}`,
  };
}

function collectDownstream(rootId: string, all: Map<string, ReleaseRow>): ReleaseNode[] {
  const seen = new Set<string>();
  const queue = [rootId];
  const result: ReleaseNode[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    const row = all.get(id);
    if (!row) continue;
    row.dependedBy.forEach(({ release }) => {
      if (seen.has(release.id)) return;
      seen.add(release.id);
      result.push(release);
      queue.push(release.id);
    });
  }

  return result.sort(
    (a, b) =>
      new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime()
  );
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function buildDependencyImpact(
  release: ReleaseRow,
  allReleases: ReleaseRow[]
): DependencyImpactReport {
  const byId = new Map(allReleases.map((r) => [r.id, r]));
  const upstream = release.dependsOn.map((d) => toNode(d.dependsOnRelease));
  const downstreamRows = collectDownstream(release.id, byId);
  const downstream = downstreamRows.map(toNode);
  const atRiskDownstream = downstream.filter(
    (d) =>
      d.status === "Blocked" ||
      d.status === "At Risk" ||
      d.status === "Pending"
  ).length;

  const appNames = new Set(release.applications.map((a) => a.application.name));
  const releaseStart = new Date(
    typeof release.releaseDate === "string"
      ? release.releaseDate
      : release.releaseDate.toISOString()
  );
  const windowEnd = new Date(releaseStart);
  windowEnd.setDate(windowEnd.getDate() + 14);

  const sharedBookings: BookingImpact[] = [];
  allReleases.forEach((r) => {
    r.bookings.forEach((b) => {
      if (!appNames.has(b.application.name)) return;
      const from = new Date(typeof b.fromDate === "string" ? b.fromDate : b.fromDate.toISOString());
      const to = new Date(typeof b.toDate === "string" ? b.toDate : b.toDate.toISOString());
      if (!overlaps(releaseStart, windowEnd, from, to)) return;

      sharedBookings.push({
        id: b.id,
        application: b.application.name,
        environment: b.environment?.name ?? null,
        fromDate: from.toISOString(),
        toDate: to.toISOString(),
        purpose: b.purpose,
        bookedBy: b.bookedBy,
        releaseCode: r.releaseCode,
      });
    });
  });

  const blockedUpstream = upstream.filter(
    (u) =>
      u.status === "Blocked" ||
      u.status === "At Risk" ||
      u.status === "Pending"
  );

  let summary = `${downstream.length} downstream release(s) depend on ${release.releaseCode}.`;
  if (blockedUpstream.length) {
    summary += ` ${blockedUpstream.length} upstream release(s) already blocked or at risk.`;
  }
  if (sharedBookings.length) {
    summary += ` ${sharedBookings.length} overlapping env booking(s) in the next 14 days.`;
  }

  const slipScenario =
    downstream.length === 0
      ? `If ${release.releaseCode} slips, no other releases in the portfolio are directly blocked — review env bookings and mapping only.`
      : `If ${release.releaseCode} slips, ${downstream.map((d) => d.releaseCode).join(", ")} may miss target dates. Owners to notify: ${Array.from(new Set(downstream.map((d) => d.owner))).join(", ")}.`;

  return {
    release: toNode(release),
    upstream,
    downstream,
    transitiveDownstreamCount: downstream.length,
    sharedBookings,
    atRiskDownstream,
    summary,
    slipScenario,
  };
}

export type WorkItemSummary = {
  total: number;
  done: number;
  open: number;
  blocked: number;
  byType: Record<string, number>;
};

export function summarizeWorkItems(
  items: { status: string; itemType: string }[]
): WorkItemSummary {
  const doneStatuses = new Set(["Done", "Closed", "Resolved"]);
  const byType: Record<string, number> = {};
  let done = 0;
  let blocked = 0;

  items.forEach((i) => {
    byType[i.itemType] = (byType[i.itemType] ?? 0) + 1;
    if (doneStatuses.has(i.status)) done += 1;
    if (i.status === "Blocked" || i.status === "Pending") blocked += 1;
  });

  return {
    total: items.length,
    done,
    open: items.length - done,
    blocked,
    byType,
  };
}
