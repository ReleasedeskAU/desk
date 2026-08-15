import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConflictRaisedNotice,
  conflictHrefFromNotice,
  CONFLICT_NOTICE_TYPE,
} from "@/lib/conflict-notify";

describe("buildConflictRaisedNotice", () => {
  it("uses the sheet copy and a conflict deep link", () => {
    const notice = buildConflictRaisedNotice({
      releaseCode: "REL-0009",
      conflictCode: "CNF-0004",
    });
    assert.equal(notice.title, "Conflict raised on release REL-0009 — needs review");
    assert.match(notice.message, /CNF-0004/);
    assert.equal(notice.href, "/conflicts/CNF-0004");
    assert.equal(notice.type, CONFLICT_NOTICE_TYPE);
  });
});

describe("conflictHrefFromNotice", () => {
  it("extracts the conflict path the inbox will render", () => {
    assert.equal(
      conflictHrefFromNotice(
        "Conflict raised on release REL-0009 — needs review",
        "CNF-0004 needs Release Manager review."
      ),
      "/conflicts/CNF-0004"
    );
  });

  it("returns undefined when there is no conflict code", () => {
    assert.equal(conflictHrefFromNotice("Deployment started", "REL-0001 rolling out"), undefined);
  });
});
