/**
 * Phase-3 write proof (API path, not mic): propose → confirm against real DB
 * via the same PATCH routes, then verify + discard path.
 *
 * Run: npx tsx scripts/repro-voice-write-actions.mjs
 *
 * Live mic proof still required in the browser (amber propose UI + spoken yes/no).
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function parseEnv(t) {
  const o = {};
  for (const r of t.split(/\r?\n/)) {
    const l = r.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    let k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    o[k] = v;
  }
  return o;
}
const env = parseEnv(readFileSync(resolve(".env"), "utf8"));
for (const k of ["DATABASE_URL", "DIRECT_URL"]) if (env[k]) process.env[k] = env[k];

const { PrismaClient } = await import("@releasedesk/database");
const prisma = new PrismaClient();
const { proposeVoiceWrite, confirmVoiceWrite } = await import("../lib/voice/write-actions.ts");
const { __resetVoiceActionStoreForTests } = await import("../lib/voice/action-store.ts");

const editor = {
  id: "voice-repro-editor",
  email: "voice-repro@example.com",
  name: "Voice Repro",
  role: "editor",
};

__resetVoiceActionStoreForTests();

const approval = await prisma.approval.findFirst({
  where: { decision: "Pending" },
  include: { release: { select: { releaseCode: true, name: true } } },
  orderBy: { sourceOrder: "asc" },
});
const alert = await prisma.monitoringAlert.findFirst({
  where: { status: { not: "Acknowledged" } },
  orderBy: { sourceOrder: "asc" },
});

if (!approval || !alert) {
  console.error("Need a Pending approval and a non-acknowledged alert in DB");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const origin = "http://voice-repro.local";

/** Route PATCH through real Prisma update matching API handlers (sessionless repro). */
async function localPatchFetch(input, init) {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url.includes("/api/approvals/")) {
    const id = decodeURIComponent(url.split("/api/approvals/")[1]);
    const row =
      (await prisma.approval.findUnique({ where: { id } })) ??
      (await prisma.approval.findUnique({ where: { approvalCode: id } }));
    if (!row) return new Response(JSON.stringify({ error: "Approval not found" }), { status: 404 });
    const updated = await prisma.approval.update({
      where: { id: row.id },
      data: {
        decision: body.decision,
        decisionDate: body.decisionDate ? new Date(body.decisionDate) : undefined,
      },
    });
    return new Response(JSON.stringify(updated), { status: 200 });
  }
  if (url.includes("/api/monitoring-alerts/")) {
    const id = decodeURIComponent(url.split("/api/monitoring-alerts/")[1]);
    const row =
      (await prisma.monitoringAlert.findUnique({ where: { id } })) ??
      (await prisma.monitoringAlert.findUnique({ where: { alertCode: id } }));
    if (!row) return new Response(JSON.stringify({ error: "Alert not found" }), { status: 404 });
    const updated = await prisma.monitoringAlert.update({
      where: { id: row.id },
      data: { status: body.status },
    });
    return new Response(JSON.stringify(updated), { status: 200 });
  }
  return new Response(JSON.stringify({ error: "not mocked" }), { status: 404 });
}

console.log("=== 1) propose approval decision ===");
const propA = await proposeVoiceWrite({
  user: editor,
  actionType: "set_approval_decision",
  params: {
    id: approval.approvalCode,
    decision: "Approved",
    decisionDate: today,
  },
  proposeDispatchId: "repro-propose-a",
});
console.log(JSON.stringify(propA, null, 2));
if (!propA.ok) process.exit(1);

console.log("\n=== 2) same-turn confirm blocked ===");
const same = await confirmVoiceWrite({
  user: editor,
  actionId: propA.actionId,
  confirmDispatchId: "repro-propose-a",
  deps: { origin, cookieHeader: "", fetch: localPatchFetch },
});
console.log(same.ok, same.reason);

console.log("\n=== 3) confirm approval (separate turn) ===");
const confA = await confirmVoiceWrite({
  user: editor,
  actionId: propA.actionId,
  confirmDispatchId: "repro-confirm-a",
  deps: { origin, cookieHeader: "", fetch: localPatchFetch },
});
console.log(JSON.stringify(confA, null, 2));
const afterA = await prisma.approval.findUnique({ where: { id: approval.id } });
console.log("DB decision now:", afterA?.decision);

console.log("\n=== 4) propose alert + discard (no) ===");
const propB = await proposeVoiceWrite({
  user: editor,
  actionType: "acknowledge_alert",
  params: { id: alert.alertCode, status: "Acknowledged" },
  proposeDispatchId: "repro-propose-b",
});
console.log(propB.ok, propB.description);
const beforeAlert = alert.status;
const discard = await confirmVoiceWrite({
  user: editor,
  actionId: propB.actionId,
  accept: false,
  confirmDispatchId: "repro-confirm-b",
  deps: { origin, cookieHeader: "", fetch: localPatchFetch },
});
const afterDiscard = await prisma.monitoringAlert.findUnique({ where: { id: alert.id } });
console.log("discard ok:", discard.ok, "discarded:", discard.discarded);
console.log("alert status unchanged?", afterDiscard?.status === beforeAlert, afterDiscard?.status);

console.log("\n=== 5) propose + confirm alert ===");
const propC = await proposeVoiceWrite({
  user: editor,
  actionType: "acknowledge_alert",
  params: { id: alert.alertCode, status: "Acknowledged" },
  proposeDispatchId: "repro-propose-c",
});
const confC = await confirmVoiceWrite({
  user: editor,
  actionId: propC.actionId,
  confirmDispatchId: "repro-confirm-c",
  deps: { origin, cookieHeader: "", fetch: localPatchFetch },
});
const afterC = await prisma.monitoringAlert.findUnique({ where: { id: alert.id } });
console.log(confC.resultSummary);
console.log("DB alert status:", afterC?.status);

const pass =
  afterA?.decision === "Approved" &&
  discard.discarded === true &&
  afterDiscard?.status === beforeAlert &&
  afterC?.status === "Acknowledged";

console.log(pass ? "\nPASS (API/DB path)" : "\nFAIL");
console.log(
  "\nLIVE BROWSER still required: VoiceMic amber propose strip → say yes → reload approval/alert detail."
);
await prisma.$disconnect();
process.exit(pass ? 0 : 1);
