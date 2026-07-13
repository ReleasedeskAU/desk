import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { parseReleaseFilters } from "@/lib/db-release-filter";
import { predictDbRelease } from "@/lib/db-predictive";
import { liveBlockersToCommandBlockers } from "@/lib/db-release-command";
import { buildInboxItemsCached } from "@/lib/inbox";
import { buildInboxBriefingContext } from "@/lib/db-ai-context";
import { buildTopActionsToday } from "@/lib/top-actions";
import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/unified-releases";

const releaseInclude = {
  applications: { include: { application: true } },
  dependsOn: { include: { dependsOnRelease: true } },
  bookings: { include: { application: true } },
};

export async function GET(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") ?? "month") as Period;
  const filters = parseReleaseFilters(req);
  const sessionName = user?.name ?? "";

  const [inbox, releases, p1Issues, blockerRows] = await Promise.all([
    buildInboxItemsCached({ period, filters, sessionName, prisma }),
    prisma.release.findMany({ include: releaseInclude }),
    prisma.p1Issue.findMany(),
    prisma.blocker.findMany({
      select: {
        id: true,
        releaseCode: true,
        blockerCode: true,
        blockerDescription: true,
        status: true,
        severity: true,
      },
    }),
  ]);

  const p1ByCode = new Map<string, typeof p1Issues>();
  p1Issues.forEach((p) => {
    if (!p.releaseCode) return;
    const list = p1ByCode.get(p.releaseCode) ?? [];
    list.push(p);
    p1ByCode.set(p.releaseCode, list);
  });

  const blockersByCode = new Map<string, typeof blockerRows>();
  blockerRows.forEach((b) => {
    const list = blockersByCode.get(b.releaseCode) ?? [];
    list.push(b);
    blockersByCode.set(b.releaseCode, list);
  });

  const predictions = releases.map((release) => ({
    releaseCode: release.releaseCode,
    name: release.name,
    href: `/releases/${release.id}`,
    owner: release.owner,
    prediction: predictDbRelease(
      release,
      p1ByCode.get(release.releaseCode) ?? [],
      liveBlockersToCommandBlockers(blockersByCode.get(release.releaseCode) ?? [])
    ),
  }));

  const actions = buildTopActionsToday(inbox.items, predictions, sessionName);

  const briefingContext = buildInboxBriefingContext({
    actions,
    counts: inbox.counts,
    period,
    sessionName,
  });

  return NextResponse.json({ actions, period, briefingContext });
}
