/**
 * Map an IMAP LIST response line onto a selectable folder name.
 */

export type ImapFolderOption = { name: string };

const LIST_LINE = /^\*\s+LIST\s+\(([^)]*)\)\s+"([^"]*)"\s+"?(.+?)"?\s*$/i;

/**
 * Parse one IMAP LIST line. Skips \Noselect. Extra flags are ignored.
 */
export function mapImapListLine(raw: string): ImapFolderOption | null {
  const line = raw.trim();
  if (!line.toUpperCase().startsWith("* LIST")) return null;
  const match = line.match(LIST_LINE);
  if (!match) return null;
  const flags = match[1].toUpperCase();
  if (flags.includes("\\NOSELECT")) return null;
  let name = match[3].trim();
  if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
    name = name.slice(1, -1);
  }
  if (!name) return null;
  return { name };
}

/**
 * Unique folder names from LIST lines (or a joined transcript). Caps duplicates.
 */
export function mapImapListPayload(payload: unknown): ImapFolderOption[] {
  const lines = typeof payload === "string" ? payload.split(/\r?\n/) : Array.isArray(payload) ? payload : [];
  const seen = new Set<string>();
  const out: ImapFolderOption[] = [];
  for (const item of lines) {
    if (typeof item !== "string") continue;
    const mapped = mapImapListLine(item);
    if (!mapped || seen.has(mapped.name)) continue;
    seen.add(mapped.name);
    out.push(mapped);
  }
  return out;
}

/**
 * Unique mailbox names from wizard config. Empty means the caller must reject save.
 */
export function parseImapMailboxNames(config?: Record<string, unknown>): string[] {
  const raw = config?.mailboxes;
  const parts = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
