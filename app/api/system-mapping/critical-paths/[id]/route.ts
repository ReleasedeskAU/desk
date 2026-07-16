import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  parseSystemMappingBody,
  parseSystemMappingId,
  systemMappingErrorResponse,
} from "@/lib/system-mapping-api";
import { patchCriticalPathSchema } from "@/lib/validation/system-mapping";

type RouteContext = { params: Promise<{ id: string }> };

/** Updates strictly allowlisted critical-path fields. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = await parseSystemMappingBody(request, patchCriticalPathSchema);
  if (parsed.error) return parsed.error;
  const id = parseSystemMappingId((await params).id);
  if (id.error) return id.error;

  try {
    const item = await prisma.systemCriticalPath.update({
      where: { id: id.data },
      data: parsed.data,
    });
    return NextResponse.json(item);
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping critical-paths PATCH failed");
  }
}

/** Deletes one critical integration path by identifier. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { error } = await requireRole("editor");
  if (error) return error;
  const id = parseSystemMappingId((await params).id);
  if (id.error) return id.error;

  try {
    await prisma.systemCriticalPath.delete({ where: { id: id.data } });
    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping critical-paths DELETE failed");
  }
}
