/**
 * Ask benchmark result shapes. No secrets belong in serialized output.
 */

export type AskGrounding = "verified" | "search" | "mixed";

export type HttpCallRecord = {
  target: "ask";
  endpoint: string;
  method: string;
  status: number | null;
  attempt: number;
  duration_ms: number;
  error?: string;
};

export type AskParsed = {
  session_id: string | null;
  grounding: AskGrounding | null;
  text: string;
  status_events: Array<{ phase: string }>;
  session_event: unknown | null;
  grounding_event: unknown | null;
  done_event: unknown | null;
  error_event: unknown | null;
  other_events: unknown[];
  malformed_lines: number;
  parse_errors: string[];
};

export type TestResult = {
  test_id: string;
  category: string;
  question: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  ask_response: string;
  ask_grounding: AskGrounding | null;
  ask_session_id: string | null;
  ask_status_events: Array<{ phase: string }>;
  ask_session_event: unknown | null;
  ask_grounding_event: unknown | null;
  ask_done_event: unknown | null;
  ask_error_event: unknown | null;
  errors: string[];
  http_statuses: {
    ask: number | null;
    calls: HttpCallRecord[];
  };
  passable_for_comparison: boolean;
};

export type ConversationTurnResult = TestResult & {
  conversation_id: string;
  turn: number;
};

export type ConversationResult = {
  conversation_id: string;
  turns: ConversationTurnResult[];
};

export type BenchmarkSummary = {
  generated_at: string;
  output_dir: string;
  connectivity_ok: boolean;
  totals: {
    single_turn: number;
    multi_turn_turns: number;
    hallucination: number;
    all_recorded: number;
  };
  successful_requests: { ask: number };
  failed_requests: { ask: number };
  ask_grounding_distribution: Record<string, number>;
  http_status_distribution: Record<string, number>;
  average_latency_ms: {
    ask: number | null;
    wall_clock_per_test: number | null;
  };
  per_category_counts: Record<string, { tests: number; usable_ask: number }>;
  usable_ask_answers: number;
  encountered: {
    auth_error: boolean;
    rate_limit: boolean;
    bad_gateway: boolean;
  };
};
