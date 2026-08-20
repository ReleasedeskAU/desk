import fs from "fs";
import path from "path";

type SeedRow = Record<string, unknown>;

export type DependencyViewRow = {
  id: string;
  depCode: string;
  releaseCode: string;
  releaseName: string;
  releaseDbId: string | null;
  dependsOnCode: string;
  dependsOnName: string;
  dependsOnDbId: string | null;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string | null;
};

let cached: SeedRow[] | null = null;

export function loadSeedDependencies(): SeedRow[] {
  if (cached) return cached;
  const file = path.join(process.cwd(), "prisma/seed-data/dependencies.json");
  cached = JSON.parse(fs.readFileSync(file, "utf-8"));
  return cached!;
}

export function mapSeedDependencyRow(
  row: SeedRow,
  releaseIdByCode: Map<string, string>
): DependencyViewRow {
  const depCode = String(row["Dep ID"]);
  const releaseCode = String(row["Release ID"]);
  const dependsOnCode = String(row["Depends On Release"]);
  return {
    id: depCode,
    depCode,
    releaseCode,
    releaseName: String(row["Release Name"] ?? ""),
    releaseDbId: releaseIdByCode.get(releaseCode) ?? null,
    dependsOnCode,
    dependsOnName: String(row["Depends On Name"] ?? ""),
    dependsOnDbId: releaseIdByCode.get(dependsOnCode) ?? null,
    dependencyType: String(row["Dependency Type"] ?? ""),
    status: String(row["Status"] ?? ""),
    impactIfBlocked: String(row["Impact if Blocked"] ?? ""),
    notes: row["Notes"] ? String(row["Notes"]) : null,
  };
}

/**
 * True when this release is the depender or the dependee.
 * Exact code or database id — avoids REL-0001 matching REL-00010.
 */
export function dependencyTouchesRelease(
  row: Pick<
    DependencyViewRow,
    "releaseCode" | "dependsOnCode" | "releaseDbId" | "dependsOnDbId"
  >,
  linked: string
): boolean {
  const exact = linked.trim();
  if (!exact) return true;
  if (row.releaseDbId === exact || row.dependsOnDbId === exact) return true;
  const lower = exact.toLowerCase();
  return row.releaseCode.toLowerCase() === lower || row.dependsOnCode.toLowerCase() === lower;
}

function contains(hay: string | null | undefined, needle: string | undefined) {
  if (!needle) return true;
  return (hay ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

export type DependencySeedFilters = {
  status?: string;
  dependencyType?: string;
  impact?: string;
  releaseCodeQ?: string;
  dependsOnCodeQ?: string;
  depCodeQ?: string;
  releaseNameQ?: string;
  dependsOnNameQ?: string;
  notesQ?: string;
  /** Match either side of the link (exact code or db id). */
  linkedReleaseQ?: string;
};

export function filterSeedDependencies(
  rows: DependencyViewRow[],
  filters: DependencySeedFilters
): DependencyViewRow[] {
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.dependencyType && row.dependencyType !== filters.dependencyType) return false;
    if (filters.impact && row.impactIfBlocked !== filters.impact) return false;
    if (filters.linkedReleaseQ) {
      if (!dependencyTouchesRelease(row, filters.linkedReleaseQ)) return false;
    } else {
      if (!contains(row.releaseCode, filters.releaseCodeQ)) return false;
      if (!contains(row.dependsOnCode, filters.dependsOnCodeQ)) return false;
    }
    if (!contains(row.depCode, filters.depCodeQ)) return false;
    if (!contains(row.releaseName, filters.releaseNameQ)) return false;
    if (!contains(row.dependsOnName, filters.dependsOnNameQ)) return false;
    if (!contains(row.notes, filters.notesQ)) return false;
    return true;
  });
}
