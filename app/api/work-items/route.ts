import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { summarizeWorkItems } from "@/lib/dependency-impact";
import { ensureDbAwake, isRetryableDbError, prisma, withDbRetry } from "@/lib/prisma";

export const maxDuration = 60;

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

const querySchema = z
  .object({
    connectorId: z.string().trim().min(1).max(64).optional(),
    source: z.string().trim().min(1).max(64).optional(),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).max(50_000).optional(),
  })
  .strict();

/**
 * Lists synced WorkItems (Jira/GitHub/etc.) for the Connectors demo view.
 * Rejects unexpected query params; never returns credentials.
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { connectorId, source, q, limit = DEFAULT_LIMIT, offset = 0 } = parsed.data;

  try {
    await ensureDbAwake();

    const where = {
      ...(connectorId ? { connectorId } : {}),
      ...(source ? { source } : {}),
      ...(q
        ? {
            OR: [
              { externalId: { contains: q, mode: "insensitive" as const } },
              { title: { contains: q, mode: "insensitive" as const } },
              { releaseCode: { contains: q, mode: "insensitive" as const } },
              { assignee: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, items, summaryRows, connectors, jiraLastSync] = await withDbRetry(
      () =>
        Promise.all([
          prisma.workItem.count({ where }),
          prisma.workItem.findMany({
            where,
            orderBy: [{ updatedAt: "desc" }, { externalId: "asc" }],
            take: limit,
            skip: offset,
            select: {
              id: true,
              externalId: true,
              title: true,
              itemType: true,
              releaseCode: true,
              status: true,
              assignee: true,
              priority: true,
              blockedBy: true,
              source: true,
              connectorId: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          prisma.workItem.findMany({
            where,
            select: { status: true, itemType: true },
          }),
          prisma.connector.findMany({
            where: { enabled: true },
            select: { id: true, name: true, type: true, lastSyncedAt: true },
            orderBy: { name: "asc" },
          }),
          prisma.connector.findFirst({
            where: { type: "jira", enabled: true },
            select: { lastSyncedAt: true },
            orderBy: { lastSyncedAt: "desc" },
          }),
        ]),
      { label: "work-items-list" }
    );

    return NextResponse.json({
      items,
      total,
      limit,
      offset,
      summary: summarizeWorkItems(summaryRows),
      lastSynced: jiraLastSync?.lastSyncedAt ?? null,
      connectors: connectors.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        lastSyncedAt: c.lastSyncedAt,
      })),
    });
  } catch (err) {
    console.error("[api/work-items]", err);
    const transient = isRetryableDbError(err);
    return NextResponse.json(
      { error: transient ? "Database temporarily unavailable" : "Failed to load work items" },
      { status: transient ? 503 : 500, headers: transient ? { "Retry-After": "3" } : undefined }
    );
  }
}
