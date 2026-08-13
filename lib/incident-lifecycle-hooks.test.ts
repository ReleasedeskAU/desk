/**
 * Run: npx tsx --test lib/incident-lifecycle-hooks.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";
import { createReleaseRow } from "@/lib/org-compat";
import { cascadeUnblockReleaseOnIncidentResolved } from "@/lib/lifecycle-event-hooks";

const skipDb = process.env.FIELD_LOCK_WIRING_SKIP_DB === "1";

describe("cascadeUnblockReleaseOnIncidentResolved", () => {
  it(
    "returns a Blocked release when the last blocking incident is already resolved",
    { skip: skipDb },
    async () => {
      const dept = await prisma.department.findFirst({ select: { id: true } });
      const app = await prisma.application.findFirst({ select: { id: true } });
      assert.ok(dept && app, "need department + application rows");

      const code = `INCUB-${Date.now().toString(36).toUpperCase()}`;
      const release = await createReleaseRow({
        releaseCode: code,
        name: "incident unblock",
        programProject: "N/A",
        owner: "Test",
        status: "Blocked",
        statusKey: "blocked",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });
      await prisma.releaseAuditEvent.create({
        data: {
          releaseId: release.id,
          actor: "system",
          action: "status_change",
          detail: "Status changed to Ready to deploy",
        },
      });
      const incident = await prisma.incident.create({
        data: {
          incidentCode: `${code}-I`,
          timestamp: new Date(),
          applicationId: app.id,
          severity: "P1 - Critical",
          title: "incident unblock",
          status: "Resolved",
          statusKey: "resolved",
          impact: "Down",
          relatedReleaseCode: code,
          environmentName: "Prod",
        },
      });
      try {
        const result = await cascadeUnblockReleaseOnIncidentResolved(
          code,
          "status_transition_audit_scope"
        );
        assert.equal(result.unblocked, true);
        const after = await prisma.release.findUniqueOrThrow({
          where: { id: release.id },
          select: { status: true },
        });
        assert.equal(after.status, "Ready to deploy");
      } finally {
        await prisma.incident.delete({ where: { id: incident.id } }).catch(() => undefined);
        await prisma.releaseAuditEvent
          .deleteMany({ where: { releaseId: release.id } })
          .catch(() => undefined);
        await prisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
      }
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
