/**
 * Pure-guard unit tests for Copilot P1-S1 repo layer.
 * These assert typed errors without requiring a live database connection.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ReleaseEventImmutableError,
  ServiceDependencySelfReferenceError,
} from "./errors";
import { deleteReleaseEvent, updateReleaseEvent } from "./release-event-repo";
import { createServiceDependency } from "./service-dependency-repo";

describe("ReleaseEvent append-only guards", () => {
  it("updateReleaseEvent throws ReleaseEventImmutableError", async () => {
    await assert.rejects(
      () => updateReleaseEvent("evt_test", { eventType: "mutated" }),
      (err: unknown) => {
        assert.ok(err instanceof ReleaseEventImmutableError);
        assert.equal(err.code, "RELEASE_EVENT_IMMUTABLE");
        assert.match(err.message, /append-only/i);
        return true;
      }
    );
  });

  it("deleteReleaseEvent throws ReleaseEventImmutableError", async () => {
    await assert.rejects(
      () => deleteReleaseEvent("evt_test"),
      (err: unknown) => {
        assert.ok(err instanceof ReleaseEventImmutableError);
        assert.equal(err.code, "RELEASE_EVENT_IMMUTABLE");
        return true;
      }
    );
  });
});

describe("ServiceDependency self-reference guard", () => {
  it("rejects sourceServiceId === targetServiceId before DB write", async () => {
    const sameId = "svc_same";
    await assert.rejects(
      () =>
        createServiceDependency({
          sourceServiceId: sameId,
          targetServiceId: sameId,
          criticality: "HIGH",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceDependencySelfReferenceError);
        assert.equal(err.code, "SERVICE_DEPENDENCY_SELF_REFERENCE");
        assert.match(err.message, /must differ/i);
        return true;
      }
    );
  });
});
