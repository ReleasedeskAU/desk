/**
 * RD-124: POST /api/incidents requires Incident.relatedReleaseCode on create.
 *
 * Main path: create with a related release persists that stored field.
 * Edge: create without a related release does not persist and returns a clear error.
 *
 * Run: npx tsx --test lib/incident-create-related-release.test.ts
 * Set FIELD_LOCK_WIRING_SKIP_DB=1 to skip DB-backed cases.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import "@/lib/load-db-env-for-tests";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createReleaseRow } from "@/lib/org-compat";

const TEST_SCOPE = "rd124_incident_create_test_scope";
const skipDb = process.env.FIELD_LOCK_WIRING_SKIP_DB === "1";

describe("POST /api/incidents relatedReleaseCode (RD-124)", () => {
  async function installAuthMock(): Promise<boolean> {
    const { mock } = await import("node:test");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockAny = mock as any;
    if (typeof mockAny.module !== "function") return false;
    mockAny.module("@/lib/auth/api", {
      namedExports: {
        requireSession: async () => ({
          user: { id: TEST_SCOPE, role: "admin" },
          error: null,
        }),
        requireRole: async () => ({
          user: { id: TEST_SCOPE, role: "admin" },
          error: null,
        }),
      },
    });
    return true;
  }

  it(
    "persists a create when Related Release is selected",
    { skip: skipDb },
    async () => {
      if (!(await installAuthMock())) return;

      const dept = await prisma.department.findFirst({ select: { id: true } });
      const app = await prisma.application.findFirst({
        select: { id: true, name: true },
      });
      assert.ok(dept && app, "need department + application rows");

      const stamp = Date.now().toString(36).toUpperCase();
      const releaseCode = `RD124-${stamp}`;
      const title = `RD-124 persist ${stamp}`;
      const release = await createReleaseRow({
        releaseCode,
        name: "RD-124 persist release",
        programProject: "N/A",
        owner: "Test",
        status: "Draft",
        statusKey: "draft",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });

      let createdId: string | undefined;
      try {
        const { POST } = await import("@/app/api/incidents/route");
        const req = new NextRequest("http://local/api/incidents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            timestamp: "2026-09-08T10:00",
            applicationId: app.id,
            severity: "P2 - High",
            title,
            status: "Active",
            impact: "Degraded",
            environmentName: "Prod",
            relatedReleaseCode: releaseCode,
          }),
        });
        const res = await POST(req);
        assert.equal(res.status, 201);
        const body = (await res.json()) as {
          id?: string;
          relatedReleaseCode?: string | null;
        };
        createdId = body.id;
        assert.ok(createdId);
        assert.equal(body.relatedReleaseCode, releaseCode);

        const stored = await prisma.incident.findUnique({
          where: { id: createdId },
          select: { relatedReleaseCode: true, title: true },
        });
        assert.equal(stored?.relatedReleaseCode, releaseCode);
        assert.equal(stored?.title, title);
      } finally {
        if (createdId) {
          await prisma.incident.delete({ where: { id: createdId } }).catch(() => undefined);
        }
        await prisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
      }
    }
  );

  it(
    "does not persist a create without Related Release and returns a clear error",
    { skip: skipDb },
    async () => {
      if (!(await installAuthMock())) return;

      const app = await prisma.application.findFirst({ select: { id: true } });
      assert.ok(app, "need an application row");

      const stamp = Date.now().toString(36).toUpperCase();
      const title = `RD-124 reject ${stamp}`;
      const before = await prisma.incident.count({ where: { title } });

      const { POST } = await import("@/app/api/incidents/route");
      const req = new NextRequest("http://local/api/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timestamp: "2026-09-08T10:00",
          applicationId: app.id,
          severity: "P2 - High",
          title,
          status: "Active",
          impact: "Degraded",
          environmentName: "Prod",
        }),
      });
      const res = await POST(req);
      assert.equal(res.status, 400);
      const body = (await res.json()) as {
        error?: string;
        issues?: { path?: string; message?: string }[];
      };
      const issue = body.issues?.find((i) => i.path === "relatedReleaseCode");
      assert.equal(issue?.message, "Related Release is required");
      assert.equal(body.error, "Validation failed");

      const after = await prisma.incident.count({ where: { title } });
      assert.equal(after, before);
    }
  );
});

after(async () => {
  if (!skipDb) {
    await Promise.race([
      prisma.$disconnect().catch(() => undefined),
      new Promise((r) => setTimeout(r, 5_000)),
    ]);
  }
});
