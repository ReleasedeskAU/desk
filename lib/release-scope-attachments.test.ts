import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateScopeAttachment,
  safeAttachmentDownloadName,
} from "@/lib/release-scope-attachments";

describe("scope attachments", () => {
  it("accepts a PDF by magic bytes and rejects a renamed executable", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const ok = validateScopeAttachment("plan.pdf", pdf);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.mimeType, "application/pdf");

    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    const bad = validateScopeAttachment("plan.pdf", exe);
    assert.equal(bad.ok, false);
  });

  it("rejects types outside PDF / Word / email", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = validateScopeAttachment("shot.png", png);
    assert.equal(result.ok, false);
  });

  it("strips path from download names", () => {
    assert.equal(safeAttachmentDownloadName("../../etc/passwd.pdf"), "passwd.pdf");
  });
});
