import { prisma } from "@/lib/prisma";
import { ReleaseEventImmutableError } from "@/lib/copilot/errors";
import type { Prisma } from "@releasedesk/database";

export type AppendReleaseEventInput = {
  organizationId?: string | null;
  releaseId: string;
  eventType: string;
  actorId?: string | null;
  payload: Prisma.InputJsonValue;
  hash?: string | null;
  knuctTxRef?: string | null;
  anchoredAt?: Date | null;
};

/**
 * Sole application write path for ReleaseEvent — append-only.
 *
 * @param input - Event fields to insert. organizationId is optional/unenforced.
 * @returns The created ReleaseEvent row.
 * @sideEffects Inserts one ReleaseEvent via Prisma create.
 * @throws Never throws for org isolation (orgId is not filtered/enforced).
 */
export async function appendEvent(input: AppendReleaseEventInput) {
  return prisma.releaseEvent.create({
    data: {
      organizationId: input.organizationId ?? null,
      releaseId: input.releaseId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      payload: input.payload,
      hash: input.hash ?? null,
      knuctTxRef: input.knuctTxRef ?? null,
      anchoredAt: input.anchoredAt ?? null,
    },
  });
}

/**
 * Guard: ReleaseEvent must never be updated through this repo.
 *
 * @param _id - Ignored; present only so call sites look like a normal update API.
 * @throws {ReleaseEventImmutableError} Always.
 */
export async function updateReleaseEvent(_id: string, _data: unknown): Promise<never> {
  throw new ReleaseEventImmutableError("update");
}

/**
 * Guard: ReleaseEvent must never be deleted through this repo.
 *
 * @param _id - Ignored; present only so call sites look like a normal delete API.
 * @throws {ReleaseEventImmutableError} Always.
 */
export async function deleteReleaseEvent(_id: string): Promise<never> {
  throw new ReleaseEventImmutableError("delete");
}
