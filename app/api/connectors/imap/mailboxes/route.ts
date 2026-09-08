import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { fetchImapFolders, ImapFoldersFetchError } from "@/lib/imap/fetch-mailboxes";
import { ImapHostError } from "@/lib/imap/host";
import { logger } from "@/lib/logger";

const bodySchema = z
  .object({
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(500),
  })
  .strict();

const lastCallByKey = new Map<string, number>();
const COOLDOWN_MS = 5_000;

function cooldownKey(username: string, host: string): string {
  return createHash("sha256").update(`${username}\0${host}`).digest("hex").slice(0, 16);
}

/**
 * List live IMAP folders for the wizard. Calls the IMAP host, not StaffLess.
 * Username and password are not logged and are not stored.
 */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "IMAP host, username, and password are required" }, { status: 400 });
  }

  const now = Date.now();
  const key = cooldownKey(parsed.data.username, parsed.data.host);
  const last = lastCallByKey.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return NextResponse.json({ error: "Please wait a few seconds before listing folders again" }, { status: 429 });
  }
  lastCallByKey.set(key, now);

  try {
    const folders = await fetchImapFolders(
      parsed.data.host,
      parsed.data.port ?? 993,
      parsed.data.username,
      parsed.data.password
    );
    return NextResponse.json({ folders });
  } catch (err) {
    if (err instanceof ImapHostError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ImapFoldersFetchError) {
      logger.warn("api/connectors/imap/mailboxes", { status: err.status });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("api/connectors/imap/mailboxes", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "IMAP is unavailable" }, { status: 502 });
  }
}
