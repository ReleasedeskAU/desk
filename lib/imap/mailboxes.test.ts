import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapImapListLine, mapImapListPayload, parseImapMailboxNames } from "./mailboxes";

describe("mapImapListLine", () => {
  it("reads a quoted INBOX line", () => {
    assert.deepEqual(mapImapListLine('* LIST (\\HasNoChildren) "/" "INBOX"'), { name: "INBOX" });
  });

  it("skips NoSelect and non-LIST lines", () => {
    assert.equal(mapImapListLine('* LIST (\\Noselect \\HasChildren) "/" "[Gmail]"'), null);
    assert.equal(mapImapListLine("a2 OK LIST completed"), null);
  });
});

describe("parseImapMailboxNames", () => {
  it("requires names from an array or comma list", () => {
    assert.deepEqual(parseImapMailboxNames({ mailboxes: ["INBOX", " CAB ", "INBOX"] }), ["INBOX", "CAB"]);
    assert.deepEqual(parseImapMailboxNames({ mailboxes: "INBOX, Sent" }), ["INBOX", "Sent"]);
    assert.deepEqual(parseImapMailboxNames({}), []);
  });
});

describe("mapImapListPayload", () => {
  it("dedupes folder names", () => {
    const folders = mapImapListPayload([
      '* LIST (\\HasNoChildren) "/" "INBOX"',
      '* LIST (\\HasNoChildren) "/" "CAB"',
      '* LIST (\\HasNoChildren) "/" "INBOX"',
    ]);
    assert.deepEqual(
      folders.map((f) => f.name),
      ["INBOX", "CAB"]
    );
  });
});
