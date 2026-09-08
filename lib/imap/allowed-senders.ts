/**
 * Allow-list of From addresses and domains for StaffLess IMAP.
 * Must stay aligned with onyx-foss allowed_senders.py.
 */

export const ALLOWED_SENDERS_MAX = 50;
const MAX_ENTRY_LEN = 254;
const FORBIDDEN = /["\\\r\n{}]/;

export type AllowedSender = { kind: "address" | "domain"; value: string };

/**
 * Parse wizard entries into addresses and domains.
 * @throws Error when an entry is unsafe for IMAP SEARCH or the list is too long.
 */
export function parseAllowedSenders(raw: unknown): AllowedSender[] {
  const entries = splitSenderEntries(raw);
  if (entries.length === 0) return [];
  if (entries.length > ALLOWED_SENDERS_MAX) {
    throw new Error(`At most ${ALLOWED_SENDERS_MAX} approved senders or domains are allowed`);
  }
  const seen = new Set<string>();
  const out: AllowedSender[] = [];
  for (const entry of entries) {
    const rule = parseOne(entry);
    const key = `${rule.kind}:${rule.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

/**
 * Values to send as StaffLess `allowed_senders`. Empty means no sender filter.
 */
export function allowedSenderValues(raw: unknown): string[] {
  return parseAllowedSenders(raw).map((rule) => rule.value);
}

function splitSenderEntries(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseOne(entry: string): AllowedSender {
  if (entry.length > MAX_ENTRY_LEN) {
    throw new Error("Each approved sender or domain is too long");
  }
  if (FORBIDDEN.test(entry) || [...entry].some((ch) => ch.charCodeAt(0) === 0)) {
    throw new Error("Approved senders cannot include quotes or IMAP special characters");
  }
  if (!/^[\x20-\x7E]+$/.test(entry)) {
    throw new Error("Approved senders must be ASCII");
  }
  if (entry.startsWith("@") && entry.split("@").length === 2) {
    return { kind: "domain", value: normalizeDomain(entry.slice(1)) };
  }
  if (entry.includes("@")) {
    return { kind: "address", value: normalizeAddress(entry) };
  }
  return { kind: "domain", value: normalizeDomain(entry) };
}

function normalizeAddress(entry: string): string {
  const parts = entry.split("@");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    throw new Error("Each approved address needs exactly one @");
  }
  return `${parts[0].trim().toLowerCase()}@${normalizeDomain(parts[1])}`;
}

function normalizeDomain(entry: string): string {
  const domain = entry.trim().toLowerCase().replace(/^\.+/, "");
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    throw new Error("Approved domains must look like company.com");
  }
  if (domain.includes(" ") || domain.includes("@")) {
    throw new Error("Approved domains cannot contain spaces or @");
  }
  return domain;
}
