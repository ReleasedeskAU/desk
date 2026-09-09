/**
 * RD-113: Approval Queue create must persist valid rows and never fail silently.
 * Run: npx tsx --test lib/approval-create.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalCreateClientAlert } from "@/lib/approval-create-alert";
import {
  createApprovalFromBody,
  type ApprovalCreateStore,
} from "@/lib/approval-create";
import { createDefaultApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { defaultEntityStatusLabel } from "@/lib/entity-lifecycle-status-ui";
import type { CreateApprovalInput as ApprovalRowInsert } from "@/lib/org-compat";

function intakeDecisionLabel(): string {
  return defaultEntityStatusLabel(createDefaultApprovalLifecycleConfig());
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    releaseId: "rel_1",
    approvalType: "CAB Final",
    approverId: "usr_1",
    submittedDate: "2026-09-08",
    decision: intakeDecisionLabel(),
    ...overrides,
  };
}

function fakeStore(opts?: {
  persist?: (data: ApprovalRowInsert) => Promise<unknown>;
  onPersist?: (data: ApprovalRowInsert) => void;
}): ApprovalCreateStore {
  return {
    loadConfig: async () => ({ config: createDefaultApprovalLifecycleConfig() }),
    findRelease: async (id) =>
      id === "rel_1"
        ? {
            id: "rel_1",
            status: "Planning",
            lifecycleConfigVersionId: null,
            department: { name: "Engineering" },
            applications: [],
          }
        : null,
    loadReleaseConfig: async () => createDefaultReleaseLifecycleConfig(),
    findApprover: async (id) => (id === "usr_1" ? { id } : null),
    nextApprovalCode: async () => "APR-0420",
    nextSourceOrder: async () => 7,
    persist: async (data) => {
      opts?.onPersist?.(data);
      if (opts?.persist) return opts.persist(data) as ReturnType<ApprovalCreateStore["persist"]>;
      return {
        id: "apr_new",
        ...data,
        release: { id: "rel_1", releaseCode: "REL-1", name: "Test" },
        approver: { id: "usr_1", userId: "U-1", name: "Pat" },
      } as Awaited<ReturnType<ApprovalCreateStore["persist"]>>;
    },
  };
}

describe("approvalCreateClientAlert (RD-113 silent no-op)", () => {
  it("always exposes a non-empty message the modal can show", () => {
    const fromApi = approvalCreateClientAlert(
      { error: "Release not found" },
      "Failed to create approval"
    );
    assert.equal(fromApi.message, "Release not found");
    assert.match(fromApi.title, /approval/i);

    const fromIssues = approvalCreateClientAlert(
      {
        error: "Required",
        issues: [{ path: "releaseId", message: "Release is required" }],
      },
      "Failed to create approval"
    );
    assert.equal(fromIssues.message, "Required");
    assert.deepEqual(fromIssues.details, ["Release is required"]);

    const emptyBody = approvalCreateClientAlert({}, "");
    assert.equal(emptyBody.message, "Failed to create approval");
  });
});

describe("createApprovalFromBody", () => {
  it("persists a valid payload using the lifecycle starting decision", async () => {
    const saved: ApprovalRowInsert[] = [];
    const result = await createApprovalFromBody("clerk_test", validBody(), fakeStore({
      onPersist: (row) => saved.push(row),
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.releaseId, "rel_1");
    assert.equal(saved[0]?.approverId, "usr_1");
    assert.equal(saved[0]?.approvalType, "CAB Final");
    assert.equal(saved[0]?.decision, intakeDecisionLabel());
    assert.equal(saved[0]?.approvalCode, "APR-0420");
    assert.equal(result.row.id, "apr_new");
  });

  it("does not persist when a required field is missing and returns a client-safe error", async () => {
    let persistCalls = 0;
    const result = await createApprovalFromBody(
      "clerk_test",
      {
        approvalType: "CAB Final",
        approverId: "usr_1",
        submittedDate: "2026-09-08",
        decision: intakeDecisionLabel(),
      },
      fakeStore({
        onPersist: () => {
          persistCalls += 1;
        },
      })
    );
    assert.equal(result.ok, false);
    assert.equal(persistCalls, 0);
    if (result.ok) return;
    assert.equal(result.response.status, 400);
    const body = (await result.response.json()) as {
      error?: string;
      issues?: Array<{ path?: string; message?: string }>;
    };
    assert.ok(body.error);
    assert.doesNotMatch(String(body.error), /at Object\.|prisma|stack/i);
    assert.ok(body.issues?.some((issue) => issue.path === "releaseId"));
    const alert = approvalCreateClientAlert(body, "Failed to create approval");
    assert.ok(alert.message.trim());
    assert.ok((alert.details ?? []).length > 0 || /required|release/i.test(alert.message));
  });
});
