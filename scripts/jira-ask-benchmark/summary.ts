/**
 * Aggregate Ask benchmark results without judging answer correctness.
 */

import { csvEscape } from "./sanitize";
import type { BenchmarkSummary, ConversationResult, TestResult } from "./types";

/**
 * Build the summary JSON from collected Ask tests.
 */
export function buildSummary(opts: {
  outputDir: string;
  connectivityOk: boolean;
  singles: TestResult[];
  conversations: ConversationResult[];
  hallucinations: TestResult[];
}): BenchmarkSummary {
  const conversationTurns = opts.conversations.flatMap((c) => c.turns);
  const all = [...opts.singles, ...conversationTurns, ...opts.hallucinations];
  const httpDist: Record<string, number> = {};
  const grounding: Record<string, number> = {};
  const categories: BenchmarkSummary["per_category_counts"] = {};
  let askOk = 0;
  let askFail = 0;
  let askLatencySum = 0;
  let askLatencyN = 0;
  let wallSum = 0;
  let auth = false;
  let rate = false;
  let badGateway = false;

  for (const test of all) {
    wallSum += test.duration_ms;
    const cat = categories[test.category] ?? { tests: 0, usable_ask: 0 };
    cat.tests += 1;
    if (test.ask_response.trim()) cat.usable_ask += 1;
    categories[test.category] = cat;

    const g = test.ask_grounding ?? "none";
    grounding[g] = (grounding[g] ?? 0) + 1;

    if (test.http_statuses.ask != null) {
      bump(httpDist, `ask:${test.http_statuses.ask}`);
      if (test.http_statuses.ask >= 200 && test.http_statuses.ask < 300) askOk += 1;
      else askFail += 1;
    } else {
      askFail += 1;
      bump(httpDist, "ask:null");
    }
    for (const call of test.http_statuses.calls) {
      askLatencySum += call.duration_ms;
      askLatencyN += 1;
      if (call.status === 401 || call.status === 403 || call.error === "auth_error") auth = true;
      if (call.status === 429 || call.error === "rate_limited") rate = true;
      if (call.status === 502 || call.error === "bad_gateway") badGateway = true;
    }
    for (const err of test.errors) {
      if (err === "auth_error") auth = true;
      if (err === "rate_limited") rate = true;
      if (err === "bad_gateway") badGateway = true;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    output_dir: opts.outputDir,
    connectivity_ok: opts.connectivityOk,
    totals: {
      single_turn: opts.singles.length,
      multi_turn_turns: conversationTurns.length,
      hallucination: opts.hallucinations.length,
      all_recorded: all.length,
    },
    successful_requests: { ask: askOk },
    failed_requests: { ask: askFail },
    ask_grounding_distribution: grounding,
    http_status_distribution: httpDist,
    average_latency_ms: {
      ask: askLatencyN ? Math.round(askLatencySum / askLatencyN) : null,
      wall_clock_per_test: all.length ? Math.round(wallSum / all.length) : null,
    },
    per_category_counts: categories,
    usable_ask_answers: all.filter((t) => t.ask_response.trim()).length,
    encountered: { auth_error: auth, rate_limit: rate, bad_gateway: badGateway },
  };
}

/**
 * CSV rows for a flat review. Answers may contain ticket titles; no secrets.
 */
export function toCsv(tests: TestResult[]): string {
  const header = [
    "test_id",
    "category",
    "question",
    "ask_http_status",
    "ask_grounding",
    "ask_session_id",
    "ask_answer",
    "error",
  ];
  const lines = [header.join(",")];
  for (const test of tests) {
    lines.push(
      [
        csvEscape(test.test_id),
        csvEscape(test.category),
        csvEscape(test.question),
        csvEscape(test.http_statuses.ask == null ? "" : String(test.http_statuses.ask)),
        csvEscape(test.ask_grounding ?? ""),
        csvEscape(test.ask_session_id ?? ""),
        csvEscape(test.ask_response.replace(/\s+/g, " ").slice(0, 2000)),
        csvEscape(test.errors.join("; ")),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}
