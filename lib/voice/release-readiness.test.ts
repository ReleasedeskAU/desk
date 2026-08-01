/**
 * Release readiness + page explain + walkthrough tests.
 * Run: npx tsx --test lib/voice/release-readiness.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessReleaseReadiness } from "./release-readiness";
import {
  formatPageExplainSpeech,
  resolveVoicePageExplain,
  VOICE_PAGE_EXPLAIN_CATALOG,
} from "./page-explain-catalog";
import { VOICE_SIDEBAR_CATALOG } from "./sidebar-catalog";
import { resolveVoiceWalkthrough } from "./walkthrough-catalog";
import { handleExplainPage } from "./handlers/explain-page";
import { handleRunWalkthrough } from "./handlers/walkthrough";

/**
 * Sidebar routes intentionally without explain_page copy.
 * Keep empty unless a nav item is deliberately non-explainable.
 */
const EXPLAIN_PAGE_SIDEBAR_EXEMPTIONS = new Set<string>([]);

describe("assessReleaseReadiness", () => {
  it("marks open blockers as BLOCKED with why", () => {
    const a = assessReleaseReadiness({
      releaseCode: "REL-0001",
      name: "Payments Cutover",
      status: "In Progress",
      openBlockers: [
        {
          blockerCode: "BLK-0001",
          blockerDescription: "Missing security sign-off",
          severity: "Critical",
          status: "Open",
        },
      ],
    });
    assert.equal(a.verdict, "blocked");
    assert.match(a.spokenSummary, /BLOCKED/i);
    assert.match(a.spokenSummary, /BLK-0001|Missing security/i);
  });

  it("marks clean releases as READY or IN PROGRESS without inventing blockers", () => {
    const a = assessReleaseReadiness({
      releaseCode: "REL-0002",
      name: "Clean Cut",
      status: "Approved",
      readinessPercent: 95,
      goLiveChecklistPercent: 100,
      approvalStatus: "Approved",
      releaseHealth: "Green",
      openBlockers: [],
      conflictFlag: false,
      pendingApprovals: 0,
    });
    assert.ok(a.verdict === "ready" || a.verdict === "in_progress");
    assert.match(a.spokenSummary, /READY|IN PROGRESS/i);
    assert.ok(!/open blocker/i.test(a.spokenSummary) || /No open blockers/i.test(a.spokenSummary));
  });
});

describe("page explain + walkthrough", () => {
  it("covers every sidebar catalog path (or an explicit exemption)", () => {
    const explainPaths = new Set(VOICE_PAGE_EXPLAIN_CATALOG.map((p) => p.path));
    const missing = VOICE_SIDEBAR_CATALOG.map((item) => item.href).filter(
      (href) =>
        !EXPLAIN_PAGE_SIDEBAR_EXEMPTIONS.has(href) && !explainPaths.has(href)
    );
    assert.deepEqual(
      missing,
      [],
      `explain_page catalog missing sidebar paths: ${missing.join(", ")}`
    );
  });

  it("resolves releases page explain", () => {
    const page = resolveVoicePageExplain("releases");
    assert.ok(page);
    assert.match(formatPageExplainSpeech(page!), /Releases/i);
    assert.match(formatPageExplainSpeech(page!), /ready|blocked/i);
  });

  it("resolves a formerly missing sidebar page (system-mapping)", () => {
    const page = resolveVoicePageExplain("system mapping");
    assert.ok(page);
    assert.equal(page?.path, "/system-mapping");
  });

  it("resolves morning check tour", () => {
    const tour = resolveVoiceWalkthrough("morning check");
    assert.equal(tour?.id, "morning_check");
  });

  it("explain_page uses current href", async () => {
    const result = await handleExplainPage(
      {},
      {
        push: () => {},
        getCurrentHref: () => "/blockers?severity=Critical",
      }
    );
    assert.equal(result.ok, true);
    assert.match(result.explanation ?? "", /Blockers/i);
  });

  it("run_walkthrough navigates and filters", async () => {
    const pushed: string[] = [];
    const result = await handleRunWalkthrough(
      { tour: "critical_blockers" },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/dashboard",
        fetch: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/")) {
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          return new Response(null, { status: 404 });
        }) as typeof fetch,
      }
    );
    assert.equal(result.ok, true);
    assert.ok((result.script?.length ?? 0) >= 2);
    assert.ok(pushed.some((h) => h.startsWith("/blockers")));
  });
});
