/**
 * Release Desk Ask benchmark runner.
 * Hits only POST /api/ask/test. Jira ground truth is supplied separately.
 *
 * Env: ASK_TEST_TOKEN (required). Optional ASK_TEST_URL.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { callAskTest, type AskHistoryTurn } from "./ask";
import { askTestToken, askTestUrl, loadBenchmarkEnv, secretPresence } from "./env";
import { isPassableForComparison } from "./ndjson";
import { CONVERSATIONS, HALLUCINATION_TESTS, SINGLE_QUESTIONS, type SingleQuestion } from "./questions";
import { stripSecrets } from "./sanitize";
import { buildSummary, toCsv } from "./summary";
import type { ConversationResult, ConversationTurnResult, HttpCallRecord, TestResult } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const OUTPUT_DIR = resolve(REPO_ROOT, "scripts/ask-benchmark-output");

async function main(): Promise<void> {
  loadBenchmarkEnv(REPO_ROOT);
  if (!secretPresence().askTestToken) {
    console.error("Missing required environment variable: ASK_TEST_TOKEN.");
    process.exit(1);
  }

  const askUrl = askTestUrl();
  const askToken = askTestToken();

  console.log("Connectivity check: Ask test route…");
  const connectivityOnly = process.env.BENCHMARK_CONNECTIVITY_ONLY?.trim() === "1";
  const connectivity = await runConnectivity(askUrl, askToken);
  if (!connectivity.ok) {
    const failedSummary = emptySummary(false);
    writeAll(failedSummary, {
      connectivity_ok: false,
      connectivity,
      single_turn_tests: [],
      conversations: [],
      hallucination_tests: [],
    });
    printFooter(failedSummary);
    console.error("Connectivity failed. Full benchmark not started.");
    process.exit(2);
  }
  console.log("Connectivity ok. Starting Ask benchmark.");
  if (connectivityOnly) {
    const summary = emptySummary(true);
    writeAll(summary, {
      connectivity_ok: true,
      connectivity,
      single_turn_tests: [],
      conversations: [],
      hallucination_tests: [],
    });
    printFooter(summary);
    return;
  }

  const singles: TestResult[] = [];
  for (const spec of SINGLE_QUESTIONS) {
    const result = await runOne({ spec, askUrl, askToken });
    singles.push(result);
    logProgress(result);
  }

  const conversations: ConversationResult[] = [];
  for (const convo of CONVERSATIONS) {
    const turns: ConversationTurnResult[] = [];
    let sessionId: string | undefined;
    const history: AskHistoryTurn[] = [];
    for (let i = 0; i < convo.turns.length; i++) {
      const turn = convo.turns[i];
      const result = await runOne({
        spec: {
          test_id: turn.test_id,
          category: `multi_turn_${convo.conversation_id}`,
          question: turn.question,
        },
        askUrl,
        askToken,
        sessionId,
        history: [...history],
      });
      const wrapped: ConversationTurnResult = {
        ...result,
        conversation_id: convo.conversation_id,
        turn: i + 1,
      };
      turns.push(wrapped);
      logProgress(wrapped);
      if (result.ask_session_id) sessionId = result.ask_session_id;
      if (result.ask_response.trim()) {
        history.push({ role: "user", content: turn.question });
        history.push({ role: "assistant", content: result.ask_response.slice(0, 8000) });
      }
    }
    conversations.push({ conversation_id: convo.conversation_id, turns });
  }

  const hallucinations: TestResult[] = [];
  for (const spec of HALLUCINATION_TESTS) {
    const result = await runOne({ spec, askUrl, askToken });
    hallucinations.push(result);
    logProgress(result);
  }

  const summary = buildSummary({
    outputDir: OUTPUT_DIR,
    connectivityOk: true,
    singles,
    conversations,
    hallucinations,
  });
  writeAll(summary, {
    connectivity_ok: true,
    connectivity,
    single_turn_tests: singles,
    conversations,
    hallucination_tests: hallucinations,
  });
  printFooter(summary);
}

function emptySummary(ok: boolean) {
  return buildSummary({
    outputDir: OUTPUT_DIR,
    connectivityOk: ok,
    singles: [],
    conversations: [],
    hallucinations: [],
  });
}

async function runConnectivity(askUrl: string, askToken: string): Promise<Record<string, unknown>> {
  const ask = await callAskTest({
    url: askUrl,
    token: askToken,
    message: "What is RD-3 about?",
  });
  return {
    ok: ask.ok && ask.parsed.text.trim().length > 0,
    ask_rd3: {
      ok: ask.ok,
      status: ask.status,
      has_text: ask.parsed.text.trim().length > 0,
      grounding: ask.parsed.grounding,
    },
  };
}

async function runOne(opts: {
  spec: SingleQuestion;
  askUrl: string;
  askToken: string;
  sessionId?: string;
  history?: AskHistoryTurn[];
}): Promise<TestResult> {
  const started = new Date();
  const errors: string[] = [];
  const calls: HttpCallRecord[] = [];

  let askResult;
  try {
    askResult = await callAskTest({
      url: opts.askUrl,
      token: opts.askToken,
      message: opts.spec.question,
      sessionId: opts.sessionId,
      history: opts.history,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.name : "ask_error");
    askResult = null;
  }
  if (askResult) {
    calls.push(...askResult.calls);
    if (askResult.error) errors.push(askResult.error);
    if (askResult.parsed.error_event && typeof askResult.parsed.error_event === "object") {
      errors.push("ask_error_event");
    }
  } else {
    errors.push("ask_request_failed");
  }

  const completed = new Date();
  const askText = askResult?.parsed.text ?? "";
  return {
    test_id: opts.spec.test_id,
    category: opts.spec.category,
    question: opts.spec.question,
    started_at: started.toISOString(),
    completed_at: completed.toISOString(),
    duration_ms: completed.getTime() - started.getTime(),
    ask_response: askText,
    ask_grounding: askResult?.parsed.grounding ?? null,
    ask_session_id: askResult?.parsed.session_id ?? null,
    ask_status_events: askResult?.parsed.status_events ?? [],
    ask_session_event: askResult?.parsed.session_event ?? null,
    ask_grounding_event: askResult?.parsed.grounding_event ?? null,
    ask_done_event: askResult?.parsed.done_event ?? null,
    ask_error_event: askResult?.parsed.error_event ?? null,
    errors,
    http_statuses: {
      ask: askResult?.status ?? null,
      calls,
    },
    passable_for_comparison: isPassableForComparison(askText),
  };
}

function writeAll(summary: ReturnType<typeof buildSummary>, payload: Record<string, unknown>): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUTPUT_DIR, "jira_ask_test_results.json"),
    `${JSON.stringify(stripSecrets(payload), null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    resolve(OUTPUT_DIR, "jira_ask_test_summary.json"),
    `${JSON.stringify(stripSecrets(summary), null, 2)}\n`,
    "utf8"
  );
  const tests = [
    ...((payload.single_turn_tests as TestResult[]) ?? []),
    ...((payload.conversations as ConversationResult[]) ?? []).flatMap((c) => c.turns),
    ...((payload.hallucination_tests as TestResult[]) ?? []),
  ];
  writeFileSync(resolve(OUTPUT_DIR, "jira_ask_test_results.csv"), toCsv(tests), "utf8");
}

function logProgress(result: TestResult): void {
  const ask = result.http_statuses.ask ?? "null";
  const text = result.ask_response.trim() ? "ask_text" : "ask_empty";
  console.log(`${result.test_id} ${result.category} ask=${ask} ${text} ${result.duration_ms}ms`);
}

function printFooter(summary: ReturnType<typeof buildSummary>): void {
  console.log("");
  console.log(`Saved: ${resolve(OUTPUT_DIR, "jira_ask_test_results.json")}`);
  console.log(`Saved: ${resolve(OUTPUT_DIR, "jira_ask_test_summary.json")}`);
  console.log(`Saved: ${resolve(OUTPUT_DIR, "jira_ask_test_results.csv")}`);
  console.log(`Total tests: ${summary.totals.all_recorded}`);
  console.log(`Successful Ask requests: ${summary.successful_requests.ask}`);
  console.log(`Failed Ask requests: ${summary.failed_requests.ask}`);
  console.log(`Ask grounding: ${JSON.stringify(summary.ask_grounding_distribution)}`);
  console.log(`Average Ask latency: ${summary.average_latency_ms.ask ?? "n/a"} ms`);
  console.log(
    `Auth/rate-limit/502: auth=${summary.encountered.auth_error} rate_limit=${summary.encountered.rate_limit} bad_gateway=${summary.encountered.bad_gateway}`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.name : "runner_failed");
  process.exit(1);
});
