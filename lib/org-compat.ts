import { prisma } from "./prisma";

let cachedOrgId: string | null | undefined;

/** v2 Neon DB has Organization FK columns not in v1 Prisma schema */
export async function getDefaultOrganizationId(): Promise<string | null> {
  if (cachedOrgId !== undefined) return cachedOrgId;
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Organization" LIMIT 1`;
    cachedOrgId = rows[0]?.id ?? null;
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
