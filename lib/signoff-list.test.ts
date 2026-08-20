import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import {
  encodeSignoffRowId,
  filterSignoffRows,
  flattenReleaseSignoffs,
  parseSignoffCode,
  parseSignoffRowId,
  signoffCodeFor,
  type SignoffSourceRelease,
} from "@/lib/signoff-list";

const config = createDefaultSignoffLifecycleConfig();

const release: SignoffSourceRelease = {
  id: "rel-1",
  releaseCode: "REL-0001",
  name: "Payroll cutover",
  status: "Planning",
  owner: "U-01",
  department: { name: "Finance" },
  releaseOwner: { name: "Ada", userId: "U-01" },
  applications: [{ application: { name: "Payroll" } }],
  devSignoff: "Approved",
  testSignoff: null,
};

describe("signoff row ids", () => {
  it("round-trips a release id and checklist field", () => {
    const id = encodeSignoffRowId("rel-1", "devSignoff");
    assert.equal(id, "rel-1--devSignoff");
    assert.deepEqual(parseSignoffRowId(id), { releaseId: "rel-1", field: "devSignoff" });
  });

  it("rejects an unknown field", () => {
    assert.equal(parseSignoffRowId("rel-1--notAField"), null);
    assert.equal(parseSignoffRowId("rel-1"), null);
  });
});

describe("signoff display codes", () => {
  it("builds and parses REL-0001-DEV", () => {
    assert.equal(signoffCodeFor("REL-0001", "dev"), "REL-0001-DEV");
    assert.deepEqual(parseSignoffCode("REL-0001-DEV", config.types.map((t) => t.key)), {
      releaseCode: "REL-0001",
      typeKey: "dev",
    });
  });

  it("prefers the longest type suffix for dress rehearsal", () => {
    assert.deepEqual(
      parseSignoffCode("REL-0001-DRESS-REHEARSAL", config.types.map((t) => t.key)),
      { releaseCode: "REL-0001", typeKey: "dress_rehearsal" }
    );
  });
});

describe("flattenReleaseSignoffs", () => {
  it("emits one row per enabled type and treats blank as Pending", () => {
    const rows = flattenReleaseSignoffs([release], config);
    const enabled = config.types.filter((t) => t.enabled && t.releaseField);
    assert.equal(rows.length, enabled.length);
    const dev = rows.find((r) => r.typeKey === "dev");
    const test = rows.find((r) => r.typeKey === "test");
    assert.equal(dev?.status, "Approved");
    assert.equal(dev?.signoffCode, "REL-0001-DEV");
    assert.equal(test?.status, "Pending");
  });
});

describe("filterSignoffRows", () => {
  it("filters by status and required flag", () => {
    const rows = flattenReleaseSignoffs([release], config);
    const approved = filterSignoffRows(rows, { status: "Approved" });
    assert.equal(approved.length, 1);
    assert.equal(approved[0]?.typeKey, "dev");
    const optional = filterSignoffRows(rows, { required: "optional" });
    assert.ok(optional.every((row) => !row.mandatory));
    assert.ok(optional.length > 0);
  });
});
