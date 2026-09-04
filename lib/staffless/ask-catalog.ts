/**
 * Exact catalog reads from StaffLess Postgres tag APIs — not OpenSearch samples.
 */

import { stafflessFetch } from "@/lib/staffless/client";
import {
  ALLOWED_COUNT_FIELDS,
  type CountFilterField,
  type VerifiedCountArgs,
  type VerifiedCountResult,
  getVerifiedCount,
} from "@/lib/staffless/ask-count";

export { ALLOWED_COUNT_FIELDS, getVerifiedCount };
export type { CountFilterField, VerifiedCountArgs, VerifiedCountResult };

export const STAFFLESS_DOCUMENT_DISTINCT_PATH = "/api/admin/document-distinct";
export const STAFFLESS_DOCUMENT_BREAKDOWN_PATH = "/api/admin/document-breakdown";
export const STAFFLESS_DOCUMENT_BY_KEY_PATH = "/api/admin/document-by-key";
export const STAFFLESS_DOCUMENT_LIST_PATH = "/api/admin/document-list";

export type CatalogFieldArgs = {
  source?: "jira" | "github" | "all";
  field: CountFilterField;
};

export type DistinctValuesResult = {
  field: string;
  source: string;
  values: string[];
  untagged_count: number;
  total_indexed: number;
  truncated: boolean;
  note: string;
};

export type BreakdownGroup = { value: string; count: number };

export type BreakdownResult = {
  field: string;
  source: string;
  groups: BreakdownGroup[];
  untagged_count: number;
  total_indexed: number;
  truncated: boolean;
  note: string;
};

export type DocumentByKeyArgs = {
  source?: "jira" | "github" | "all";
  key: string;
};

export type DocumentByKeyResult = {
  found: boolean;
  key: string;
  title?: string;
  link?: string | null;
  source: string;
  fields?: Record<string, string | string[]>;
  note: string;
};

export type DocumentMatchArgs = {
  source?: "jira" | "github" | "all";
  filter_field: CountFilterField;
  filter_value: string;
};

export type MatchingDocument = {
  key: string | null;
  title: string | null;
  link: string | null;
};

export type DocumentListResult = {
  count: number;
  source: string;
  filter_field: string;
  filter_value: string;
  matched_values: string[];
  documents: MatchingDocument[];
  truncated: boolean;
  note: string;
};

function sourceBody(source?: "jira" | "github" | "all"): Record<string, string> {
  return source && source !== "all" ? { source } : {};
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function stringList(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, cap);
}

/**
 * Exact distinct tag values for one allow-listed field.
 * @param args - Source and required field.
 * @throws StafflessApiError when StaffLess rejects the request.
 */
export async function listDistinctValues(args: CatalogFieldArgs): Promise<DistinctValuesResult> {
  const result = await stafflessFetch<DistinctValuesResult>(STAFFLESS_DOCUMENT_DISTINCT_PATH, {
    json: { ...sourceBody(args.source), field: args.field },
  });
  return {
    field: typeof result?.field === "string" ? result.field : args.field,
    source: typeof result?.source === "string" ? result.source : args.source ?? "all",
    values: stringList(result?.values, 50),
    untagged_count: finiteCount(result?.untagged_count),
    total_indexed: finiteCount(result?.total_indexed),
    truncated: result?.truncated === true,
    note: "Exact distinct indexed tag values, not a search sample.",
  };
}

/**
 * Exact unique-document counts grouped by one allow-listed field.
 * @param args - Source and required field.
 * @throws StafflessApiError when StaffLess rejects the request.
 */
export async function getBreakdownByField(args: CatalogFieldArgs): Promise<BreakdownResult> {
  const result = await stafflessFetch<BreakdownResult>(STAFFLESS_DOCUMENT_BREAKDOWN_PATH, {
    json: { ...sourceBody(args.source), field: args.field },
  });
  const groups = Array.isArray(result?.groups)
    ? result.groups
        .slice(0, 50)
        .map((row) => ({
          value: typeof row?.value === "string" ? row.value : "",
          count: finiteCount(row?.count),
        }))
        .filter((row) => row.value)
    : [];
  return {
    field: typeof result?.field === "string" ? result.field : args.field,
    source: typeof result?.source === "string" ? result.source : args.source ?? "all",
    groups,
    untagged_count: finiteCount(result?.untagged_count),
    total_indexed: finiteCount(result?.total_indexed),
    truncated: result?.truncated === true,
    note: "Exact unique indexed document counts grouped by field, not a search sample.",
  };
}

/**
 * Exact indexed document lookup by ticket/document key.
 * @param args - Key such as RD-82; optional source.
 * @throws StafflessApiError when StaffLess rejects the request.
 */
export async function getDocumentByKey(args: DocumentByKeyArgs): Promise<DocumentByKeyResult> {
  const result = await stafflessFetch<DocumentByKeyResult>(STAFFLESS_DOCUMENT_BY_KEY_PATH, {
    json: { ...sourceBody(args.source), key: args.key },
  });
  const found = result?.found === true;
  return {
    found,
    key: typeof result?.key === "string" ? result.key : args.key,
    title: typeof result?.title === "string" ? result.title : undefined,
    link: typeof result?.link === "string" ? result.link : null,
    source: typeof result?.source === "string" ? result.source : args.source ?? "all",
    fields: found && result?.fields && typeof result.fields === "object" ? sanitizeFields(result.fields) : undefined,
    note: found
      ? "Exact indexed document lookup by key, not a search ranking."
      : "No indexed document with this exact key.",
  };
}

/**
 * Exact indexed documents matching one allow-listed field value, with keys.
 * @param args - Filter field/value such as labels=release123.
 * @throws StafflessApiError when StaffLess rejects the request.
 */
export async function listDocumentsMatching(args: DocumentMatchArgs): Promise<DocumentListResult> {
  const result = await stafflessFetch<DocumentListResult>(STAFFLESS_DOCUMENT_LIST_PATH, {
    json: {
      ...sourceBody(args.source),
      filter_field: args.filter_field,
      filter_value: args.filter_value,
    },
  });
  const documents = Array.isArray(result?.documents)
    ? result.documents.slice(0, 50).map((row) => ({
        key: typeof row?.key === "string" && row.key.trim() ? row.key : null,
        title: typeof row?.title === "string" ? row.title : null,
        link: typeof row?.link === "string" ? row.link : null,
      }))
    : [];
  return {
    count: finiteCount(result?.count),
    source: typeof result?.source === "string" ? result.source : args.source ?? "all",
    filter_field: typeof result?.filter_field === "string" ? result.filter_field : args.filter_field,
    filter_value: typeof result?.filter_value === "string" ? result.filter_value : args.filter_value,
    matched_values: stringList(result?.matched_values, 20),
    documents,
    truncated: result?.truncated === true,
    note: "Exact indexed documents matching this filter, not a search sample.",
  };
}

function sanitizeFields(raw: Record<string, unknown>): Record<string, string | string[]> {
  const allowed = new Set<string>(ALLOWED_COUNT_FIELDS);
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) continue;
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.filter((item): item is string => typeof item === "string").slice(0, 20);
  }
  return out;
}
