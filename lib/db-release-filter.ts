import type { Prisma } from "@releasedesk/database";
import {
  EMPTY_RELEASE_FILTERS,
  filtersFromSearchParams,
  type ReleaseListFilters,
} from "./release-filters";
import { releases as demoReleases } from "./dummy-data";
import { demoReleaseMatchesFilters } from "./unified-releases";
import { inPeriod, type Period } from "./period-range";

export function parseReleaseFilters(req: Request): ReleaseListFilters {
  return filtersFromSearchParams(new URL(req.url).searchParams);
}

export function prismaReleaseWhere(
  filters: ReleaseListFilters,
  extra?: Prisma.ReleaseWhereInput
): Prisma.ReleaseWhereInput {
  const parts: Prisma.ReleaseWhereInput[] = [];
  if (extra) parts.push(extra);

  if (filters.departmentId) parts.push({ departmentId: filters.departmentId });
  if (filters.applicationId) {
    parts.push({ applications: { some: { applicationId: filters.applicationId } } });
  }
  if (filters.environmentId) {
    parts.push({
      OR: [
        { bookings: { some: { environmentId: filters.environmentId } } },
        {
          applications: {
            some: { application: { environments: { some: { id: filters.environmentId } } } },
          },
        },
      ],
    });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function filterDemoReleasesForPeriod(
  period: Period,
  filters: ReleaseListFilters,
  departments: { id: string; name: string }[],
  applications: { id: string; name: string }[],
  environments: { id: string; application: { name: string } }[],
  anchor = new Date()
) {
  const active =
    filters.departmentId || filters.applicationId || filters.environmentId
      ? filters
      : EMPTY_RELEASE_FILTERS;

  return demoReleases.filter(
    (r) =>
      inPeriod(r.targetDate, period, anchor) &&
      demoReleaseMatchesFilters(r, active, departments, applications, environments)
  );
}
