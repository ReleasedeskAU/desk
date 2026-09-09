/**
 * Allow-list for native scope / change-request attachments.
 * PDF, Word, and email message files only. Never trust client MIME alone.
 */

export const SCOPE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const SCOPE_ATTACHMENT_KINDS = ["pdf", "word", "email"] as const;
export type ScopeAttachmentKind = (typeof SCOPE_ATTACHMENT_KINDS)[number];

const PDF_MIME = "application/pdf";
const DOC_MIME = "application/msword";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EML_MIME = "message/rfc822";
const MSG_MIME = "application/vnd.ms-outlook";

const EXT_TO_KIND: Record<string, ScopeAttachmentKind> = {
  ".pdf": "pdf",
  ".doc": "word",
  ".docx": "word",
  ".eml": "email",
  ".msg": "email",
};

/**
 * File extension including the leading dot, lowercased.
 *
 * @param fileName - Client-supplied name (basename only is used).
 */
export function attachmentExtension(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i).toLowerCase() : "";
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function looksLikeOle(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function looksLikeEmailText(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 512)).toLowerCase();
  return (
    head.includes("mime-version:") ||
    head.startsWith("from:") ||
    head.includes("\nfrom:") ||
    head.startsWith("received:") ||
    head.includes("content-type: message/")
  );
}

/**
 * Canonical MIME for a validated kind + extension.
 *
 * @param kind - Allow-listed kind.
 * @param ext - Lowercased extension.
 */
export function canonicalAttachmentMime(kind: ScopeAttachmentKind, ext: string): string {
  if (kind === "pdf") return PDF_MIME;
  if (kind === "word") return ext === ".doc" ? DOC_MIME : DOCX_MIME;
  return ext === ".msg" ? MSG_MIME : EML_MIME;
}

export type AttachmentValidation =
  | { ok: true; kind: ScopeAttachmentKind; mimeType: string; ext: string }
  | { ok: false; error: string };

/**
 * Validate an uploaded buffer. Extension and content must agree.
 * Client MIME is ignored.
 *
 * @param fileName - Original file name.
 * @param bytes - File bytes (at least the header).
 */
export function validateScopeAttachment(fileName: string, bytes: Uint8Array): AttachmentValidation {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "Empty files cannot be attached." };
  }
  if (bytes.byteLength > SCOPE_ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "File is too large. Maximum size is 10 MB." };
  }
  const ext = attachmentExtension(fileName);
  const kind = EXT_TO_KIND[ext];
  if (!kind) {
    return { ok: false, error: "Only PDF, Word, and email message files can be attached." };
  }
  if (kind === "pdf" && !looksLikePdf(bytes)) {
    return { ok: false, error: "File content is not a PDF." };
  }
  if (kind === "word" && ext === ".doc" && !looksLikeOle(bytes)) {
    return { ok: false, error: "File content is not a Word document." };
  }
  if (kind === "word" && ext === ".docx" && !looksLikeZip(bytes)) {
    return { ok: false, error: "File content is not a Word document." };
  }
  if (kind === "email" && ext === ".msg" && !looksLikeOle(bytes)) {
    return { ok: false, error: "File content is not an email message." };
  }
  if (kind === "email" && ext === ".eml" && !looksLikeEmailText(bytes)) {
    return { ok: false, error: "File content is not an email message." };
  }
  return { ok: true, kind, mimeType: canonicalAttachmentMime(kind, ext), ext };
}

/**
 * Safe download file name (basename only).
 *
 * @param fileName - Stored original name.
 */
export function safeAttachmentDownloadName(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "attachment";
  return base.replace(/[^\w.\- ()[\]]+/g, "_") || "attachment";
}
