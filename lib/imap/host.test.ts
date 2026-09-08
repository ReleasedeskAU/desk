import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPrivateIPv4, parsePublicImapHost } from "./host";

describe("parsePublicImapHost", () => {
  it("accepts a public hostname", () => {
    assert.equal(parsePublicImapHost("Outlook.Office365.com"), "outlook.office365.com");
    assert.equal(parsePublicImapHost("imap.gmail.com"), "imap.gmail.com");
  });

  it("rejects URLs, IPs, and localhost", () => {
    assert.throws(() => parsePublicImapHost("https://outlook.office365.com"), /hostname only/);
    assert.throws(() => parsePublicImapHost("127.0.0.1"), /not allowed/);
    assert.throws(() => parsePublicImapHost("localhost"), /not allowed/);
  });
});

describe("isPrivateIPv4", () => {
  it("flags RFC1918 and loopback", () => {
    assert.equal(isPrivateIPv4("10.0.0.1"), true);
    assert.equal(isPrivateIPv4("192.168.1.1"), true);
    assert.equal(isPrivateIPv4("8.8.8.8"), false);
  });
});
