import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  filterSeedConflicts,
} from "@/lib/conflict-view";
import { prisma } from "@/lib/prisma";
import { sp, str } from "@/lib/list-api-filters";

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
  const rows = dbRows.map((row) => ({
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
  }));

  const conflicts = filterSeedConflicts(rows, {
    departmentName: deptRec?.name,
    applicationName: appRec?.name,
    status: str(params, "status"),
    priority: str(params, "priority"),
    assignedToQ: str(params, "assignedTo"),
    conflictCodeQ: str(params, "conflictId") ?? str(params, "conflictCode"),
    release1CodeQ: str(params, "release1"),
    release2CodeQ: str(params, "release2"),
    conflictingEnvironmentQ: str(params, "conflictEnv"),
    environmentConflictType: str(params, "conflictType"),
    notesQ: str(params, "notes"),
  });

  return NextResponse.json(conflicts);
}
