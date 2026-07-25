/**
 * Phase-3 propose/confirm — mutation safety, expiry, RBAC, two-turn gate.
 * Run: npx tsx --test lib/voice/write-actions.test.ts
 */
import { describe, it, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __expireVoiceActionForTests,
  __resetVoiceActionStoreForTests,
  storeVoiceAction,
  getVoiceAction,
  consumeVoiceAction,
} from "./action-store";
import { confirmVoiceWrite, proposeVoiceWrite } from "./write-actions";
import type { SessionUser } from "@/lib/auth/roles";

const editor: SessionUser = {
  id: "user_editor_1",
  email: "ed@example.com",
  name: "Editor One",
  role: "editor",
};

const readonlyUser: SessionUser = {
  id: "user_ro_1",
  email: "ro@example.com",
  name: "Readonly",
  role: "readonly",
};

describe("voice action-store two-turn + expiry", () => {
  beforeEach(() => __resetVoiceActionStoreForTests());
  afterEach(() => __resetVoiceActionStoreForTests());

  it("rejects confirm in the same dispatch batch as propose", () => {
    const id = storeVoiceAction({
      userId: editor.id,
      actionType: "acknowledge_alert",
      entityId: "ALT-1",
      patchBody: { status: "Acknowledged" },
      description: "Set alert ALT-1 status to Acknowledged",
      proposeDispatchId: "batch-A",
    });
    const same = getVoiceAction(id, editor.id, "batch-A");
    assert.equal(same.ok, false);
    if (!same.ok) assert.equal(same.code, "same_turn");

    const later = getVoiceAction(id, editor.id, "batch-B");
    assert.equal(later.ok, true);
  });

  it("rejects expired and already-consumed actionIds", () => {
    const id = storeVoiceAction({
      userId: editor.id,
      actionType: "acknowledge_alert",
      entityId: "ALT-1",
      patchBody: { status: "Acknowledged" },
      description: "desc",
      proposeDispatchId: "p1",
    });
    consumeVoiceAction(id);
    const reused = getVoiceAction(id, editor.id, "p2");
    assert.equal(reused.ok, false);
    if (!reused.ok) assert.equal(reused.code, "consumed");

    const id2 = storeVoiceAction({
      userId: editor.id,
      actionType: "acknowledge_alert",
      entityId: "ALT-2",
      patchBody: { status: "Acknowledged" },
      description: "desc2",
      proposeDispatchId: "p3",
    });
    __expireVoiceActionForTests(id2);
    const expired = getVoiceAction(id2, editor.id, "p4");
    assert.equal(expired.ok, false);
    // Expired rows are deleted on lookup → not_found, or reported as expired.
    if (!expired.ok) assert.ok(expired.code === "expired" || expired.code === "not_found");
  });
});

describe("proposeVoiceWrite / confirmVoiceWrite", () => {
  beforeEach(() => __resetVoiceActionStoreForTests());
  afterEach(() => {
    __resetVoiceActionStoreForTests();
    mock.restoreAll();
  });

  it("rejects unknown actionType immediately", async () => {
    const result = await proposeVoiceWrite({
      user: editor,
      actionType: "record_release_decision",
      params: { id: "REL-0001", decision: "Go" },
      proposeDispatchId: "d1",
    });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Unsupported actionType/i);
  });

  it("rejects readonly user at propose time", async () => {
    const result = await proposeVoiceWrite({
      user: readonlyUser,
      actionType: "acknowledge_alert",
      params: { id: "ALT-1", status: "Acknowledged" },
      proposeDispatchId: "d1",
    });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Forbidden|editor/i);
  });

  it("propose never calls fetch / PATCH (no mutation path)", async () => {
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    });

    // Invalid id → not found after schema ok; still must not PATCH.
    const result = await proposeVoiceWrite({
      user: editor,
      actionType: "acknowledge_alert",
      params: { id: "ALT-DOES-NOT-EXIST-XYZ", status: "Acknowledged" },
      proposeDispatchId: "d-mute",
    });
    assert.equal(fetchCalls, 0);
    // Either not_found (DB up) or connection error path — never ok mutation.
    assert.equal(result.ok, false);
  });

  it("confirm rejects unknown actionId without calling PATCH", async () => {
    let fetchCalls = 0;
    const result = await confirmVoiceWrite({
      user: editor,
      actionId: "va_does_not_exist",
      confirmDispatchId: "c1",
      deps: {
        origin: "http://localhost:3000",
        cookieHeader: "",
        fetch: async () => {
          fetchCalls += 1;
          return new Response("{}", { status: 200 });
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(fetchCalls, 0);
    assert.match(result.reason ?? "", /Unknown|expired/i);
  });

  it("confirm re-checks RBAC — readonly cannot execute even with a staged action", async () => {
    const actionId = storeVoiceAction({
      userId: readonlyUser.id,
      actionType: "acknowledge_alert",
      entityId: "ALT-1",
      patchBody: { status: "Acknowledged" },
      description: "Set alert ALT-1 status to Acknowledged",
      proposeDispatchId: "propose-batch",
    });

    let fetchCalls = 0;
    const result = await confirmVoiceWrite({
      user: readonlyUser,
      actionId,
      confirmDispatchId: "confirm-batch",
      deps: {
        origin: "http://localhost:3000",
        cookieHeader: "",
        fetch: async () => {
          fetchCalls += 1;
          return new Response("{}", { status: 200 });
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(fetchCalls, 0);
    assert.match(result.reason ?? "", /Forbidden|editor/i);
  });

  it("same-batch propose+confirm does not execute (compressed utterance gate)", async () => {
    const actionId = storeVoiceAction({
      userId: editor.id,
      actionType: "set_approval_decision",
      entityId: "APR-1",
      patchBody: { decision: "Approved", decisionDate: "2026-07-25" },
      description: "Set approval APR-1 …",
      proposeDispatchId: "same-batch",
    });

    let fetchCalls = 0;
    const result = await confirmVoiceWrite({
      user: editor,
      actionId,
      confirmDispatchId: "same-batch",
      deps: {
        origin: "http://localhost:3000",
        cookieHeader: "",
        fetch: async () => {
          fetchCalls += 1;
          return new Response("{}", { status: 200 });
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(fetchCalls, 0);
    assert.match(result.reason ?? "", /separate turn|same/i);
  });

  it("accept=false discards without PATCH", async () => {
    const actionId = storeVoiceAction({
      userId: editor.id,
      actionType: "acknowledge_alert",
      entityId: "ALT-1",
      patchBody: { status: "Acknowledged" },
      description: "desc",
      proposeDispatchId: "p",
    });
    let fetchCalls = 0;
    const result = await confirmVoiceWrite({
      user: editor,
      actionId,
      accept: false,
      confirmDispatchId: "c",
      deps: {
        origin: "http://localhost:3000",
        cookieHeader: "",
        fetch: async () => {
          fetchCalls += 1;
          return new Response("{}", { status: 200 });
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.discarded, true);
    assert.equal(fetchCalls, 0);
  });

  it("successful confirm calls PATCH once and refuses reuse", async () => {
    const actionId = storeVoiceAction({
      userId: editor.id,
      actionType: "acknowledge_alert",
      entityId: "ALT-0001",
      patchBody: { status: "Acknowledged" },
      description: "Set monitoring alert ALT-0001 status to Acknowledged",
      proposeDispatchId: "p-ok",
    });

    const urls: string[] = [];
    const result = await confirmVoiceWrite({
      user: editor,
      actionId,
      confirmDispatchId: "c-ok",
      deps: {
        origin: "http://localhost:3000",
        cookieHeader: "session=test",
        fetch: async (input, init) => {
          urls.push(String(input));
          assert.equal(init?.method, "PATCH");
          assert.match(String(init?.body), /Acknowledged/);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(urls.length, 1);
    assert.match(urls[0]!, /\/api\/monitoring-alerts\/ALT-0001/);

    const reuse = await confirmVoiceWrite({
      user: editor,
      actionId,
      confirmDispatchId: "c-ok-2",
      deps: {
        origin: "http://localhost:3000",
        cookieHeader: "",
        fetch: async () => new Response("{}", { status: 200 }),
      },
    });
    assert.equal(reuse.ok, false);
    assert.match(reuse.reason ?? "", /already confirmed|Unknown|expired/i);
  });
});
