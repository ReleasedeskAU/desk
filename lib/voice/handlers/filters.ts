/**
 * apply_list_filters tool handler — URL-driven list filters on allowlisted pages.
 * Uses the same query-param schemas as the UI tables (no separate filter store).
 *
 * Gemini often flattens filter keys onto the tool args root (status/severity/…)
 * instead of nesting under `filters` — collectVoiceFilterArgs accepts both.
 */
import {
  buildVoiceFilterHref,
  resolveVoiceFilterPage,
  voiceListFiltersBrief,
} from "@/lib/voice/list-filters-catalog";
import type { NavigateDeps } from "@/lib/voice/handlers/navigate";
import { resolveSpokenFilterLookups } from "@/lib/voice/filter-lookups";

/** Reserved tool args that are not filter key→value pairs. */
const FILTER_META_KEYS = new Set([
  "page",
  "filters",
  "clear",
  "replace",
  "label",
]);

export type ApplyListFiltersArgs = {
  page?: unknown;
  filters?: unknown;
  clear?: unknown;
  replace?: unknown;
  /** Gemini may put filter fields at the root; collected via collectVoiceFilterArgs. */
  [key: string]: unknown;
};

export type ApplyListFiltersResult = {
  ok: boolean;
  tool: "apply_list_filters";
  path?: string;
  href?: string;
  applied?: Record<string, string>;
  unknownKeys?: string[];
  reason?: string;
  instruction?: string;
  actionLine: string;
};

/**
 * Collect filter key→value from nested `filters` and/or flattened top-level args.
 * @param args - Raw tool args from Gemini.
 * @returns Merged filter map (may be empty), or an error reason.
 */
export function collectVoiceFilterArgs(
  args: ApplyListFiltersArgs
): { ok: true; filters: Record<string, unknown> } | { ok: false; reason: string } {
  const out: Record<string, unknown> = {};

  if (args.filters != null) {
    let nested: unknown = args.filters;
    if (typeof nested === "string") {
      const trimmed = nested.trim();
      if (trimmed.startsWith("{")) {
        try {
          nested = JSON.parse(trimmed) as unknown;
        } catch {
          return { ok: false, reason: "filters JSON string is invalid" };
        }
      } else {
        return {
          ok: false,
          reason: "filters must be an object of key→value pairs",
        };
      }
    }
    if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
      return {
        ok: false,
        reason: "filters must be an object of key→value pairs",
      };
    }
    Object.assign(out, nested as Record<string, unknown>);
  }

  // Live models frequently emit status/severity/dept at the root — accept them.
  for (const [key, value] of Object.entries(args)) {
    if (FILTER_META_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }

  return { ok: true, filters: out };
}

/**
 * Apply, merge, replace, or clear list filters via client navigation to href+query.
 * @param args - Tool args from Gemini.
 * @param deps - Router adapters (`push`, optional `getCurrentHref`).
 */
export async function handleApplyListFilters(
  args: ApplyListFiltersArgs,
  deps: NavigateDeps
): Promise<ApplyListFiltersResult> {
  const pageHint = typeof args.page === "string" ? args.page.trim() : undefined;
  const clear = args.clear === true || args.clear === "true";
  const replace = args.replace === true || args.replace === "true";

  const collected = collectVoiceFilterArgs(args);
  if (!collected.ok) {
    return {
      ok: false,
      tool: "apply_list_filters",
      reason: collected.reason,
      actionLine: "Filter failed — invalid filters object",
    };
  }

  const currentHref =
    deps.getCurrentHref?.() ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);

  const page = resolveVoiceFilterPage(pageHint, currentHref);
  if (!page) {
    return {
      ok: false,
      tool: "apply_list_filters",
      reason:
        "This page has no list filters. Open a filterable list first (blockers, releases, risks, …) or pass page=.",
      instruction: voiceListFiltersBrief(),
      actionLine: "Filter failed — page has no filters",
    };
  }

  // Spoken department/application names → DB ids (dept/app URL params expect ids).
  const filters = await resolveSpokenFilterLookups(collected.filters, {
    fetch: deps.fetch,
  });

  const built = buildVoiceFilterHref({
    page,
    currentHref,
    filters,
    clear,
    replace,
  });

  if (!built.ok) {
    return {
      ok: false,
      tool: "apply_list_filters",
      path: page.path,
      reason: built.reason,
      unknownKeys: built.unknownKeys,
      instruction: `Valid keys on ${page.label}: ${page.commonKeys.join(", ")}. Pass them nested in filters OR as top-level args (status, severity, dept, …).`,
      actionLine: `Filter failed — ${built.reason}`,
    };
  }

  await Promise.resolve(deps.push(built.href));

  const appliedPairs = Object.entries(built.applied).filter(([, v]) => v !== "");

  let actionLine: string;
  if (clear && appliedPairs.length === 0) {
    actionLine = `Cleared filters on ${page.label}`;
  } else if (appliedPairs.length) {
    const summary = appliedPairs
      .map(([k, v]) => `${k}=${v}`)
      .slice(0, 6)
      .join(", ");
    actionLine = `Filtered ${page.label}: ${summary}`;
  } else {
    actionLine = `Updated filters on ${page.label}`;
  }

  return {
    ok: true,
    tool: "apply_list_filters",
    path: page.path,
    href: built.href,
    applied: built.applied,
    unknownKeys: built.unknownKeys.length ? built.unknownKeys : undefined,
    instruction:
      built.unknownKeys.length > 0
        ? `Applied filters; ignored unknown keys: ${built.unknownKeys.join(", ")}`
        : "Filters applied via URL. Confirm briefly; do not invent extra filter values.",
    actionLine,
  };
}
