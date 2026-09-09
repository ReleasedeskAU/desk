import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  CONFLICT_EDIT_RELEASE_EMPTY_LABEL,
  conflictEditReleaseOptions,
} from "@/lib/conflict-edit-release-options";

const ROOT = join(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const available = [
  { releaseCode: "REL-0002", name: "Payroll cutover" },
  { releaseCode: "REL-0001", name: "Core banking" },
];

describe("conflictEditReleaseOptions", () => {
  it("includes available releases from the create lookup list", () => {
    const options = conflictEditReleaseOptions({
      releases: available,
      currentCode: "REL-0001",
      currentName: "Core banking",
    });
    assert.equal(options.length, 2);
    assert.ok(options.some((o) => o.value === "REL-0001" && o.label === "REL-0001 — Core banking"));
    assert.ok(options.some((o) => o.value === "REL-0002" && o.label === "REL-0002 — Payroll cutover"));
    assert.deepEqual(
      options.map((o) => o.value),
      ["REL-0001", "REL-0002"]
    );
  });

  it("keeps the currently linked release when it is not in the available list", () => {
    const options = conflictEditReleaseOptions({
      releases: available,
      currentCode: "REL-0099",
      currentName: "Legacy window",
      excludeCodes: ["REL-0001"],
    });
    assert.ok(options.some((o) => o.value === "REL-0002"));
    assert.equal(options.some((o) => o.value === "REL-0001"), false);
    assert.equal(options[0]?.value, "REL-0099");
    assert.equal(options[0]?.label, "REL-0099 — Legacy window");
  });

  it("does not crash on an empty lookup and shows a clear empty state", () => {
    const options = conflictEditReleaseOptions({
      releases: [],
      currentCode: "",
    });
    assert.deepEqual(options, [{ value: "", label: CONFLICT_EDIT_RELEASE_EMPTY_LABEL }]);
    assert.doesNotThrow(() =>
      conflictEditReleaseOptions({ releases: null, currentCode: undefined })
    );
  });
});

describe("conflict edit Release field wiring", () => {
  it("loads /api/releases and uses select options — no second picker", () => {
    const src = readSrc("app/(main)/conflicts/[id]/page.tsx");
    assert.match(src, /\/api\/releases/);
    assert.match(src, /conflictEditReleaseOptions/);
    assert.match(src, /label="Release 1"[\s\S]*kind="select"/);
    assert.match(src, /label="Release 2"[\s\S]*kind="select"/);
    assert.equal(src.includes("SearchableSelect"), false);
  });
});
