import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import {
  buildSignoffRow,
  parseSignoffCode,
  parseSignoffRowId,
  SIGNOFF_RELEASE_LIST_SELECT,
} from "@/lib/signoff-list";

type Params = { params: Promise<{ id: string }> };

/**
 * One sign-off checklist item (Release field projection). Lookup by row id or display code.
 */
export async function GET(_req: Request, { params }: Params) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const { config } = await loadSignoffLifecycleConfig(user!.id);
  const types = config.types.filter((type) => type.enabled && type.releaseField);

  const parsedId = parseSignoffRowId(id);
  const parsedCode = parsedId ? null : parseSignoffCode(id, types.map((type) => type.key));

  const release = parsedId
    ? await prisma.release.findFirst({
        where: { OR: [{ id: parsedId.releaseId }, { releaseCode: parsedId.releaseId }] },
        select: SIGNOFF_RELEASE_LIST_SELECT,
      })
    : parsedCode
      ? await prisma.release.findFirst({
          where: { releaseCode: parsedCode.releaseCode },
          select: SIGNOFF_RELEASE_LIST_SELECT,
        })
      : null;

  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const type = parsedId
    ? types.find((item) => item.releaseField === parsedId.field)
    : types.find((item) => item.key === parsedCode?.typeKey);

  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = buildSignoffRow(release, type);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
