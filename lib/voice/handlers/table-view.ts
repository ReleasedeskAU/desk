/**
 * configure_table_view — show/hide Manage Columns & Manage Filters fields.
 * Uses the same /api/table-preferences contract as the UI pickers.
 */
import {
  fetchTablePreferences,
  setCachedTablePreferences,
} from "@/lib/column-preferences-cache";
import { EMPTY_TABLE_PREFERENCES } from "@/lib/table-preferences";
import {
  matchTableFieldKey,
  resolveVoiceTableViewPage,
  voiceTableViewBrief,
  type VoiceTableViewPage,
} from "@/lib/voice/table-view-catalog";
import type { NavigateDeps } from "@/lib/voice/handlers/navigate";

const ACTIONS = [
  "list",
  "show_columns",
  "hide_columns",
  "show_all_columns",
  "show_filters",
  "hide_filters",
  "show_all_filters",
] as const;

export type ConfigureTableViewAction = (typeof ACTIONS)[number];

export type ConfigureTableViewArgs = {
  action?: unknown;
  page?: unknown;
  /** Column/filter keys or labels (comma-separated string or array). */
  keys?: unknown;
  columns?: unknown;
  filters?: unknown;
};

export type ConfigureTableViewResult = {
  ok: boolean;
  tool: "configure_table_view";
  pageKey?: string;
  path?: string;
  hiddenColumns?: string[];
  hiddenFilters?: string[];
  changed?: string[];
  availableColumns?: string[];
  availableFilters?: string[];
  sortPresets?: string[];
  reason?: string;
  instruction: string;
  actionLine: string;
};

function parseKeyList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,|;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function resolveKeys(
  spoken: string[],
  fields: Array<{ key: string; label: string }>
): { keys: string[]; unknown: string[] } {
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const s of spoken) {
    const hit = matchTableFieldKey(fields, s);
    if (hit) keys.push(hit);
    else unknown.push(s);
  }
  return { keys: [...new Set(keys)], unknown };
}

async function loadPrefs(pageKey: string, fetchImpl?: typeof fetch) {
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (typeof window !== "undefined") {
    return fetchTablePreferences(pageKey);
  }
  // Node tests: call API via injectable fetch when provided.
  if (typeof fetcher !== "function") {
    return { ...EMPTY_TABLE_PREFERENCES };
  }
  try {
    const res = await fetcher(
      `/api/table-preferences?pageKey=${encodeURIComponent(pageKey)}`
    );
    if (!res.ok) return { ...EMPTY_TABLE_PREFERENCES };
    const data = (await res.json()) as {
      hiddenColumns?: string[];
      hiddenFilters?: string[];
    };
    return {
      hiddenColumns: data.hiddenColumns ?? [],
      hiddenFilters: data.hiddenFilters ?? [],
    };
  } catch {
    return { ...EMPTY_TABLE_PREFERENCES };
  }
}

async function savePrefs(
  pageKey: string,
  prefs: { hiddenColumns: string[]; hiddenFilters: string[] },
  fetchImpl?: typeof fetch
): Promise<{ ok: boolean; reason?: string }> {
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    return { ok: false, reason: "fetch unavailable" };
  }
  try {
    const res = await fetcher("/api/table-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageKey,
        hiddenColumns: prefs.hiddenColumns,
        hiddenFilters: prefs.hiddenFilters,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `Preferences save failed (${res.status})` };
    }
    if (typeof window !== "undefined") {
      setCachedTablePreferences(pageKey, prefs);
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Preferences save failed" };
  }
}

function listInstruction(page: VoiceTableViewPage, prefs: {
  hiddenColumns: string[];
  hiddenFilters: string[];
}): string {
  const colHidden = prefs.hiddenColumns;
  const filHidden = prefs.hiddenFilters;
  const colVisible = page.columns
    .filter((c) => !colHidden.includes(c.key))
    .map((c) => c.label);
  const filVisible = page.filterFields
    .filter((f) => !filHidden.includes(f.key))
    .map((f) => f.label);
  return [
    `${page.label} view:`,
    `Visible columns: ${colVisible.join(", ") || "(none)"}.`,
    colHidden.length
      ? `Hidden columns (enable via show_columns): ${colHidden
          .map((k) => page.columns.find((c) => c.key === k)?.label ?? k)
          .join(", ")}.`
      : "All columns visible.",
    `Visible filter controls: ${filVisible.join(", ") || "(none)"}.`,
    filHidden.length
      ? `Hidden filter controls (enable via show_filters): ${filHidden
          .map((k) => page.filterFields.find((f) => f.key === k)?.label ?? k)
          .join(", ")}.`
      : "All filter controls visible.",
    `Sort presets: ${page.sortPresets.map((p) => `${p.label} (sort=${p.sort}, dir=${p.sortDir})`).join("; ")}.`,
    "To sort, call apply_list_filters with sort and dir. To open a row, navigate_to with search_entity.path.",
  ].join(" ");
}

/**
 * Show/hide table columns and filter controls (Manage Columns / Manage Filters).
 * @param args - action + optional keys/page.
 * @param deps - getCurrentHref + optional fetch.
 */
export async function handleConfigureTableView(
  args: ConfigureTableViewArgs,
  deps: NavigateDeps
): Promise<ConfigureTableViewResult> {
  const actionRaw =
    typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
  const action = ACTIONS.find((a) => a === actionRaw);
  if (!action) {
    return {
      ok: false,
      tool: "configure_table_view",
      reason: `Unknown action — use: ${ACTIONS.join(", ")}`,
      instruction: voiceTableViewBrief(),
      actionLine: "Table view failed — unknown action",
    };
  }

  const pageHint = typeof args.page === "string" ? args.page.trim() : undefined;
  const currentHref =
    deps.getCurrentHref?.() ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);

  const page = resolveVoiceTableViewPage(pageHint, currentHref);
  if (!page) {
    return {
      ok: false,
      tool: "configure_table_view",
      reason:
        "This page has no Manage Columns / Manage Filters. Open a list like conflicts, blockers, or releases first.",
      instruction: voiceTableViewBrief(),
      actionLine: "Table view failed — page unsupported",
    };
  }

  const prefs = await loadPrefs(page.pageKey, deps.fetch);
  const locked = new Set(page.lockedColumnKeys);

  if (action === "list") {
    return {
      ok: true,
      tool: "configure_table_view",
      pageKey: page.pageKey,
      path: page.path,
      hiddenColumns: prefs.hiddenColumns,
      hiddenFilters: prefs.hiddenFilters,
      availableColumns: page.columns.map((c) => `${c.key} (${c.label})`),
      availableFilters: page.filterFields.map((f) => `${f.key} (${f.label})`),
      sortPresets: page.sortPresets.map(
        (p) => `${p.id}: ${p.label} → sort=${p.sort}&dir=${p.sortDir}`
      ),
      instruction: listInstruction(page, prefs),
      actionLine: `Listed ${page.label} columns/filters`,
    };
  }

  let nextColumns = [...prefs.hiddenColumns];
  let nextFilters = [...prefs.hiddenFilters];
  const changed: string[] = [];
  const spokenKeys = [
    ...parseKeyList(args.keys),
    ...parseKeyList(args.columns),
    ...parseKeyList(args.filters),
  ];

  if (
    action === "show_columns" ||
    action === "hide_columns" ||
    action === "show_filters" ||
    action === "hide_filters"
  ) {
    if (!spokenKeys.length) {
      return {
        ok: false,
        tool: "configure_table_view",
        pageKey: page.pageKey,
        path: page.path,
        reason: "Provide keys (column/filter names or keys) to show or hide",
        instruction: listInstruction(page, prefs),
        actionLine: "Table view failed — missing keys",
      };
    }
  }

  if (action === "show_all_columns") {
    nextColumns = [];
    changed.push("all columns visible");
  } else if (action === "show_all_filters") {
    nextFilters = [];
    changed.push("all filter controls visible");
  } else if (action === "show_columns" || action === "hide_columns") {
    const { keys, unknown } = resolveKeys(spokenKeys, page.columns);
    if (!keys.length) {
      return {
        ok: false,
        tool: "configure_table_view",
        pageKey: page.pageKey,
        path: page.path,
        reason: `Unknown columns: ${unknown.join(", ")}`,
        availableColumns: page.columns.map((c) => `${c.key} (${c.label})`),
        instruction: listInstruction(page, prefs),
        actionLine: "Table view failed — unknown columns",
      };
    }
    for (const key of keys) {
      if (locked.has(key)) {
        changed.push(`${key} is locked (always visible)`);
        continue;
      }
      if (action === "show_columns") {
        if (nextColumns.includes(key)) {
          nextColumns = nextColumns.filter((k) => k !== key);
          changed.push(`showed column ${key}`);
        }
      } else {
        const hideableVisible = page.columns.filter(
          (c) => !locked.has(c.key) && !nextColumns.includes(c.key)
        );
        if (hideableVisible.length <= 1 && hideableVisible[0]?.key === key) {
          changed.push(`kept ${key} visible (last column)`);
          continue;
        }
        if (!nextColumns.includes(key)) {
          nextColumns = [...nextColumns, key];
          changed.push(`hid column ${key}`);
        }
      }
    }
    if (unknown.length) changed.push(`ignored unknown: ${unknown.join(", ")}`);
  } else if (action === "show_filters" || action === "hide_filters") {
    const { keys, unknown } = resolveKeys(spokenKeys, page.filterFields);
    if (!keys.length) {
      return {
        ok: false,
        tool: "configure_table_view",
        pageKey: page.pageKey,
        path: page.path,
        reason: `Unknown filters: ${unknown.join(", ")}`,
        availableFilters: page.filterFields.map((f) => `${f.key} (${f.label})`),
        instruction: listInstruction(page, prefs),
        actionLine: "Table view failed — unknown filters",
      };
    }
    for (const key of keys) {
      if (action === "show_filters") {
        if (nextFilters.includes(key)) {
          nextFilters = nextFilters.filter((k) => k !== key);
          changed.push(`showed filter ${key}`);
        }
      } else if (!nextFilters.includes(key)) {
        nextFilters = [...nextFilters, key];
        changed.push(`hid filter ${key}`);
      }
    }
    if (unknown.length) changed.push(`ignored unknown: ${unknown.join(", ")}`);
  }

  const saved = await savePrefs(
    page.pageKey,
    { hiddenColumns: nextColumns, hiddenFilters: nextFilters },
    deps.fetch
  );
  if (!saved.ok) {
    return {
      ok: false,
      tool: "configure_table_view",
      pageKey: page.pageKey,
      path: page.path,
      reason: saved.reason ?? "Save failed",
      instruction: "Could not save table preferences. Ask the user to try again.",
      actionLine: "Table view failed — save error",
    };
  }

  return {
    ok: true,
    tool: "configure_table_view",
    pageKey: page.pageKey,
    path: page.path,
    hiddenColumns: nextColumns,
    hiddenFilters: nextFilters,
    changed,
    instruction: `${listInstruction(page, { hiddenColumns: nextColumns, hiddenFilters: nextFilters })} Confirm briefly what you enabled/disabled. Do not invent column names.`,
    actionLine:
      changed.length > 0
        ? `Updated ${page.label}: ${changed.slice(0, 4).join("; ")}`
        : `No change on ${page.label}`,
  };
}
