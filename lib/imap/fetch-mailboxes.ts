/**
 * List IMAP folders with the mailbox username + password.
 * Runs on the Next.js server only. Do not log the password.
 */

import { lookup } from "node:dns/promises";
import { connect, type TLSSocket } from "node:tls";
import { ImapHostError, isPrivateIPv4, isPrivateIPv6, parsePublicImapHost } from "@/lib/imap/host";
import { mapImapListPayload, type ImapFolderOption } from "@/lib/imap/mailboxes";

const TIMEOUT_MS = 15_000;
const MAX_FOLDERS = 200;
const MAX_BUFFER = 1_000_000;

export class ImapFoldersFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ImapFoldersFetchError";
    this.status = status;
  }
}

/**
 * LOGIN then LIST. Caps at 200 selectable folders.
 * @throws ImapHostError | ImapFoldersFetchError
 */
export async function fetchImapFolders(
  hostRaw: string,
  port: number,
  username: string,
  password: string
): Promise<ImapFolderOption[]> {
  const host = parsePublicImapHost(hostRaw);
  let address: string;
  let family: number;
  try {
    const resolved = await lookup(host);
    address = resolved.address;
    family = resolved.family;
  } catch {
    throw new ImapFoldersFetchError("IMAP is unavailable", 502);
  }
  if (family === 4 && isPrivateIPv4(address)) {
    throw new ImapHostError("That IMAP host is not allowed");
  }
  if (family === 6 && isPrivateIPv6(address)) {
    throw new ImapHostError("That IMAP host is not allowed");
  }

  const user = username.trim();
  if (!user || !password) {
    throw new ImapFoldersFetchError("IMAP username and password are required", 400);
  }

  const session = await ImapClient.connect(host, port);
  try {
    const login = await session.command(`LOGIN ${quoteImap(user)} ${quoteImap(password)}`);
    if (!login.ok) {
      throw new ImapFoldersFetchError(publicImapLoginMessage(login.statusLine), 401);
    }
    const listed = await session.command('LIST "" "*"');
    if (!listed.ok) {
      throw new ImapFoldersFetchError("IMAP could not list folders", 502);
    }
    const folders = mapImapListPayload(listed.untagged).slice(0, MAX_FOLDERS);
    folders.sort((a, b) => a.name.localeCompare(b.name));
    return folders;
  } finally {
    await session.close();
  }
}

function quoteImap(value: string): string {
  if (/["\\\r\n]/.test(value)) {
    throw new ImapFoldersFetchError("IMAP username and password cannot include quotes", 400);
  }
  return `"${value}"`;
}

function publicImapLoginMessage(statusLine: string): string {
  const text = statusLine.toUpperCase();
  if (
    text.includes("AUTHENTICATIONFAILED") ||
    text.includes("LOGIN FAILED") ||
    text.includes("INVALID") ||
    text.includes("NO ")
  ) {
    return "IMAP rejected those credentials. Many Microsoft 365 organizations block basic IMAP login.";
  }
  return "IMAP rejected those credentials";
}

type CommandResult = { ok: boolean; statusLine: string; untagged: string[] };

class ImapClient {
  private tag = 0;
  private buffer = Buffer.alloc(0);

  private constructor(private readonly socket: TLSSocket) {}

  static connect(host: string, port: number): Promise<ImapClient> {
    return new Promise((resolve, reject) => {
      const socket = connect({
        host,
        port,
        servername: host,
        timeout: TIMEOUT_MS,
      });
      socket.setTimeout(TIMEOUT_MS);
      const client = new ImapClient(socket);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new ImapFoldersFetchError("IMAP is unavailable", 502));
      }, TIMEOUT_MS);
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(new ImapFoldersFetchError("IMAP is unavailable", 502));
        void err;
      });
      socket.once("secureConnect", () => {
        client
          .readGreeting()
          .then(() => {
            clearTimeout(timer);
            resolve(client);
          })
          .catch((err) => {
            clearTimeout(timer);
            socket.destroy();
            reject(err);
          });
      });
    });
  }

  async command(payload: string): Promise<CommandResult> {
    this.tag += 1;
    const tag = `A${this.tag}`;
    this.socket.write(`${tag} ${payload}\r\n`);
    const untagged: string[] = [];
    while (true) {
      const line = await this.readLine();
      if (line.startsWith("* ")) {
        untagged.push(line);
        continue;
      }
      if (line.startsWith(`${tag} `)) {
        const rest = line.slice(tag.length + 1);
        const ok = rest.toUpperCase().startsWith("OK");
        return { ok, statusLine: rest, untagged };
      }
    }
  }

  async close(): Promise<void> {
    try {
      this.socket.write("A99 LOGOUT\r\n");
    } catch {
      // Socket may already be gone after a login failure.
    }
    this.socket.destroy();
  }

  private async readGreeting(): Promise<void> {
    const line = await this.readLine();
    if (!line.toUpperCase().startsWith("* OK")) {
      throw new ImapFoldersFetchError("IMAP is unavailable", 502);
    }
  }

  private readLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      const tryRead = () => {
        const idx = this.buffer.indexOf("\n");
        if (idx === -1) return false;
        const raw = this.buffer.subarray(0, idx).toString("utf8").replace(/\r$/, "");
        this.buffer = this.buffer.subarray(idx + 1);
        resolve(raw);
        return true;
      };
      if (tryRead()) return;
      const onData = (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length > MAX_BUFFER) {
          this.socket.off("data", onData);
          reject(new ImapFoldersFetchError("IMAP is unavailable", 502));
          return;
        }
        if (tryRead()) this.socket.off("data", onData);
      };
      this.socket.on("data", onData);
      this.socket.once("error", () => {
        this.socket.off("data", onData);
        reject(new ImapFoldersFetchError("IMAP is unavailable", 502));
      });
    });
  }
}
