import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { buildVersionMatrix } from "@/lib/db-environment-desk";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { createEnvironmentVersionSchema } from "@/lib/validation/environment-version";
import { createEnvironmentVersionRow } from "@/lib/org-compat";

export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const [apps, versions] = await Promise.all([
    prisma.application.findMany({ include: { department: true, environments: true } }),
    prisma.environmentVersion.findMany({ include: { environment: true, application: { include: { department: true } } } }),
  ]);

  return NextResponse.json({ matrix: buildVersionMatrix(apps, versions), apps });
}

/** Creates an editor-authorized version for a verified application/environment pair. */
export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const parsed = createEnvironmentVersionSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const environment = await prisma.environment.findUnique({
    where: { id: body.environmentId },
    include: { application: { include: { department: true } } },
  });
  if (!environment || environment.applicationId !== body.applicationId) {
    return NextResponse.json(
      { error: "Environment was not found for the selected application" },
      { status: 404 }
    );
  }

  const existing = await prisma.environmentVersion.findUnique({
    where: {
      applicationId_environmentId: {
        applicationId: body.applicationId,
        environmentId: body.environmentId,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A version already exists for this application and environment" },
      { status: 409 }
    );
  }

  const row = await createEnvironmentVersionRow({
    applicationId: body.applicationId,
    environmentId: body.environmentId,
    version: body.version,
    buildNumber: body.buildNumber ?? null,
    deployDate: body.deployDate ? new Date(body.deployDate) : null,
    status: body.status ?? null,
    notes: body.notes ?? null,
    updatedBy: user!.name,
  });

  return NextResponse.json(row, { status: 201 });
}
