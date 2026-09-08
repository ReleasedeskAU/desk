/**
 * Numeric StaffLess connector / cc-pair ids. Refuse non-digits instead of guessing.
 */

export class StafflessIdError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "StafflessIdError";
    this.status = status;
  }
}

/**
 * Parse a URL id that must be a positive StaffLess integer.
 * Prisma CUIDs and other non-digits are refused — never guessed.
 * @returns The id, or null when the string is not a safe positive integer.
 */
export function parseStafflessId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

type StafflessIdRow = { id: string; ccPairId: number | null };

/**
 * Resolve a connector row by StaffLess connector id, then by cc_pair_id.
 * Connector id wins when the two number sequences overlap.
 * @returns The matching row, or null when neither id matches.
 */
export function findRowByStafflessId<T extends StafflessIdRow>(rows: T[], id: string): T | null {
  const byConnector = rows.find((row) => row.id === id);
  if (byConnector) return byConnector;
  return rows.find((row) => row.ccPairId != null && String(row.ccPairId) === id) ?? null;
}

/**
 * A mutate operation needs exactly one credential on the cc-pair.
 * @throws StafflessIdError when missing or ambiguous.
 */
export function requireSingleCredentialId(credentialIds: number[] | undefined): number {
  const ids = (credentialIds ?? []).filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) {
    throw new StafflessIdError("This connector has no credential to operate on. Re-sync or recreate it.");
  }
  throw new StafflessIdError("This connector has more than one credential. Delete it in StaffLess AI instead of guessing.");
}

/**
 * Pause, prune, and index history need the cc-pair id from the engine.
 * @throws StafflessIdError when the pair is missing.
 */
export function requireCcPairId(ccPairId: number | null | undefined): number {
  if (ccPairId == null || !Number.isSafeInteger(ccPairId) || ccPairId <= 0) {
    throw new StafflessIdError("This connector is not bound to a StaffLess pair yet. Wait for it to appear, or recreate it.");
  }
  return ccPairId;
}
