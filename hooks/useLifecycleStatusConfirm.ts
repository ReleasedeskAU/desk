/**
 * Client helper for entity status steps that may need a Flexible exception reason.
 * Opens the shared LifecycleExceptionConfirm panel when the API returns
 * TRANSITION_NEEDS_OVERRIDE (or when confirming before retry with a reason).
 */
"use client";

import { useCallback, useMemo, useState } from "react";
import type { FormAlert } from "@/lib/form-save-alert";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { safeFetchJson } from "@/lib/safe-fetch";
import { parseUxNoticesFromHeaders } from "@/lib/ux-notice";
import type { LifecycleExceptionCheck } from "@/components/detail/LifecycleExceptionConfirm";

export type LifecycleStatusConfirmState = {
  targetStatus: string;
  targetLabel: string;
  patchUrl: string;
  /** Extra PATCH fields merged with status / overrideReason (modal save retry). */
  extraBody?: Record<string, unknown>;
  /** Body key for the status write. Approvals use `decision`. */
  statusField?: string;
  /** When true, the exception reason is also written to `conditions`. */
  needsConditions?: boolean;
  needsException: boolean;
  blocked: boolean;
  checks: LifecycleExceptionCheck[];
  leadMessage: string | null;
};

function unmetToChecks(unmet: string[]): LifecycleExceptionCheck[] {
  return unmet.map((reason) => ({
    label: "Check",
    passed: false,
    reason,
    soft: true,
  }));
}

function extractUnmet(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const body = data as Record<string, unknown>;
  const transition =
    body.transition && typeof body.transition === "object"
      ? (body.transition as { unmetReasons?: unknown })
      : null;
  const fromTransition = Array.isArray(transition?.unmetReasons)
    ? transition!.unmetReasons!.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0
      )
    : [];
  const fromBody = Array.isArray(body.unmetReasons)
    ? body.unmetReasons.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0
      )
    : [];
  return fromTransition.length ? fromTransition : fromBody;
}

function extractCode(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

/**
 * Hook: status-step confirm + exception retry for Risk/Incident/Dependency/Conflict/Alert.
 *
 * @param args.entityLabel - Noun for FormAlertDialog titles
 * @param args.onSuccess - Called after a successful PATCH
 */
export function useLifecycleStatusConfirm(args: {
  entityLabel: string;
  onSuccess: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<LifecycleStatusConfirmState | null>(
    null
  );
  const [exceptionReason, setExceptionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<FormAlert | null>(null);

  const confirmDisabled = useMemo(() => {
    if (!pending || busy || pending.blocked) return true;
    if (pending.needsException && exceptionReason.trim().length < 3) return true;
    return false;
  }, [busy, exceptionReason, pending]);

  const cancel = useCallback(() => {
    setPending(null);
    setExceptionReason("");
  }, []);

  const dismissAlert = useCallback(() => setAlert(null), []);

  const runPatch = useCallback(
    async (state: LifecycleStatusConfirmState, reason: string | null) => {
      setBusy(true);
      const statusField = state.statusField ?? "status";
      const body: Record<string, unknown> = {
        ...(state.extraBody ?? {}),
        [statusField]: state.targetStatus,
      };
      if (reason && reason.trim().length >= 3) {
        body.overrideReason = reason.trim();
        if (state.needsConditions) {
          body.conditions = reason.trim();
        }
      }
      const result = await safeFetchJson(state.patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        label: `${args.entityLabel}-status-confirm`,
        rejectHttpErrors: false,
      });
      setBusy(false);

      if (!result.ok) {
        setAlert(
          buildFormSaveAlert(null, result.error, {
            entityLabel: args.entityLabel,
          })
        );
        return;
      }

      const status = result.status ?? 0;
      const data = result.data;

      if (status >= 300) {
        const code = extractCode(data);
        const unmet = extractUnmet(data);

        if (code === "TRANSITION_NEEDS_OVERRIDE" || code === "CONDITIONS_REQUIRED") {
          setPending({
            ...state,
            needsException: true,
            needsConditions: code === "CONDITIONS_REQUIRED" || state.needsConditions,
            blocked: false,
            checks: unmetToChecks(unmet),
            leadMessage:
              typeof data === "object" &&
              data &&
              typeof (data as { error?: string }).error === "string"
                ? (data as { error: string }).error
                : code === "CONDITIONS_REQUIRED"
                  ? "This decision needs the conditions written down before it can be saved."
                  : "This step needs an exception note. Some checks aren’t met.",
          });
          return;
        }

        if (code === "TRANSITION_BLOCKED") {
          setPending({
            ...state,
            needsException: false,
            blocked: true,
            checks: unmet.map((reason) => ({
              label: "Check",
              passed: false,
              reason,
              hard: true,
            })),
            leadMessage:
              typeof data === "object" &&
              data &&
              typeof (data as { error?: string }).error === "string"
                ? (data as { error: string }).error
                : null,
          });
          return;
        }

        setAlert(
          buildFormSaveAlert(data, `Could not update ${args.entityLabel}`, {
            entityLabel: args.entityLabel,
          })
        );
        return;
      }

      setPending(null);
      setExceptionReason("");
      const notices = parseUxNoticesFromHeaders(result.headers);
      if (notices[0]) {
        setAlert({
          title: notices[0].title,
          message: notices[0].message,
          details: notices[0].details,
          variant: "notice",
        });
      }
      await args.onSuccess();
    },
    [args]
  );

  /**
   * Start a status change. Tries PATCH immediately; opens exception panel when needed.
   */
  const requestStatusChange = useCallback(
    async (opts: {
      targetStatus: string;
      targetLabel: string;
      patchUrl: string;
      extraBody?: Record<string, unknown>;
      statusField?: string;
      /** When true, open the confirm panel first (with exception box already shown). */
      openExceptionFirst?: boolean;
    }) => {
      setAlert(null);
      const initial: LifecycleStatusConfirmState = {
        targetStatus: opts.targetStatus,
        targetLabel: opts.targetLabel,
        patchUrl: opts.patchUrl,
        extraBody: opts.extraBody,
        statusField: opts.statusField,
        needsException: Boolean(opts.openExceptionFirst),
        blocked: false,
        checks: [],
        leadMessage: opts.openExceptionFirst
          ? "This step needs an exception note before it can continue."
          : null,
      };
      if (opts.openExceptionFirst) {
        setPending(initial);
        return;
      }
      await runPatch(initial, null);
    },
    [runPatch]
  );

  const confirm = useCallback(async () => {
    if (!pending || confirmDisabled) return;
    await runPatch(
      pending,
      pending.needsException ? exceptionReason : null
    );
  }, [confirmDisabled, exceptionReason, pending, runPatch]);

  /**
   * Open the exception panel directly (e.g. after a modal save hit NEEDS_OVERRIDE).
   */
  const presentException = useCallback(
    (opts: {
      targetStatus: string;
      targetLabel: string;
      patchUrl: string;
      extraBody?: Record<string, unknown>;
      statusField?: string;
      unmetReasons?: string[];
      leadMessage?: string | null;
      needsConditions?: boolean;
    }) => {
      setAlert(null);
      setPending({
        targetStatus: opts.targetStatus,
        targetLabel: opts.targetLabel,
        patchUrl: opts.patchUrl,
        extraBody: opts.extraBody,
        statusField: opts.statusField,
        needsConditions: opts.needsConditions,
        needsException: true,
        blocked: false,
        checks: unmetToChecks(opts.unmetReasons ?? []),
        leadMessage:
          opts.leadMessage ??
          "This step needs an exception note. Some checks aren’t met.",
      });
    },
    []
  );

  return {
    pending,
    exceptionReason,
    setExceptionReason,
    busy,
    confirmDisabled,
    alert,
    setAlert,
    dismissAlert,
    cancel,
    confirm,
    requestStatusChange,
    presentException,
  };
}
