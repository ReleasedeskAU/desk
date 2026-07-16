import assert from "node:assert/strict";
import { diffDraftChanges } from "../lib/detail-edit-diff";

/** Verifies field-diff helper used by detail edit success dialogs. */
function main() {
  const before = { status: "Open", notes: "a", score: 1 };
  const after = { status: "Closed", notes: "a", score: 2 };
  const changes = diffDraftChanges(before, after, {
    status: "Status",
    notes: "Notes",
    score: "Score",
  });
  assert.equal(changes.length, 2);
  assert.deepEqual(changes[0], { label: "Status", from: "Open", to: "Closed" });
  assert.deepEqual(changes[1], { label: "Score", from: "1", to: "2" });

  const none = diffDraftChanges(before, { ...before }, { status: "Status" });
  assert.equal(none.length, 0);

  // Primary keys omitted from labels are not reported.
  const noId = diffDraftChanges(
    { code: "X-1", status: "A" },
    { code: "X-2", status: "B" },
    { status: "Status" }
  );
  assert.equal(noId.length, 1);
  assert.equal(noId[0].label, "Status");

  console.log("OK detail-edit-diff");
}

main();
