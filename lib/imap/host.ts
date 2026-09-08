/**
 * Reject private/non-public IMAP hosts so folder listing cannot be used as SSRF.
 */

export class ImapHostError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ImapHostError";
    this.status = status;
  }
}

/**
 * Hostname only (no URL, no IP literal, no localhost).
 * @throws ImapHostError when the host is not a public DNS name.
 */
export function parsePublicImapHost(raw: string): string {
  const host = raw.trim().toLowerCase();
  if (!host || host.includes("://") || host.includes("/") || host.includes("@") || host.includes(" ")) {
    throw new ImapHostError("Enter the IMAP hostname only, like outlook.office365.com");
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ImapHostError("That IMAP host is not allowed");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new ImapHostError("That IMAP host is not allowed");
  }
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
    throw new ImapHostError("Enter a valid IMAP hostname");
  }
  return host;
}

/** True when an IPv4 address is loopback, link-local, or RFC1918. */
export function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** True when an IPv6 address is loopback, link-local, or unique-local. */
export function isPrivateIPv6(address: string): boolean {
  const host = address.toLowerCase();
  return host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd");
}
