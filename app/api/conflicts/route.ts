import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  filterSeedConflicts,
} from "@/lib/conflict-view";
import { loadConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config-db";
import { resolveCreateLifecycleStatus } from "@/lib/entity-lifecycle-create-guard";
import { prisma } from "@/lib/prisma";
import { sp, str } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createConflictSchema } from "@/lib/validation/conflict";
import {
  guardReleaseFullyLocked,
  loadGuardReleaseConfig,
} from "@/lib/release-related-entity-guards";

async function nextConflictCode(): Promise<string> {
  const rows = await prisma.environmentConflict.findMany({ select: { conflictCode: true } });
  const next = rows.reduce((max, row) => {
    const match = row.conflictCode.match(/^CNF-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `CNF-${String(next).padStart(4, "0")}`;
}

function mapConflictRow(
  row: {
    id: string;
    conflictCode: string;
    status: string;
    priority: string;
    assignedTo: string | null;
    release1Code: string;
    release2Code: string;
    applicationName: string;
    departmentName: string;
    conflictingEnvironment: string;
    environmentConflictType: string;
    notes: string | null;
  },
  releaseIdByCode: Map<string, string>
) {
  return {
    id: row.id,
    conflictCode: row.conflictCode,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assignedTo ?? "",
    release1Code: row.release1Code,
    release2Code: row.release2Code,
    release1DbId: releaseIdByCode.get(row.release1Code) ?? null,
    release2DbId: releaseIdByCode.get(row.release2Code) ?? null,
    application: row.applicationName,
    department: row.departmentName,
    conflictingEnvironment: row.conflictingEnvironment,
    environmentConflictType: row.environmentConflictType,
    notes: row.notes,
  };
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);
  const deptId = str(params, "dept");
  const appId = str(params, "app");

  const [deptRec, appRec, releases] = await Promise.all([
    deptId ? prisma.department.findUnique({ where: { id: deptId }, select: { name: true } }) : null,
    appId ? prisma.application.findUnique({ where: { id: appId }, select: { name: true } }) : null,
    prisma.release.findMany({ select: { id: true, releaseCode: true } }),
  ]);

  const releaseIdByCode = new Map(releases.map((r) => [r.releaseCode, r.id]));

  const dbRows = await prisma.environmentConflict.findMany({
    orderBy: { sourceOrder: "asc" },
  });
  const rows = dbRows.map((row) => mapConflictRow(row, releaseIdByCode));

  const conflicts = filterSeedConflicts(rows, {
    departmentName: deptRec?.name,
    applicationName: appRec?.name,
    status: str(params, "status"),
    priority: str(params, "priority"),
    assignedToQ: str(params, "assignedTo"),
    conflictCodeQ: str(params, "conflictId") ?? str(params, "conflictCode"),
    release1CodeQ: str(params, "release1"),
    release2CodeQ: str(params, "release2"),
    eitherReleaseQ: str(params, "release"),
    conflictingEnvironmentQ: str(params, "conflictEnv"),
    environmentConflictType: str(params, "conflictType"),
    notesQ: str(params, "notes"),
  });

  return NextResponse.json(conflicts);
}

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const parsed = createConflictSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  let status: string;
  let statusKey: string | undefined;
  try {
    const loaded = await loadConflictLifecycleConfig(user!.id);
    const resolved = resolveCreateLifecycleStatus(loaded.config, body.status, "conflict");
    if (!resolved.ok) return resolved.response;
    status = resolved.status;
    statusKey = resolved.statusKey;
  } catch (err) {
    console.error("[conflicts-create] lifecycle config load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Conflict lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  const [release1, release2, maxOrder, releases] = await Promise.all([
    prisma.release.findUnique({
      where: { releaseCode: body.release1Code },
      select: { id: true, releaseCode: true, status: true, lifecycleConfigVersionId: true },
    }),
    prisma.release.findUnique({
      where: { releaseCode: body.release2Code },
      select: { id: true, releaseCode: true, status: true, lifecycleConfigVersionId: true },
    }),
    prisma.environmentConflict.aggregate({ _max: { sourceOrder: true } }),
    prisma.release.findMany({ select: { id: true, releaseCode: true } }),
  ]);
  if (!release1) {
    return NextResponse.json({ error: "Release 1 not found" }, { status: 400 });
  }
  if (!release2) {
    return NextResponse.json({ error: "Release 2 not found" }, { status: 400 });
  }
  for (const linked of [release1, release2]) {
    const linkedConfig = await loadGuardReleaseConfig(
      user!.id,
      linked.lifecycleConfigVersionId
    );
    const cancelledLock = guardReleaseFullyLocked(linked.status, linkedConfig);
    if (!cancelledLock.ok) return cancelledLock.response;
  }

  const row = await prisma.environmentConflict.create({
    data: {
      conflictCode: await nextConflictCode(),
      status,
      statusKey,
      priority: body.priority,
      release1Code: body.release1Code,
      release2Code: body.release2Code,
      applicationName: body.application,
      departmentName: body.department,
      conflictingEnvironment: body.conflictingEnvironment,
      environmentConflictType: body.environmentConflictType,
      assignedTo: body.assignedTo ?? null,
      notes: body.notes ?? null,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
  });

  const releaseIdByCode = new Map(releases.map((r) => [r.releaseCode, r.id]));
  return NextResponse.json(mapConflictRow(row, releaseIdByCode), { status: 201 });
}
