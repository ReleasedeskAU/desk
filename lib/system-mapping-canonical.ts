import type { Prisma, SystemMatrixRow } from "@prisma/client";
import { SYSTEM_MAPPING_DEPARTMENTS } from "@/lib/validation/system-mapping";

export const CANONICAL_MAPPING_GROUP_NAME = "Enterprise Default Setup";

const PREFERRED_ENVIRONMENTS = ["Test", "UAT", "Pre-prod", "Prod", "Dev"] as const;
const MATRIX_FIELD_BY_DEPARTMENT = {
  Finance: "finance",
  HR: "hr",
  IT: "it",
  CRM: "crm",
  Manufacturing: "manufacturing",
  Logistics: "logistics",
  Legal: "legal",
  Security: "security",
} as const satisfies Record<
  (typeof SYSTEM_MAPPING_DEPARTMENTS)[number],
  keyof SystemMatrixRow
>;

type ProjectionApplication = {
  id: string;
  department: { name: string };
  environments: { id: string; name: string }[];
};

type MatrixProjectionRow = Pick<
  SystemMatrixRow,
  | "fromDepartment"
  | "finance"
  | "hr"
  | "it"
  | "crm"
  | "manufacturing"
  | "logistics"
  | "legal"
  | "security"
>;

type ProjectedEdge = {
  organizationId: string | null;
  groupId: string;
  sourceAppId: string;
  sourceEnvId: string;
  targetAppId: string;
  targetEnvId: string;
  direction: string;
  notes: string;
  isDefault: boolean;
  sourceOrder: number;
};

function preferredEnvironment(environments: ProjectionApplication["environments"]) {
  for (const preferredName of PREFERRED_ENVIRONMENTS) {
    const environment = environments.find(
      ({ name }) => name.toLowerCase() === preferredName.toLowerCase()
    );
    if (environment) return environment;
  }
  return environments[0];
}

/**
 * Projects matrix cells into canonical mapping edges without database writes.
 * Applications must be ordered by creation time so the first app per department is stable.
 */
export function buildCanonicalEdges(
  matrixRows: MatrixProjectionRow[],
  applications: ProjectionApplication[],
  group: { id: string; organizationId: string | null }
): ProjectedEdge[] {
  const applicationByDepartment = new Map<string, ProjectionApplication>();
  for (const application of applications) {
    if (!applicationByDepartment.has(application.department.name)) {
      applicationByDepartment.set(application.department.name, application);
    }
  }

  const edges: ProjectedEdge[] = [];
  let sourceOrder = 0;
  for (const matrixRow of matrixRows) {
    const sourceApplication = applicationByDepartment.get(matrixRow.fromDepartment);
    const sourceEnvironment = sourceApplication
      ? preferredEnvironment(sourceApplication.environments)
      : undefined;
    if (!sourceApplication || !sourceEnvironment) continue;

    for (const targetDepartment of SYSTEM_MAPPING_DEPARTMENTS) {
      const value = matrixRow[MATRIX_FIELD_BY_DEPARTMENT[targetDepartment]];
      if (targetDepartment === matrixRow.fromDepartment || (value !== "●" && value !== "○")) {
        continue;
      }

      const targetApplication = applicationByDepartment.get(targetDepartment);
      const targetEnvironment = targetApplication
        ? preferredEnvironment(targetApplication.environments)
        : undefined;
      if (!targetApplication || !targetEnvironment) continue;

      edges.push({
        organizationId: group.organizationId,
        groupId: group.id,
        sourceAppId: sourceApplication.id,
        sourceEnvId: sourceEnvironment.id,
        targetAppId: targetApplication.id,
        targetEnvId: targetEnvironment.id,
        direction: "downstream",
        notes: `${matrixRow.fromDepartment} → ${targetDepartment} (${
          value === "●" ? "Primary" : "Secondary"
        } · ${sourceEnvironment.name})`,
        isDefault: true,
        sourceOrder: ++sourceOrder,
      });
    }
  }
  return edges;
}

/**
 * Rebuilds only the canonical group's edges inside the caller's transaction.
 * Preserves the canonical group's organization and leaves all other mapping groups untouched.
 */
export async function rebuildCanonicalMappingEdges(
  transaction: Prisma.TransactionClient
): Promise<number> {
  const group = await transaction.systemMappingGroup.findFirst({
    where: { name: CANONICAL_MAPPING_GROUP_NAME },
    select: { id: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!group) {
    throw new Error("Canonical system mapping group is missing");
  }

  const [matrixRows, applications] = await Promise.all([
    transaction.systemMatrixRow.findMany({ orderBy: { sourceOrder: "asc" } }),
    transaction.application.findMany({
      include: { department: true, environments: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const edges = buildCanonicalEdges(matrixRows, applications, group);

  await transaction.systemMappingEdge.deleteMany({ where: { groupId: group.id } });
  if (edges.length > 0) {
    await transaction.systemMappingEdge.createMany({ data: edges });
  }
  return edges.length;
}
