/**
 * Shared create-path guard: status must be an enabled lifecycle label.
 */
import { NextResponse } from "next/server";
import {
  defaultEntityStatusLabel,
  findEntityStatusByLabel,
  isEnabledEntityStatusLabel,
  type EntityLifecycleConfigLike,
} from "@/lib/entity-lifecycle-status-ui";

export type LifecycleCreateStatusResult =
  | { ok: true; status: string; statusKey: string }
  | { ok: false; response: NextResponse };

/**
 * Resolve and validate a create status against a loaded lifecycle config.
 * @param config - Caller's lifecycle graph.
 * @param requested - Body status (may be empty).
 * @param entityLabel - For error message (e.g. "blocker").
 */
export function resolveCreateLifecycleStatus(
  config: EntityLifecycleConfigLike,
  requested: unknown,
  entityLabel: string
): LifecycleCreateStatusResult {
  const fallback = defaultEntityStatusLabel(config);
  const status = String(requested ?? fallback).trim() || fallback;
  if (!isEnabledEntityStatusLabel(config, status)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Status is not enabled in the ${entityLabel} lifecycle configuration`,
        },
        { status: 400 }
      ),
    };
  }
  const found = findEntityStatusByLabel(config, status);
  return {
    ok: true,
    status: found?.label ?? status,
    statusKey: found?.key ?? status,
  };
}
