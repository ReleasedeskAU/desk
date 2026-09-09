/**
 * RD-118 — dependency create must persist a valid payload and show a client-safe error.
 * Run: npx tsx --test lib/dependency-create.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { resolveCreateLifecycleStatus } from "./entity-lifecycle-create-guard";
import { createDefaultDependencyLifecycleConfig } from "./dependency-lifecycle-config";
import {
  dependencyCreateUserMessage,
  isSelfDependency,
  parseDependencyCreateBody,
  toReleaseDependencyCreateData,
} from "./dependency-create";

const config = createDefaultDependencyLifecycleConfig();

const validBody = {
  releaseId: "rel_from",
  dependsOnReleaseId: "rel_onto",
  dependencyType: "Hard",
  status: "Pending",
  impactIfBlocked: "Release Delay",
  notes: null,
};

describe("parseDependencyCreateBody", () => {
  it("accepts a valid create payload including a non-intake enabled status", () => {
    const parsed = parseDependencyCreateBody(validBody);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.data.status, "Pending");
      assert.equal(parsed.data.releaseId, "rel_from");
    }
  });

  it("does not persist when a required field is missing and returns an error the UI can show", () => {
    const parsed = parseDependencyCreateBody({
      dependsOnReleaseId: "rel_onto",
      dependencyType: "Hard",
      status: "Identified",
      impactIfBlocked: "Release Delay",
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    const message = dependencyCreateUserMessage(parsed);
    assert.ok(message.length > 0);
    assert.equal(message.includes("at "), false);
    assert.match(message, /required|releaseId/i);
    assert.ok(parsed.issues.some((issue) => issue.path === "releaseId"));
  });
});

describe("create status resolution (RD-118)", () => {
  it("persists the selected enabled status, not only the intake label", async () => {
    const intakeOnly = resolveCreateLifecycleStatus(config, "Pending", "dependency", {
      intakeOnly: true,
    });
    assert.equal(intakeOnly.ok, false, "intakeOnly is what made Create a silent no-op");

    const resolved = resolveCreateLifecycleStatus(config, "Pending", "dependency");
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.status, "Pending");
      assert.equal(resolved.statusKey, "pending");
    }
  });

  it("defaults omitted status to the config intake label", () => {
    const resolved = resolveCreateLifecycleStatus(config, undefined, "dependency");
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.status, "Identified");
      assert.equal(resolved.statusKey, "identified");
    }
  });

  it("rejects a disabled status with a client-safe error", async () => {
    const disabled = {
      ...config,
      statuses: config.statuses.map((s) =>
        s.key === "pending" ? { ...s, enabled: false } : s
      ),
    };
    const resolved = resolveCreateLifecycleStatus(disabled, "Pending", "dependency");
    assert.equal(resolved.ok, false);
    if (resolved.ok) return;
    const body = (await resolved.response.json()) as { error?: string };
    const message = dependencyCreateUserMessage({ error: body.error });
    assert.match(message, /not enabled/i);
    assert.equal(message.includes("at "), false);
  });
});

describe("dependency create client errors (silent no-op regression)", () => {
  it("valid payload persists selected status; missing required field does not", () => {
    const store = new Map<string, ReturnType<typeof toReleaseDependencyCreateData>>();
    const parsed = parseDependencyCreateBody(validBody);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const resolved = resolveCreateLifecycleStatus(config, parsed.data.status, "dependency");
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    store.set(
      "dep-1",
      toReleaseDependencyCreateData(
        parsed.data,
        resolved.status,
        resolved.statusKey,
        "DEP-001",
        1
      )
    );
    assert.equal(store.get("dep-1")?.status, "Pending");
    assert.equal(store.get("dep-1")?.statusKey, "pending");
    assert.equal(store.size, 1);

    const missing = parseDependencyCreateBody({
      dependsOnReleaseId: "rel_onto",
      dependencyType: "Hard",
      status: "Pending",
      impactIfBlocked: "Release Delay",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.match(dependencyCreateUserMessage(missing), /required|releaseId/i);
    }
    assert.equal(store.size, 1);
  });

  it("create modal shows errors inside the shell, not behind FormAlertDialog", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/dependencies/DependencyFormModal.tsx"),
      "utf8"
    );
    assert.match(src, /role="alert"/);
    assert.equal(src.includes("FormAlertDialog"), false);
    assert.equal(src.includes("CreateModalShell"), true);
  });

  it("does not treat empty/empty as a self-dependency", () => {
    assert.equal(isSelfDependency("", ""), false);
    assert.equal(isSelfDependency("  ", "  "), false);
    assert.equal(isSelfDependency("rel_a", "rel_a"), true);
  });

  it("always returns a non-empty client-safe message for a failed create", () => {
    const message = dependencyCreateUserMessage({
      error: "New dependencies must start as Identified. You can change the status after the record is created.",
    });
    assert.match(message, /Identified/);
    assert.equal(/stack|Error:|at Object/i.test(message), false);
  });
});

describe("valid create persists", () => {
  const skipDb = process.env.FIELD_LOCK_WIRING_SKIP_DB === "1";

  it(
    "writes a ReleaseDependency with the selected enabled status",
    { skip: skipDb },
    async (t) => {
      await import("./load-db-env-for-tests");
      if (!process.env.DATABASE_URL) {
        t.skip("database is not available");
        return;
      }
      const { prisma } = await import("./prisma");
      const { createReleaseRow } = await import("./org-compat");
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        t.skip("database is not available");
        return;
      }

      const dept = await prisma.department.findFirst({ select: { id: true } });
      assert.ok(dept, "need a department row");

      const stamp = Date.now().toString(36).toUpperCase();
      const from = await createReleaseRow({
        releaseCode: `RD118-A-${stamp}`,
        name: "RD-118 from",
        programProject: "N/A",
        owner: "Test",
        status: "Planning",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });
      const onto = await createReleaseRow({
        releaseCode: `RD118-B-${stamp}`,
        name: "RD-118 onto",
        programProject: "N/A",
        owner: "Test",
        status: "Planning",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });

      let createdId: string | null = null;
      try {
      const parsed = parseDependencyCreateBody({
        ...validBody,
        releaseId: from.id,
        dependsOnReleaseId: onto.id,
        status: "Pending",
      });
      assert.equal(parsed.ok, true);
      if (!parsed.ok) return;
      const resolved = resolveCreateLifecycleStatus(config, parsed.data.status, "dependency");
      assert.equal(resolved.ok, true);
      if (!resolved.ok) return;

      const beforeCount = await prisma.releaseDependency.count({
        where: { releaseId: from.id, dependsOnReleaseId: onto.id },
      });
      assert.equal(beforeCount, 0);

      const missing = parseDependencyCreateBody({
        dependsOnReleaseId: onto.id,
        dependencyType: "Hard",
        status: "Pending",
        impactIfBlocked: "Release Delay",
      });
      assert.equal(missing.ok, false);
      assert.equal(
        await prisma.releaseDependency.count({
          where: { releaseId: from.id, dependsOnReleaseId: onto.id },
        }),
        0
      );

      const row = await prisma.releaseDependency.create({
        data: toReleaseDependencyCreateData(
          parsed.data,
          resolved.status,
          resolved.statusKey,
          `DEP-RD118-${stamp}`,
          1
        ),
      });
      createdId = row.id;

        const stored = await prisma.releaseDependency.findUnique({
          where: { id: row.id },
        });
        assert.ok(stored);
        assert.equal(stored.status, "Pending");
        assert.equal(stored.statusKey, "pending");
        assert.equal(stored.releaseId, from.id);
        assert.equal(stored.dependsOnReleaseId, onto.id);
        assert.equal(stored.dependencyType, "Hard");
        assert.equal(stored.impactIfBlocked, "Release Delay");
      } finally {
        if (createdId) {
          await prisma.releaseDependency.delete({ where: { id: createdId } }).catch(() => undefined);
        }
        await prisma.release.delete({ where: { id: from.id } }).catch(() => undefined);
        await prisma.release.delete({ where: { id: onto.id } }).catch(() => undefined);
      }
    }
  );

  after(async () => {
    if (skipDb || !process.env.DATABASE_URL) return;
    try {
      const { prisma } = await import("./prisma");
      await prisma.$disconnect();
    } catch {
      // No live Prisma in this environment.
    }
  });
});
