/**
 * Release ↔ Service bridge helpers (P1-S2 Option 1).
 * Live reads only — never denormalize service lists onto Release.
 */
import { prisma } from "@/lib/prisma";

export type ReleaseServiceRow = {
  id: string;
  name: string;
  criticality: string;
  applicationId: string;
  applicationName: string;
};

/**
 * Statuses treated as "met" for ReleaseDependency unmet checks.
 * Anything else (including null/blank) is unmet.
 */
const MET_DEPENDENCY_STATUSES = new Set([
  "met",
  "resolved",
  "satisfied",
  "completed",
  "done",
  "closed",
]);

/**
 * Whether a ReleaseDependency status counts as unmet.
 * @param status - Raw status from DB (nullable).
 * @returns true when the dependency still blocks progress.
 */
export function isReleaseDependencyUnmet(status: string | null | undefined): boolean {
  if (status == null) return true;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  return !MET_DEPENDENCY_STATUSES.has(normalized);
}

/**
 * Pure projection used by the live Services Involved section.
 * Empty `applicationIds` → empty list (not an error / not a placeholder service).
 *
 * @param applicationIds - Applications on the release (may be empty).
 * @param services - Candidate service rows already filtered by those apps (or broader).
 * @returns Services whose applicationId is in the set, sorted by name.
 */
export function projectServicesInvolved(
  applicationIds: readonly string[],
  services: ReadonlyArray<{
    id: string;
    name: string;
    criticality: string;
    applicationId: string | null;
    applicationName: string;
  }>
): ReleaseServiceRow[] {
  if (applicationIds.length === 0) return [];
  const wanted = new Set(applicationIds);
  return services
    .filter(
      (s): s is typeof s & { applicationId: string } =>
        s.applicationId != null && wanted.has(s.applicationId)
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      criticality: s.criticality,
      applicationId: s.applicationId,
      applicationName: s.applicationName,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Live list of Copilot Services linked to a Release via
 * Service.applicationId → Application → ReleaseApplication → Release.
 * Returns [] when no applications are linked or no services point at them.
 *
 * @param releaseId - Release primary key (not releaseCode).
 * @returns Services involved, ordered by name.
 * @sideEffects Reads Service / Application / ReleaseApplication via Prisma.
 */
export async function listServicesForRelease(
  releaseId: string
): Promise<ReleaseServiceRow[]> {
  const links = await prisma.releaseApplication.findMany({
    where: { releaseId },
    select: { applicationId: true },
  });
  const applicationIds = links.map((l) => l.applicationId);
  if (applicationIds.length === 0) return [];

  const services = await prisma.service.findMany({
    where: { applicationId: { in: applicationIds } },
    select: {
      id: true,
      name: true,
      criticality: true,
      applicationId: true,
      application: { select: { name: true } },
    },
  });

  return projectServicesInvolved(
    applicationIds,
    services.map((s) => ({
      id: s.id,
      name: s.name,
      criticality: s.criticality,
      applicationId: s.applicationId,
      applicationName: s.application?.name ?? "",
    }))
  );
}
