/**
 * PUT body shape for /api/release-lifecycle-config must accept a full draft
 * (including status-role flags). Run: npx tsx --test lib/release-lifecycle-put-schema.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  MAX_RELEASE_LIFECYCLE_STATUSES,
  MAX_RELEASE_LIFECYCLE_TRANSITIONS,
  RELEASE_EDIT_MODES,
  RELEASE_LIFECYCLE_ENFORCEMENTS,
  RELEASE_LIFECYCLE_GATE_ENFORCEMENTS,
  RELEASE_LIFECYCLE_STATUS_KINDS,
  createDefaultReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import { RELEASE_LIFECYCLE_GATE_TYPES } from "@/lib/release-lifecycle-gates";

/** Mirrors app/api/release-lifecycle-config/route.ts putSchema. */
const putSchema = z
  .object({
    statuses: z
      .array(
        z
          .object({
            key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/),
            label: z.string().trim().min(1).max(80),
            sortOrder: z.coerce.number().int().min(0).max(10_000),
            terminal: z.boolean(),
            kind: z.enum(RELEASE_LIFECYCLE_STATUS_KINDS),
            isSystem: z.boolean(),
            enabled: z.boolean(),
            editMode: z.enum(RELEASE_EDIT_MODES),
            isIntake: z.boolean(),
            readyMilestone: z.boolean(),
            deployingMilestone: z.boolean(),
            deployedMilestone: z.boolean(),
            withdrawApprovalsOnEnter: z.boolean(),
            writesCabScopeSnapshot: z.boolean(),
            clearsCabScopeSnapshot: z.boolean(),
            approvalRejectLanding: z.boolean(),
          })
          .strict()
      )
      .min(1)
      .max(MAX_RELEASE_LIFECYCLE_STATUSES),
    transitions: z
      .array(
        z
          .object({
            fromKey: z.string().trim().min(1).max(40),
            toKey: z.string().trim().min(1).max(40).nullable(),
            isPreviousStatus: z.boolean(),
            enabled: z.boolean(),
            enforcement: z.enum(RELEASE_LIFECYCLE_ENFORCEMENTS),
            isSystem: z.boolean(),
            sortOrder: z.coerce.number().int().min(0).max(10_000),
            gates: z
              .array(
                z
                  .object({
                    gateType: z.enum(RELEASE_LIFECYCLE_GATE_TYPES),
                    enabled: z.boolean(),
                    enforcement: z.enum(RELEASE_LIFECYCLE_GATE_ENFORCEMENTS),
                    params: z.record(z.unknown()).optional(),
                    sortOrder: z.coerce.number().int().min(0).max(10_000),
                  })
                  .strict()
              )
              .max(30),
          })
          .strict()
      )
      .max(MAX_RELEASE_LIFECYCLE_TRANSITIONS),
  })
  .strict();

describe("release lifecycle PUT schema", () => {
  it("accepts the Enterprise Default draft (status roles included)", () => {
    const parsed = putSchema.safeParse(createDefaultReleaseLifecycleConfig());
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.flatten()));
  });

  it("rejects a status missing role flags (regression for Invalid lifecycle config)", () => {
    const draft = createDefaultReleaseLifecycleConfig();
    const stripped = {
      ...draft,
      statuses: draft.statuses.map(({ key, label, sortOrder, terminal, kind, isSystem, enabled }) => ({
        key,
        label,
        sortOrder,
        terminal,
        kind,
        isSystem,
        enabled,
      })),
    };
    const parsed = putSchema.safeParse(stripped);
    assert.equal(parsed.success, false);
  });
});
