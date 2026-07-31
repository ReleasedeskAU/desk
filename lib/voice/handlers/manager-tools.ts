/**
 * Voice handlers for release-manager read tools + open/copy/undo helpers.
 */
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";
import { handleSearchEntity } from "@/lib/voice/handlers/search";
import { handleNavigateTo, type NavigateDeps } from "@/lib/voice/handlers/navigate";
import { getVoiceAppContext } from "@/lib/voice/app-context";
import {
  popVoiceFilterHistory,
  pushVoiceFilterHistory,
} from "@/lib/voice/filter-history";

type ManagerApiOk = {
  ok: true;
  op: string;
  bundle?: Record<string, unknown>;
  brief?: Record<string, unknown>;
  window?: Record<string, unknown>;
  comparison?: Record<string, unknown>;
};

type ManagerApiFail = { ok: false; reason?: string };

async function callManager(
  body: Record<string, unknown>
): Promise<ManagerApiOk | ManagerApiFail | "abort"> {
  const api = await safeFetchJson<ManagerApiOk | ManagerApiFail>(
    "/api/copilot/voice/manager",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      label: "voice-manager",
    }
  );
  if (isFetchAbort(api)) return "abort";
  if (!api.ok) {
    return { ok: false, reason: api.error ?? "Manager API failed" };
  }
  return api.data;
}

function abortResult(tool: string) {
  return {
    ok: false,
    tool,
    reason: "Request aborted",
    instruction: "Try again briefly.",
    actionLine: `${tool} aborted`,
  };
}

/**
 * get_release_bundle — readiness + blockers + conflicts + pending approvals.
 */
export async function handleGetReleaseBundle(args: { releaseCode?: unknown }) {
  const releaseCode =
    typeof args.releaseCode === "string"
      ? args.releaseCode.trim()
      : typeof (args as { entityId?: unknown }).entityId === "string"
        ? String((args as { entityId: string }).entityId).trim()
        : "";
  if (!releaseCode) {
    return {
      ok: false,
      tool: "get_release_bundle",
      reason: "releaseCode required",
      instruction: "Ask for a release code (e.g. REL-0001) or call search_entity first.",
      actionLine: "Bundle failed — missing release code",
    };
  }
  const data = await callManager({ op: "release_bundle", releaseCode });
  if (data === "abort") return abortResult("get_release_bundle");
  if (!data.ok || !("bundle" in data) || !data.bundle) {
    return {
      ok: false,
      tool: "get_release_bundle",
      reason: data.ok === false ? data.reason : "Not found",
      instruction: "Search for the correct release code, then retry get_release_bundle.",
      actionLine: "Bundle failed — not found",
    };
  }
  const b = data.bundle as {
    releaseCode: string;
    name: string;
    path: string;
    spokenSummary: string;
    verdict: string;
  };
  return {
    ok: true,
    tool: "get_release_bundle",
    ...data.bundle,
    instruction: [
      `Speak the bundle for ${b.releaseCode} (${b.name}).`,
      `Verdict first (${b.verdict}), then open blockers/conflicts/pending approvals by exact codes only.`,
      `Summary: ${b.spokenSummary}`,
      "Offer to open a related record with open_entity or navigate_to.",
    ].join(" "),
    actionLine: `Bundle ${b.releaseCode}: ${b.verdict}`,
  };
}

/**
 * get_attention_brief — what needs the user now.
 */
export async function handleGetAttentionBrief(args: { period?: unknown }) {
  const period =
    typeof args.period === "string" && /^(month|quarter|year)$/i.test(args.period)
      ? args.period.toLowerCase()
      : "month";
  const data = await callManager({ op: "attention_brief", period });
  if (data === "abort") return abortResult("get_attention_brief");
  if (!data.ok || !data.brief) {
    return {
      ok: false,
      tool: "get_attention_brief",
      reason: data.ok === false ? data.reason : "Failed",
      instruction: "Apologize and offer Morning Inbox navigation.",
      actionLine: "Attention brief failed",
    };
  }
  const counts = (data.brief as { counts?: Record<string, number> }).counts ?? {};
  return {
    ok: true,
    tool: "get_attention_brief",
    ...data.brief,
    instruction: [
      "Speak a short morning brief using ONLY codes in this response.",
      `Counts: attention releases=${counts.attentionReleases ?? 0}, critical blockers=${counts.criticalBlockers ?? 0}, escalated conflicts=${counts.escalatedConflicts ?? 0}, pending approvals=${counts.pendingApprovals ?? 0}.`,
      "Lead with the most urgent items; offer open_entity on any code.",
    ].join(" "),
    actionLine: `Attention brief: ${counts.attentionReleases ?? 0} releases, ${counts.criticalBlockers ?? 0} critical blockers`,
  };
}

/**
 * get_calendar_window — shipping / CAB window.
 */
export async function handleGetCalendarWindow(args: {
  from?: unknown;
  to?: unknown;
  field?: unknown;
  days?: unknown;
}) {
  let from =
    typeof args.from === "string" ? args.from.trim() : "";
  let to = typeof args.to === "string" ? args.to.trim() : "";
  const field =
    args.field === "cabDate" || args.field === "cab" ? "cabDate" : "releaseDate";

  // Spoken "next 7 days" → days number when from/to omitted.
  if ((!from || !to) && typeof args.days === "number" && Number.isFinite(args.days)) {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + Math.min(62, Math.max(1, Math.floor(args.days))));
    from = start.toISOString().slice(0, 10);
    to = end.toISOString().slice(0, 10);
  }
  if (!from || !to) {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    from = from || start.toISOString().slice(0, 10);
    to = to || end.toISOString().slice(0, 10);
  }

  const data = await callManager({ op: "calendar_window", from, to, field });
  if (data === "abort") return abortResult("get_calendar_window");
  if (!data.ok || !data.window) {
    return {
      ok: false,
      tool: "get_calendar_window",
      reason: data.ok === false ? data.reason : "Failed",
      instruction: "Ask for a clearer date range (YYYY-MM-DD).",
      actionLine: "Calendar window failed",
    };
  }
  const w = data.window as { count: number; from: string; to: string };
  return {
    ok: true,
    tool: "get_calendar_window",
    ...data.window,
    instruction: [
      `Speak releases shipping between ${w.from} and ${w.to} (${w.count} found).`,
      "Use exact codes/names only. Offer get_release_bundle on any one.",
    ].join(" "),
    actionLine: `Calendar: ${w.count} release(s) ${w.from}→${w.to}`,
  };
}

/**
 * compare_releases — side-by-side readiness.
 */
export async function handleCompareReleases(args: {
  codes?: unknown;
  releaseCodes?: unknown;
}) {
  const raw = args.codes ?? args.releaseCodes;
  let codes: string[] = [];
  if (Array.isArray(raw)) {
    codes = raw.filter((x): x is string => typeof x === "string").map((s) => s.trim());
  } else if (typeof raw === "string") {
    codes = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (codes.length < 2) {
    return {
      ok: false,
      tool: "compare_releases",
      reason: "Need at least 2 release codes",
      instruction: "Ask which 2–3 releases to compare (e.g. REL-0001 and REL-0009).",
      actionLine: "Compare failed — need 2+ codes",
    };
  }
  const data = await callManager({ op: "compare_releases", codes: codes.slice(0, 3) });
  if (data === "abort") return abortResult("compare_releases");
  if (!data.ok || !data.comparison) {
    return {
      ok: false,
      tool: "compare_releases",
      reason: data.ok === false ? data.reason : "Failed",
      instruction: "Verify release codes with search_entity, then compare again.",
      actionLine: "Compare failed",
    };
  }
  return {
    ok: true,
    tool: "compare_releases",
    ...data.comparison,
    instruction:
      "Compare verdicts side by side using exact codes. Highlight which is more blocked and why (blockers/conflicts/approvals counts). Do not invent codes.",
    actionLine: `Compared ${(data.comparison as { found?: string[] }).found?.join(", ") ?? "releases"}`,
  };
}

/**
 * open_entity — search then navigate in one step when unique.
 */
export async function handleOpenEntity(
  args: { query?: unknown; entityType?: unknown; path?: unknown },
  deps: NavigateDeps
) {
  const pathHint = typeof args.path === "string" ? args.path.trim() : "";
  if (pathHint.startsWith("/")) {
    const nav = await handleNavigateTo({ path: pathHint }, deps);
    return {
      ...nav,
      tool: "open_entity",
      instruction: nav.ok
        ? "Confirm you opened the record."
        : nav.reason ?? "Could not open path",
    };
  }

  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    return {
      ok: false,
      tool: "open_entity",
      reason: "query required",
      instruction: "Ask which release/blocker/conflict to open.",
      actionLine: "Open failed — missing query",
    };
  }

  const search = await handleSearchEntity({
    query,
    entityType: args.entityType,
  });
  if (!search.ok) {
    return {
      ok: false,
      tool: "open_entity",
      reason: search.reason ?? "Search failed",
      instruction: search.instruction,
      actionLine: search.actionLine,
    };
  }
  if (search.single?.path) {
    const nav = await handleNavigateTo(
      { path: search.single.path, label: search.single.label },
      deps
    );
    return {
      ok: nav.ok,
      tool: "open_entity",
      path: nav.path,
      match: search.single,
      reason: nav.reason,
      instruction: nav.ok
        ? `Opened ${search.single.label}. Briefly confirm.`
        : nav.reason ?? "Navigate failed",
      actionLine: nav.ok
        ? `Opened ${search.single.refId || search.single.label}`
        : nav.actionLine,
    };
  }
  return {
    ok: true,
    tool: "open_entity",
    matchCount: search.matchCount,
    candidates: search.candidates,
    instruction: [
      "Multiple matches — do NOT navigate yet.",
      "Ask which one using exact candidate labels/codes, then call open_entity with that code.",
      search.instruction,
    ].join(" "),
    actionLine: `Open needs pick — ${search.matchCount} matches`,
  };
}

/**
 * copy_visible_codes — clipboard of current APP_CONTEXT codes.
 */
export async function handleCopyVisibleCodes(_args: Record<string, unknown> = {}) {
  const packet = getVoiceAppContext();
  if (!packet || packet.visible.length === 0) {
    return {
      ok: false,
      tool: "copy_visible_codes",
      reason: "No on-screen rows",
      instruction:
        "Tell the user the current list is empty or context is unavailable — open a filtered list first.",
      actionLine: "Copy failed — no visible rows",
    };
  }
  const codes = packet.visible.map((r) => r.code);
  const text = codes.join(", ");
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return {
        ok: false,
        tool: "copy_visible_codes",
        codes,
        reason: "Clipboard permission denied",
        instruction: `Clipboard blocked — speak the codes instead: ${text}`,
        actionLine: "Copy blocked — speak codes instead",
      };
    }
  }
  return {
    ok: true,
    tool: "copy_visible_codes",
    count: codes.length,
    codes,
    text,
    instruction: `Copied ${codes.length} code(s) to clipboard: ${text}. Confirm briefly.`,
    actionLine: `Copied ${codes.length} code(s)`,
  };
}

/**
 * undo_filters — restore previous list filter URL.
 */
export async function handleUndoFilters(
  _args: Record<string, unknown>,
  deps: NavigateDeps
) {
  const prev = popVoiceFilterHistory();
  if (!prev) {
    return {
      ok: false,
      tool: "undo_filters",
      reason: "No previous filter state",
      instruction: "Tell the user there is nothing to undo yet.",
      actionLine: "Undo failed — no history",
    };
  }
  // Remember current so redo-style undo can stack naturally.
  const current =
    deps.getCurrentHref?.() ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "");
  if (current) pushVoiceFilterHistory(current);

  await Promise.resolve(deps.push(prev));
  return {
    ok: true,
    tool: "undo_filters",
    href: prev,
    instruction: "Filters restored to the previous view. Confirm briefly; call get_page_context if they ask what is showing.",
    actionLine: "Restored previous filters",
  };
}
