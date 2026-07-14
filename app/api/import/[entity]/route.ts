import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsvText } from "@/lib/csv-parse";

const ALLOWED_ENTITIES = new Set(["departments", "applications", "environments"]);

export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  if (!ALLOWED_ENTITIES.has(entity)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required" }, { status: 400 });
  }

  // Do not trust client MIME alone — enforce size and treat content as CSV text.
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  let rows: string[][];
  try {
    rows = parseCsvText(await file.text());
  } catch {
    return NextResponse.json({ error: "Invalid CSV" }, { status: 400 });
  }

  if (rows.length > MAX_CSV_ROWS + 1) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_CSV_ROWS})` }, { status: 400 });
  }

  const [header, ...data] = rows;
  if (!header?.length) return NextResponse.json({ error: "Empty CSV" }, { status: 400 });

  let imported = 0;

  if (entity === "departments") {
    for (const row of data) {
      if (!row[0]) continue;
      await prisma.department.upsert({
        where: { name: row[0] },
        create: { name: row[0], head: row[1] ?? "" },
        update: { head: row[1] ?? "" },
      });
      imported++;
    }
  } else if (entity === "applications") {
    for (const row of data) {
      const dept = await prisma.department.findFirst({ where: { name: row[1] } });
      if (!row[0] || !dept) continue;
      await prisma.application.upsert({
        where: { name_departmentId: { name: row[0], departmentId: dept.id } },
        create: {
          name: row[0],
          departmentId: dept.id,
          type: row[2] ?? "",
          productOwner: row[3] ?? "",
          techLead: row[4] ?? "",
          support: row[5] ?? "",
          criticality: row[6] ?? "Medium",
        },
        update: {
          type: row[2] ?? "",
          productOwner: row[3] ?? "",
          techLead: row[4] ?? "",
          support: row[5] ?? "",
          criticality: row[6] ?? "Medium",
        },
      });
      imported++;
    }
  } else if (entity === "environments") {
    for (const row of data) {
      const app = await prisma.application.findFirst({ where: { name: row[0] } });
      if (!app || !row[1]) continue;
      await prisma.environment.upsert({
        where: { applicationId_name: { applicationId: app.id, name: row[1] } },
        create: {
          applicationId: app.id,
          name: row[1],
          type: row[2] ?? "Dev",
          owner: row[3] ?? "",
          lastDbRefresh: row[4] ? new Date(row[4]) : null,
          status: row[5] ?? "Available",
        },
        update: {
          type: row[2] ?? "Dev",
          owner: row[3] ?? "",
          lastDbRefresh: row[4] ? new Date(row[4]) : null,
          status: row[5] ?? "Available",
        },
      });
      imported++;
    }
  }

  return NextResponse.json({ imported });
}
