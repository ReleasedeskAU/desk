import type { Connector } from "@releasedesk/database";

export type ConnectorPublic = Omit<Connector, "credentials">;

export function stripCredentials<T extends { credentials?: string }>(
  row: T
): Omit<T, "credentials"> {
  const { credentials: _c, ...rest } = row;
  return rest;
}

export function stripCredentialsList<T extends { credentials?: string }>(
  rows: T[]
): Omit<T, "credentials">[] {
  return rows.map(stripCredentials);
}

/** Map Connector rows to legacy dashboard shape { name, lastSynced }. */
export function toLegacyConnectorSummary(
  rows: Array<{ name: string; lastSyncedAt: Date | null }>
): { name: string; lastSynced: string }[] {
  return rows.map((c) => ({
    name: c.name,
    lastSynced: c.lastSyncedAt?.toISOString() ?? new Date(0).toISOString(),
  }));
}
