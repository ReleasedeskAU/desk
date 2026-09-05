/**
 * Presentation helpers for Ask answers. Does not change catalog lookups.
 */

import { PII_TAG_FIELDS } from "@/lib/staffless/ask-count";
import type { DocumentByKeyResult } from "@/lib/staffless/ask-catalog";
import { ASK_TOOL_DOCUMENT_BY_KEY, ASK_TOOL_QUERYABLE_FIELDS } from "@/lib/staffless/ask-tools";
import { safeHttpUrl } from "@/lib/staffless/ask-packets";

/** Display labels for published fields only — not used for matching. */
const FIELD_LABELS: Record<string, string> = {
  key: "Key",
  issuetype: "Type",
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  reporter: "Reporter",
  parent: "Parent",
  duedate: "Due date",
  created: "Created",
  updated: "Updated",
  project: "Project",
  project_name: "Project name",
  labels: "Labels",
  resolution: "Resolution",
  resolution_date: "Resolution date",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

const BLOCKED = new Set<string>(PII_TAG_FIELDS);

/**
 * True when this turn only looked up one ticket (plus optional schema).
 * Mixed tool turns still need the model to combine results.
 */
export function isDocumentOnlyTurn(tools: readonly string[]): boolean {
  if (!tools.includes(ASK_TOOL_DOCUMENT_BY_KEY)) return false;
  return tools.every(
    (name) => name === ASK_TOOL_DOCUMENT_BY_KEY || name === ASK_TOOL_QUERYABLE_FIELDS
  );
}

/**
 * Parse a get_document_by_key tool payload. Extra/unknown shapes are ignored.
 */
export function parseDocumentByKeyResult(raw: string): DocumentByKeyResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (typeof rec.found !== "boolean" || typeof rec.key !== "string") return null;
  if (rec.error) return null;
  return rec as DocumentByKeyResult;
}

/**
 * Field | Value markdown for one indexed ticket. Only stored allow-listed values.
 * @param doc - Result from get_document_by_key.
 */
export function formatDocumentByKeyAnswer(doc: DocumentByKeyResult): string {
  if (!doc.found) {
    return doc.note || "No indexed document with this exact key.";
  }
  const rows = buildFieldRows(doc);
  const heading = doc.title?.trim() || doc.key;
  const table = [
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${escapeCell(label)} | ${escapeCell(value)} |`),
  ].join("\n");
  return `### ${heading}\n\n${table}`;
}

function buildFieldRows(doc: DocumentByKeyResult): [string, string][] {
  const fields = doc.fields && typeof doc.fields === "object" ? doc.fields : {};
  const rows: [string, string][] = [];
  const seen = new Set<string>();
  if (doc.key) {
    rows.push(["Key", doc.key]);
    seen.add("key");
  }
  for (const key of FIELD_ORDER) {
    if (key === "key" || seen.has(key) || BLOCKED.has(key)) continue;
    const raw = fields[key];
    const value = formatFieldValue(raw);
    if (!value) continue;
    rows.push([FIELD_LABELS[key] ?? key, value]);
    seen.add(key);
  }
  const link = safeHttpUrl(doc.link);
  if (link) rows.push(["Link", `[Open ticket](${link})`]);
  return rows;
}

function formatFieldValue(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === "string" && item.trim()).join(", ");
  return "";
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
