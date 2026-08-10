/**
 * Enforce sign-off lifecycle rules for Release checklist field patches.
 */
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import type { SignoffReleaseField } from "@/lib/signoff-lifecycle-config";
import { isSignoffChangeDeniedByEditPolicy } from "@/lib/signoff-lifecycle-edit-policy";
import {
  isSignoffReleaseField,
  signoffReleaseFieldsFromConfig,
  validateSignoffTransition,
} from "@/lib/signoff-lifecycle-transition";

export type SignoffEnforceOk = {
  ok: true;
  /** Canonical labels to write onto the release. */
  canonical: Partial<Record<SignoffReleaseField, string>>;
};

export type SignoffEnforceDenied = {
  ok: false;
  httpStatus: 409 | 422;
  body: {
    error: string;
    code: string;
    field?: string;
    transition?: unknown;
  };
};

/**
 * Validate all proposed sign-off field changes against the lifecycle config.
 * @param existing - Current release row values for sign-off fields.
 * @param body - Incoming PATCH body (may include non-signoff keys).
 */
export function enforceSignoffFieldChanges(args: {
  config: SignoffLifecycleConfig;
  existing: Partial<Record<SignoffReleaseField, string | null | undefined>>;
  body: Record<string, unknown>;
}): SignoffEnforceOk | SignoffEnforceDenied {
  const managed = new Set(signoffReleaseFieldsFromConfig(args.config));
  const canonical: Partial<Record<SignoffReleaseField, string>> = {};

  for (const [key, raw] of Object.entries(args.body)) {
    if (raw === undefined) continue;
    if (!isSignoffReleaseField(key)) continue;
    if (!managed.has(key)) {
      // Field not mapped in config — reject unexpected writes rather than silent accept.
      return {
        ok: false,
        httpStatus: 422,
        body: {
          error: `Sign-off field "${key}" is not enabled in the sign-off lifecycle configuration`,
          code: "SIGNOFF_FIELD_DISABLED",
          field: key,
        },
      };
    }
    const next = raw === null ? null : String(raw).trim();
    if (next === null || next === "") {
      return {
        ok: false,
        httpStatus: 422,
        body: {
          error: `Sign-off field "${key}" cannot be cleared — set a lifecycle status instead`,
          code: "SIGNOFF_VALUE_REQUIRED",
          field: key,
        },
      };
    }
    const current = args.existing[key];
    const currentResolved = current ?? "Pending";
    // Same canonical label (incl. legacy Yes → Approved) — allow rewrite to canonical.
    const transition = validateSignoffTransition({
      config: args.config,
      fromStatus: currentResolved,
      toStatus: next,
    });
    if (!transition.allowed) {
      // Terminal/immutable: prefer 409 edit-policy shape when exiting a rendered decision.
      if (
        isSignoffChangeDeniedByEditPolicy(args.config, currentResolved) &&
        transition.code === "ILLEGAL_TRANSITION"
      ) {
        return {
          ok: false,
          httpStatus: 409,
          body: {
            error: `Sign-off "${key}" is immutable in status "${current ?? currentResolved}". Cannot change to "${next}"`,
            code: "EDIT_POLICY_DENIED",
            field: key,
            transition,
          },
        };
      }
      return {
        ok: false,
        httpStatus: 422,
        body: {
          error: transition.reason,
          code: transition.code,
          field: key,
          transition,
        },
      };
    }
    canonical[key] = transition.canonicalStatus;
  }

  return { ok: true, canonical };
}
