import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { blockerWhere, sp, str } from "@/lib/list-api-filters";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import { resolveCreateLifecycleStatus } from "@/lib/entity-lifecycle-create-guard";

const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

function mapBlockerRow(
  row: {
    id: string;
    blockerCode: string;
    releaseCode: string;
    releaseName: string;
    departmentName: string;
    applicationName: string;
    blockerType: string;
    blockerDescription: string;
    severity: string;
    raisedDate: Date;
    raisedBy: string;
    assignedTo: string | null;
    status: string;
    targetResolutionDate: Date | null;
    actualResolutionDate: Date | null;
    daysOpen: number;
    escalationLevel: string;
    rootCause: string | null;
    resolutionNotes: string | null;
    impactOnRelease: string;
  },
  releaseDbId: string | null
) {
  return {
    id: row.id,
    blockerCode: row.blockerCode,
    releaseCode: row.releaseCode,
    releaseName: row.releaseName,
    releaseDbId,
    department: row.departmentName,
    application: row.applicationName,
    blockerType: row.blockerType,
    blockerDescription: row.blockerDescription,
    severity: row.severity,
    raisedDate: dateOnly(row.raisedDate),
    raisedBy: row.raisedBy,
    assignedTo: row.assignedTo ?? "",
    status: row.status,
    targetResolutionDate: dateOnly(row.targetResolutionDate),
    actualResolutionDate: dateOnly(row.actualResolutionDate),
    daysOpen: row.daysOpen,
    escalationLevel: row.escalationLevel,
    rootCause: row.rootCause ?? "",
    resolutionNotes: row.resolutionNotes ?? "",
    impactOnRelease: row.impactOnRelease,
  };
}

async function nextBlockerCode() {
  const latest = await prisma.blocker.findFirst({
    orderBy: { blockerCode: "desc" },
    select: { blockerCode: true },
  });
  const match = latest?.blockerCode.match(/^BLK-(\d+)$/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `BLK-${String(next).padStart(4, "0")}`;
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

  if (deptRec?.name) params.set("departmentName", deptRec.name);
  if (appRec?.name) params.set("applicationName", appRec.name);

  const releaseIdByCode = new Map(releases.map((r) => [r.releaseCode, r.id]));

  const rows = await prisma.blocker.findMany({
    where: blockerWhere(params),
    orderBy: { sourceOrder: "asc" },
  });

  return NextResponse.json(
    rows.map((row) => mapBlockerRow(row, releaseIdByCode.get(row.releaseCode) ?? null))
  );
}

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  const releaseCode = String(body.releaseCode ?? "").trim();
  if (!releaseCode) {
    return NextResponse.json({ error: "releaseCode is required" }, { status: 400 });
  }

  const release = await prisma.release.findUnique({
    where: { releaseCode },
    include: {
      department: { select: { name: true } },
      applications: { include: { application: { select: { name: true } } }, take: 1 },
    },
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const blockerType = String(body.blockerType ?? "").trim();
  const blockerDescription = String(body.blockerDescription ?? "").trim();
  const severity = String(body.severity ?? "").trim();
  const impactOnRelease = String(body.impactOnRelease ?? "").trim();
  const escalationLevel = String(body.escalationLevel ?? "L1 - Team Lead").trim();

  if (!blockerType || !blockerDescription || !severity || !impactOnRelease) {
    return NextResponse.json(
      { error: "blockerType, blockerDescription, severity, and impactOnRelease are required" },
      { status: 400 }
    );
  }

  const blockerCode =
    typeof body.blockerCode === "string" && body.blockerCode.trim()
      ? body.blockerCode.trim()
      : await nextBlockerCode();

  const existing = await prisma.blocker.findUnique({ where: { blockerCode } });
  if (existing) {
    return NextResponse.json({ error: `Blocker ${blockerCode} already exists` }, { status: 409 });
  }

  let status = String(body.status ?? "").trim();
  try {
    const loaded = await loadBlockerLifecycleConfig(user!.id);
    const resolved = resolveCreateLifecycleStatus(loaded.config, status, "blocker");
    if (!resolved.ok) return resolved.response;
    status = resolved.status;
  } catch (err) {
    console.error("[blockers-create] lifecycle config load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Blocker lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  const raisedDate = body.raisedDate ? new Date(body.raisedDate) : new Date();
  const applicationName =
    String(body.applicationName ?? "").trim() ||
    release.applications[0]?.application.name ||
    "Unknown";
  const departmentName =
    String(body.departmentName ?? "").trim() || release.department.name;
  const maxOrder = await prisma.blocker.aggregate({ _max: { sourceOrder: true } });

  const row = await prisma.blocker.create({
    data: {
      blockerCode,
      releaseCode: release.releaseCode,
      releaseName: release.name,
      departmentName,
      applicationName,
      blockerType,
      blockerDescription,
      severity,
      raisedDate,
      raisedBy: String(body.raisedBy ?? "").trim() || user!.name,
      assignedTo: body.assignedTo ? String(body.assignedTo).trim() : null,
      status,
      targetResolutionDate: body.targetResolutionDate ? new Date(body.targetResolutionDate) : null,
      actualResolutionDate: null,
      daysOpen: Number.isFinite(Number(body.daysOpen)) ? Number(body.daysOpen) : 0,
      escalationLevel,
      rootCause: body.rootCause ? String(body.rootCause).trim() : null,
      resolutionNotes: null,
      impactOnRelease,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
  });

  return NextResponse.json(mapBlockerRow(row, release.id), { status: 201 });
}
