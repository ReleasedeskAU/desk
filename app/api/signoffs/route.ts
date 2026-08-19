import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { sp, str } from "@/lib/list-api-filters";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import {
  filterSignoffRows,
  flattenReleaseSignoffs,
  SIGNOFF_RELEASE_LIST_SELECT,
} from "@/lib/signoff-list";

/**
 * Lists sign-off checklist items across releases (projection of Release fields).
 * Query params: status, type, required, release, releaseName, signoffCode, application, department, owner.
 */
export async function GET(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const q = sp(req);
  const [{ config }, releases] = await Promise.all([
    loadSignoffLifecycleConfig(user!.id),
    prisma.release.findMany({
      select: SIGNOFF_RELEASE_LIST_SELECT,
      orderBy: { releaseCode: "asc" },
    }),
  ]);

  const rows = filterSignoffRows(flattenReleaseSignoffs(releases, config), {
    status: str(q, "status"),
    type: str(q, "type"),
    required: str(q, "required"),
    release: str(q, "release"),
    releaseName: str(q, "releaseName"),
    signoffCode: str(q, "signoffCode"),
    application: str(q, "application"),
    department: str(q, "department"),
    owner: str(q, "owner"),
  });
  return NextResponse.json(rows);
}
