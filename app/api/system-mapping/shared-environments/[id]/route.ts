import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  parseSystemMappingBody,
  parseSystemMappingId,
  systemMappingErrorResponse,
} from "@/lib/system-mapping-api";
import { patchSharedEnvironmentSchema } from "@/lib/validation/system-mapping";

type RouteContext = { params: Promise<{ id: string }> };

/** Updates strictly allowlisted shared-environment fields. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = await parseSystemMappingBody(request, patchSharedEnvironmentSchema);
  if (parsed.error) return parsed.error;
  const id = parseSystemMappingId((await params).id);
  if (id.error) return id.error;

  try {
    const item = await prisma.systemSharedEnvironment.update({
      where: { id: id.data },
      data: parsed.data,
    });
    return NextResponse.json(item);
  } catch (routeError) {
    return systemMappingErrorResponse(
      routeError,
      "system-mapping shared-environments PATCH failed"
    );
  }
}

/** Deletes one shared environment by identifier. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { error } = await requireRole("editor");
  if (error) return error;
  const id = parseSystemMappingId((await params).id);
  if (id.error) return id.error;

  try {
    await prisma.systemSharedEnvironment.delete({ where: { id: id.data } });
    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return systemMappingErrorResponse(
      routeError,
      "system-mapping shared-environments DELETE failed"
    );
  }
}
