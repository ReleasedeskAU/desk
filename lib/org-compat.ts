import { prisma } from "./prisma";

let cachedOrgId: string | null | undefined;

/**
 * Returns the default Organization id for live Neon writes.
 *
 * Not multi-tenant routing — only satisfies NOT NULL organizationId columns left
 * from the July 2026 tenancy era. Local/v1 DBs without Organization return null
 * and callers fall back to plain Prisma creates.
 *
 * @returns Organization id, or null when the table/row is unavailable.
 */
export async function getDefaultOrganizationId(): Promise<string | null> {
  if (cachedOrgId !== undefined) return cachedOrgId;
  try {
    const row = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    cachedOrgId = row?.id ?? null;
  } catch {
    cachedOrgId = null;
  }
  return cachedOrgId;
}

function newId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `c${t}${r}`.slice(0, 25);
}

/**
 * Runs one shared create strategy across v1 (no Organization FK) and live v2.
 * Entity helpers provide only their typed Prisma create and raw org-aware insert.
 */
async function createWithOrgCompatibility<T>(
  createStandard: () => Promise<T>,
  createForOrganization?: (organizationId: string) => Promise<T>
): Promise<T> {
  const organizationId = await getDefaultOrganizationId();
  return organizationId && createForOrganization
    ? createForOrganization(organizationId)
    : createStandard();
}

export async function createDepartmentRow(name: string, head: string) {
  const orgId = await getDefaultOrganizationId();
  if (!orgId) {
    return prisma.department.create({ data: { name, head } });
  }
  const id = newId();
  const now = new Date();
  const rows = await prisma.$queryRaw<
    { id: string; name: string; head: string; createdAt: Date; updatedAt: Date }[]
  >`
    INSERT INTO "Department" (id, name, head, "organizationId", "createdAt", "updatedAt")
    VALUES (${id}, ${name}, ${head}, ${orgId}, ${now}, ${now})
    RETURNING id, name, head, "createdAt", "updatedAt"
  `;
  return rows[0];
}

export async function createApplicationRow(data: {
  name: string;
  departmentId: string;
  type: string;
  productOwner: string;
  techLead: string;
  support: string;
  criticality: string;
}) {
  const orgId = await getDefaultOrganizationId();
  if (!orgId) {
    return prisma.application.create({
      data,
      include: { department: true, _count: { select: { environments: true, releaseLinks: true, bookings: true } } },
    });
  }
  const id = newId();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "Application" (id, name, "departmentId", type, "productOwner", "techLead", support, criticality, "organizationId", "createdAt", "updatedAt")
    VALUES (${id}, ${data.name}, ${data.departmentId}, ${data.type}, ${data.productOwner}, ${data.techLead}, ${data.support}, ${data.criticality}, ${orgId}, ${now}, ${now})
  `;
  return prisma.application.findUniqueOrThrow({
    where: { id },
    include: { department: true, _count: { select: { environments: true, releaseLinks: true, bookings: true } } },
  });
}

export async function createUserRow(data: {
  userId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  manager: string | null;
  accessLevel: string;
  status: string;
}) {
  const orgId = await getDefaultOrganizationId();
  if (!orgId) {
    return prisma.user.create({ data });
  }
  const id = newId();
  const now = new Date();
  const rows = await prisma.$queryRaw<
    {
      id: string;
      userId: string;
      name: string;
      email: string;
      role: string;
      department: string;
      manager: string | null;
      accessLevel: string;
      status: string;
      lastLogin: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`
    INSERT INTO "User" (id, "userId", name, email, role, department, manager, "accessLevel", status, "organizationId", "createdAt", "updatedAt")
    VALUES (${id}, ${data.userId}, ${data.name}, ${data.email}, ${data.role}, ${data.department}, ${data.manager}, ${data.accessLevel}, ${data.status}, ${orgId}, ${now}, ${now})
    RETURNING id, "userId", name, email, role, department, manager, "accessLevel", status, "lastLogin", "createdAt", "updatedAt"
  `;
  return rows[0];
}

export type CreateEnvBookingInput = {
  bookingCode: string;
  applicationId: string;
  environmentId?: string | null;
  bookedBy: string;
  team: string;
  departmentName?: string | null;
  fromDate: Date;
  toDate: Date;
  purpose?: string | null;
  releaseId?: string | null;
  status?: string;
  conflictFlag?: boolean;
  testEnvCode?: string | null;
  testStart?: Date | null;
  testEnd?: Date | null;
  testDays?: number | null;
  uatEnvCode?: string | null;
  uatStart?: Date | null;
  uatEnd?: Date | null;
  uatDays?: number | null;
  preProdEnvCode?: string | null;
  preProdStart?: Date | null;
  preProdEnd?: Date | null;
  preProdDays?: number | null;
};

/**
 * Create EnvBooking. Live Neon (v2) requires organizationId which is absent from
 * the v1 Prisma schema — insert via raw SQL when an org exists.
 */
export async function createEnvBookingRow(data: CreateEnvBookingInput) {
  const orgId = await getDefaultOrganizationId();
  const include = {
    application: { include: { department: true } },
    release: { select: { id: true, releaseCode: true } },
  } as const;

  if (!orgId) {
    return prisma.envBooking.create({
      data: {
        bookingCode: data.bookingCode,
        applicationId: data.applicationId,
        environmentId: data.environmentId ?? null,
        bookedBy: data.bookedBy,
        team: data.team,
        departmentName: data.departmentName ?? null,
        fromDate: data.fromDate,
        toDate: data.toDate,
        purpose: data.purpose ?? null,
        releaseId: data.releaseId ?? null,
        status: data.status ?? "BOOKED",
        conflictFlag: data.conflictFlag ?? false,
        testEnvCode: data.testEnvCode ?? null,
        testStart: data.testStart ?? null,
        testEnd: data.testEnd ?? null,
        testDays: data.testDays ?? null,
        uatEnvCode: data.uatEnvCode ?? null,
        uatStart: data.uatStart ?? null,
        uatEnd: data.uatEnd ?? null,
        uatDays: data.uatDays ?? null,
        preProdEnvCode: data.preProdEnvCode ?? null,
        preProdStart: data.preProdStart ?? null,
        preProdEnd: data.preProdEnd ?? null,
        preProdDays: data.preProdDays ?? null,
      },
      include,
    });
  }

  const id = newId();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "EnvBooking" (
      id, "organizationId", "bookingCode", "applicationId", "environmentId",
      "bookedBy", team, "departmentName", "fromDate", "toDate", purpose,
      "releaseId", status, "conflictFlag", "testEnvCode", "testStart", "testEnd",
      "testDays", "uatEnvCode", "uatStart", "uatEnd", "uatDays",
      "preProdEnvCode", "preProdStart", "preProdEnd", "preProdDays",
      "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${orgId}, ${data.bookingCode}, ${data.applicationId}, ${data.environmentId ?? null},
      ${data.bookedBy}, ${data.team}, ${data.departmentName ?? null}, ${data.fromDate}, ${data.toDate},
      ${data.purpose ?? null}, ${data.releaseId ?? null}, ${data.status ?? "BOOKED"},
      ${data.conflictFlag ?? false}, ${data.testEnvCode ?? null}, ${data.testStart ?? null},
      ${data.testEnd ?? null}, ${data.testDays ?? null},
      ${data.uatEnvCode ?? null}, ${data.uatStart ?? null}, ${data.uatEnd ?? null}, ${data.uatDays ?? null},
      ${data.preProdEnvCode ?? null}, ${data.preProdStart ?? null}, ${data.preProdEnd ?? null}, ${data.preProdDays ?? null},
      ${now}, ${now}
    )
  `;

  return prisma.envBooking.findUniqueOrThrow({
    where: { id },
    include,
  });
}

export type CreateRiskInput = {
  riskCode: string;
  releaseId: string;
  applicationName?: string | null;
  departmentName?: string | null;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  affectedArea?: string | null;
  mitigationStrategy?: string | null;
  riskOwnerId?: string | null;
  status: string;
  notes?: string | null;
  sourceOrder?: number | null;
};

/** Creates a Risk while satisfying the live v2 Organization FK when present. */
export async function createRiskRow(data: CreateRiskInput) {
  const include = {
    release: { select: { id: true, releaseCode: true, name: true } },
    riskOwner: { select: { id: true, userId: true, name: true } },
  } as const;
  return createWithOrgCompatibility(
    () => prisma.risk.create({
      data: { ...data, riskScore: data.likelihood * data.impact },
      include,
    }),
    async (orgId) => {
      const id = newId();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "Risk" (
          id, "organizationId", "riskCode", "releaseId", "applicationName",
          "departmentName", category, description, likelihood, impact, "riskScore",
          "affectedArea", "mitigationStrategy", "riskOwnerId", status, notes,
          "sourceOrder", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${orgId}, ${data.riskCode}, ${data.releaseId}, ${data.applicationName ?? null},
          ${data.departmentName ?? null}, ${data.category}, ${data.description},
          ${data.likelihood}, ${data.impact}, ${data.likelihood * data.impact},
          ${data.affectedArea ?? null}, ${data.mitigationStrategy ?? null},
          ${data.riskOwnerId ?? null}, ${data.status}, ${data.notes ?? null},
          ${data.sourceOrder ?? null}, ${now}, ${now}
        )
      `;
      return prisma.risk.findUniqueOrThrow({ where: { id }, include });
    }
  );
}

export type CreateDriftInput = {
  driftCode: string;
  releaseId: string;
  applicationId: string;
  departmentName?: string | null;
  environmentName: string;
  driftType: string;
  driftCategory?: string | null;
  detectedDate: Date;
  severity: string;
  description: string;
  impactOnRelease?: string | null;
  remediationAction?: string | null;
  status: string;
  etaToFix?: Date | null;
  sourceOrder?: number | null;
};

/** Creates a Drift while satisfying the live v2 Organization FK when present. */
export async function createDriftRow(data: CreateDriftInput) {
  const include = {
    release: { select: { id: true, releaseCode: true, name: true } },
    application: { select: { id: true, name: true } },
  } as const;
  return createWithOrgCompatibility(
    () => prisma.drift.create({ data, include }),
    async (orgId) => {
      const id = newId();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "Drift" (
          id, "organizationId", "driftCode", "releaseId", "applicationId",
          "departmentName", "environmentName", "driftType", "driftCategory",
          "detectedDate", severity, description, "impactOnRelease",
          "remediationAction", status, "etaToFix", "sourceOrder", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${orgId}, ${data.driftCode}, ${data.releaseId}, ${data.applicationId},
          ${data.departmentName ?? null}, ${data.environmentName}, ${data.driftType},
          ${data.driftCategory ?? null}, ${data.detectedDate}, ${data.severity},
          ${data.description}, ${data.impactOnRelease ?? null},
          ${data.remediationAction ?? null}, ${data.status}, ${data.etaToFix ?? null},
          ${data.sourceOrder ?? null}, ${now}, ${now}
        )
      `;
      return prisma.drift.findUniqueOrThrow({ where: { id }, include });
    }
  );
}

export type CreateApprovalInput = {
  approvalCode: string;
  releaseId: string;
  applicationName?: string | null;
  departmentName?: string | null;
  approvalType: string;
  approverId: string;
  submittedDate: Date;
  decisionDate?: Date | null;
  decision: string;
  comments?: string | null;
  cabMeetingId?: string | null;
  sourceOrder?: number | null;
};

/** Creates an Approval while satisfying the live v2 Organization FK when present. */
export async function createApprovalRow(data: CreateApprovalInput) {
  const include = {
    release: { select: { id: true, releaseCode: true, name: true } },
    approver: { select: { id: true, userId: true, name: true } },
  } as const;
  return createWithOrgCompatibility(
    () => prisma.approval.create({ data, include }),
    async (orgId) => {
      const id = newId();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "Approval" (
          id, "organizationId", "approvalCode", "releaseId", "applicationName",
          "departmentName", "approvalType", "approverId", "submittedDate",
          "decisionDate", decision, comments, "cabMeetingId", "sourceOrder",
          "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${orgId}, ${data.approvalCode}, ${data.releaseId},
          ${data.applicationName ?? null}, ${data.departmentName ?? null},
          ${data.approvalType}, ${data.approverId}, ${data.submittedDate},
          ${data.decisionDate ?? null}, ${data.decision}, ${data.comments ?? null},
          ${data.cabMeetingId ?? null}, ${data.sourceOrder ?? null}, ${now}, ${now}
        )
      `;
      return prisma.approval.findUniqueOrThrow({ where: { id }, include });
    }
  );
}

export type CreateLeaveInput = {
  leaveCode: string;
  userId: string;
  leaveStart: Date;
  leaveEnd: Date;
  leaveType: string;
  days: number;
  riskImpact?: string | null;
  riskScore: number;
  releaseIds?: string[];
  sourceOrder?: number | null;
};

/** Creates Leave and affected-release links with live v2 Organization compatibility. */
export async function createLeaveRow(data: CreateLeaveInput) {
  const include = {
    user: { select: { id: true, userId: true, name: true } },
    affectedReleases: {
      include: { release: { select: { id: true, releaseCode: true, name: true } } },
    },
  } as const;
  const { releaseIds, ...leaveData } = data;
  return createWithOrgCompatibility(
    () =>
      prisma.leaveRecord.create({
        data: {
          ...leaveData,
          affectedReleases: releaseIds?.length
            ? { create: releaseIds.map((releaseId) => ({ releaseId })) }
            : undefined,
        },
        include,
      }),
    async (orgId) => {
      const id = newId();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "LeaveRecord" (
          id, "organizationId", "leaveCode", "userId", "leaveStart", "leaveEnd",
          "leaveType", days, "riskImpact", "riskScore", "sourceOrder",
          "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${orgId}, ${data.leaveCode}, ${data.userId}, ${data.leaveStart},
          ${data.leaveEnd}, ${data.leaveType}, ${data.days}, ${data.riskImpact ?? null},
          ${data.riskScore}, ${data.sourceOrder ?? null}, ${now}, ${now}
        )
      `;
      if (releaseIds?.length) {
        await prisma.leaveRecordRelease.createMany({
          data: releaseIds.map((releaseId) => ({ leaveRecordId: id, releaseId })),
        });
      }
      return prisma.leaveRecord.findUniqueOrThrow({ where: { id }, include });
    }
  );
}

export type CreateEnvironmentVersionInput = {
  applicationId: string;
  environmentId: string;
  version: string;
  buildNumber?: string | null;
  deployDate?: Date | null;
  updatedBy?: string | null;
  status?: string | null;
  notes?: string | null;
  sourceOrder?: number | null;
};

/**
 * Creates an EnvironmentVersion through the same compatibility primitive.
 * Live v2 currently has no Organization column for this table, so standard
 * Prisma create is intentionally used in both schema generations.
 */
export async function createEnvironmentVersionRow(data: CreateEnvironmentVersionInput) {
  const include = {
    environment: true,
    application: { include: { department: true } },
  } as const;
  return createWithOrgCompatibility(() =>
    prisma.environmentVersion.create({ data, include })
  );
}

export type CreateReleaseInput = {
  releaseCode: string;
  name: string;
  programProject?: string | null;
  owner: string;
  status: string;
  releaseDate: Date;
  priority: string;
  impact: string;
  departmentId: string;
  notes?: string | null;
  dependencies?: string | null;
  releaseSize?: string | null;
  cabDate?: Date | null;
  startDate?: Date | null;
  testEnvRequired?: string | null;
  uatEnvRequired?: string | null;
  conflictFlag?: boolean;
  conflictId?: string | null;
  readinessPercent?: number | null;
  blockers?: string | null;
  vendorMaintenance?: string | null;
  changeFreeze?: string | null;
  regulatory?: string | null;
  approvalStatus?: string | null;
  rollbackPlan?: string | null;
  goLiveChecklistPercent?: number | null;
  deploymentWindow?: string | null;
  releaseOwnerId?: string | null;
};

/** Creates a Release in both local v1 and organization-aware live v2 schemas. */
export async function createReleaseRow(data: CreateReleaseInput) {
  return createWithOrgCompatibility(
    () => prisma.release.create({ data }),
    async (orgId) => {
      const id = newId();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "Release" (
          id, "organizationId", "releaseCode", name, "programProject", owner,
          status, "releaseDate", priority, impact, "departmentId", notes,
          dependencies, "releaseSize", "cabDate", "startDate", "testEnvRequired",
          "uatEnvRequired", "conflictFlag", "conflictId", "readinessPercent",
          blockers, "vendorMaintenance", "changeFreeze", regulatory,
          "approvalStatus", "rollbackPlan", "goLiveChecklistPercent",
          "deploymentWindow", "releaseOwnerId", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${orgId}, ${data.releaseCode}, ${data.name}, ${data.programProject ?? null},
          ${data.owner}, ${data.status}, ${data.releaseDate}, ${data.priority},
          ${data.impact}, ${data.departmentId}, ${data.notes ?? null},
          ${data.dependencies ?? null}, ${data.releaseSize ?? null}, ${data.cabDate ?? null},
          ${data.startDate ?? null}, ${data.testEnvRequired ?? null},
          ${data.uatEnvRequired ?? null}, ${data.conflictFlag ?? false},
          ${data.conflictId ?? null}, ${data.readinessPercent ?? null},
          ${data.blockers ?? null}, ${data.vendorMaintenance ?? null},
          ${data.changeFreeze ?? null}, ${data.regulatory ?? null},
          ${data.approvalStatus ?? null}, ${data.rollbackPlan ?? null},
          ${data.goLiveChecklistPercent ?? null}, ${data.deploymentWindow ?? null},
          ${data.releaseOwnerId ?? null}, ${now}, ${now}
        )
      `;
      return prisma.release.findUniqueOrThrow({ where: { id } });
    }
  );
}

export type CreateConnectorInput = {
  name: string;
  type: string;
  authType: string;
  baseUrl?: string | null;
  credentials: string;
  config?: object | null;
  pollInterval?: number;
  enabled?: boolean;
  createdBy?: string | null;
  status?: string;
};

/**
 * Create Connector. Live Neon requires organizationId which is absent from the
 * v1 Prisma schema — insert via raw SQL when an Organization row exists.
 */
export async function createConnectorRow(data: CreateConnectorInput) {
  return createWithOrgCompatibility(
    () =>
      prisma.connector.create({
        data: {
          name: data.name,
          type: data.type,
          authType: data.authType,
          baseUrl: data.baseUrl ?? null,
          credentials: data.credentials,
          config: data.config ?? undefined,
          pollInterval: data.pollInterval ?? 15,
          enabled: data.enabled ?? true,
          createdBy: data.createdBy ?? null,
          status: data.status ?? "PENDING",
        },
      }),
    async (orgId) => {
      const id = newId();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "Connector" (
          id, name, type, "authType", "baseUrl", credentials, config,
          "pollInterval", status, enabled, "createdBy", "organizationId",
          "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${data.name}, ${data.type}, ${data.authType}, ${data.baseUrl ?? null},
          ${data.credentials}, ${JSON.stringify(data.config ?? null)}::jsonb,
          ${data.pollInterval ?? 15}, ${data.status ?? "PENDING"}, ${data.enabled ?? true},
          ${data.createdBy ?? null}, ${orgId}, ${now}, ${now}
        )
      `;
      return prisma.connector.findUniqueOrThrow({ where: { id } });
    }
  );
}
