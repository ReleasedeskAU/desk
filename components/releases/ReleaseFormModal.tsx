"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-multi-select";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { EditSuccessDialog } from "@/components/detail/editable/EditSuccessDialog";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";
import { diffDraftChanges, type FieldChange } from "@/lib/detail-edit-diff";
import { cn } from "@/lib/utils";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { LifecycleExceptionConfirm } from "@/components/detail/LifecycleExceptionConfirm";
import { LifecycleStatusSelect } from "@/components/detail/LifecycleStatusSelect";
import { LifecycleTerminalStatusNotice } from "@/components/detail/LifecycleTerminalStatusNotice";
import {
  buildReleaseFormSaveAlert,
  type ReleaseFormAlert,
} from "@/lib/release-form-save-alert";
import { parseUxNoticesFromHeaders } from "@/lib/ux-notice";
import {
  createDefaultReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import {
  defaultReleaseStatusLabel,
  editReleaseStatusOptions,
  enabledReleaseStatusLabels,
  previewEditLegalNext,
} from "@/lib/release-lifecycle-status-ui";
import {
  MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH,
  resolveLifecycleStatusRef,
  type LegalNextStatusView,
} from "@/lib/release-lifecycle-transition";
import { shouldShowTerminalLifecycleEditNotice } from "@/lib/lifecycle-terminal-edit-notice";
import {
  RELEASE_APPROVAL_STATUS_OPTIONS,
  RELEASE_PLAN_PROGRESS_OPTIONS,
  RELEASE_ROLLBACK_PLAN_OPTIONS,
  selectOptionsWithCurrent,
} from "@/lib/release-checklist-options";
import {
  createDefaultSignoffLifecycleConfig,
  type SignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config";
import {
  legalNextSignoffStatuses,
  signoffDecisionTypesForForm,
} from "@/lib/signoff-lifecycle-transition";
import { ConflictChoiceDialog } from "@/components/conflicts/ConflictChoiceDialog";
import type { ConflictFinding } from "@/lib/conflict-finding-types";

/**
 * Build a PATCH body with only fields that differ from the edit baseline.
 * Skips denormalized `owner` unless `releaseOwnerId` changed (server syncs it).
 */
function sparseReleaseEditPayload(
  baseline: ReleaseFormData,
  full: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const norm = (key: string, value: unknown): string => {
    if (key === "programProject") {
      return normalizeProgramProject(String(value ?? "")) ?? "N/A";
    }
    if (key === "applicationIds" || key === "dependsOnReleaseIds" || key === "stakeholderIds") {
      if (!Array.isArray(value)) return "";
      return value
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
        .sort()
        .join("\0");
    }
    if (value == null || value === "") return "";
    return String(value).trim();
  };

  for (const [key, value] of Object.entries(full)) {
    if (key === "id" || key === "owner") continue;
    const before = norm(key, (baseline as Record<string, unknown>)[key]);
    const after = norm(key, value);
    if (before !== after) payload[key] = value;
  }
  if (payload.releaseOwnerId !== undefined) {
    payload.owner = full.owner;
  }
  return payload;
}

/** Fields needed to create/update a release — not every table column. */
export type ReleaseFormData = {
  id?: string;
  releaseCode: string;
  name: string;
  programProject: string;
  owner: string;
  status: string;
  releaseDate: string;
  priority: string;
  impact: string;
  departmentId: string;
  applicationIds: string[];
  dependsOnReleaseIds: string[];
  notes: string;
  releaseSize: string;
  cabDate: string;
  startDate: string;
  testEnvRequired: string;
  uatEnvRequired: string;
  releaseOwnerId: string;
  approvalStatus: string;
  rollbackPlan: string;
  hypercarePlan: string;
  commsPlan: string;
  trainingStatus: string;
  stakeholderIds: string[];
  devSignoff: string;
  testSignoff: string;
  uatSignoff: string;
  securityClearance: string;
  businessSignoff: string;
  opsSignoff: string;
};

type Option = { value: string; label: string };
type AppOption = Option & { departmentId: string };
type EnvOption = Option & { applicationId: string };
type UserOption = Option;

const RELEASE_EDIT_LABELS: Partial<Record<keyof ReleaseFormData, string>> = {
  name: "Name",
  programProject: "Program / Project",
  owner: "Owner",
  status: "Status",
  releaseDate: "End date",
  priority: "Priority",
  impact: "Impact",
  departmentId: "Department",
  applicationIds: "Applications",
  dependsOnReleaseIds: "Depends on",
  notes: "Notes",
  releaseSize: "Release size",
  cabDate: "CAB date",
  startDate: "Start date",
  testEnvRequired: "Test env",
  uatEnvRequired: "UAT env",
  releaseOwnerId: "Release owner",
  approvalStatus: "Approval status",
  rollbackPlan: "Rollback plan",
  hypercarePlan: "Hypercare plan",
  commsPlan: "Comms plan",
  trainingStatus: "Training status",
  stakeholderIds: "Stakeholders",
  devSignoff: "Tech Review",
  testSignoff: "QA Sign-Off — Test Phase",
  uatSignoff: "QA Sign-Off — UAT Phase",
  securityClearance: "Security Review",
  businessSignoff: "Business Review",
  opsSignoff: "Operations Review",
};

type CreatedSummary = {
  id: string;
  releaseCode: string;
  name: string;
  department: string;
  owner: string;
  applications: string;
  status: string;
  releaseDate: string;
  uatEnvRequired: string;
  testEnvRequired: string;
};

const PRIORITIES = ["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"];
const IMPACTS = ["High", "Medium", "Low"];
const RELEASE_SIZES = ["Small", "Medium", "Large"];

const EMPTY_FORM: ReleaseFormData = {
  releaseCode: "",
  name: "",
  programProject: "",
  owner: "",
  status: "",
  releaseDate: "",
  priority: "P3 - Medium",
  impact: "Medium",
  departmentId: "",
  applicationIds: [],
  dependsOnReleaseIds: [],
  notes: "",
  releaseSize: "Medium",
  cabDate: "",
  startDate: "",
  testEnvRequired: "",
  uatEnvRequired: "",
  releaseOwnerId: "",
  approvalStatus: "",
  rollbackPlan: "",
  hypercarePlan: "",
  commsPlan: "",
  trainingStatus: "",
  stakeholderIds: [],
  devSignoff: "",
  testSignoff: "",
  uatSignoff: "",
  securityClearance: "",
  businessSignoff: "",
  opsSignoff: "",
};

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function RequiredMark() {
  return <span className="text-rose-500"> *</span>;
}

export function ReleaseFormModal({
  open,
  initial,
  existingReleaseCodes,
  departments,
  applications,
  environments = [],
  releases,
  statusOptions: statusOptionsProp,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Partial<ReleaseFormData> | null;
  existingReleaseCodes: string[];
  departments: Option[];
  applications: AppOption[];
  environments?: EnvOption[];
  releases: Option[];
  /** Enabled lifecycle status labels from parent (SSOT). */
  statusOptions?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReleaseFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadedEnvs, setLoadedEnvs] = useState<EnvOption[]>([]);
  const [lifecycleStatusOptions, setLifecycleStatusOptions] = useState<string[]>(
    []
  );
  const [editLegalNext, setEditLegalNext] = useState<LegalNextStatusView[]>([]);
  const [legalNextLoading, setLegalNextLoading] = useState(false);
  const [currentIsTerminal, setCurrentIsTerminal] = useState<boolean | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [defaultStatusLabel, setDefaultStatusLabel] = useState("Draft");
  const [signoffConfig, setSignoffConfig] = useState<SignoffLifecycleConfig>(
    createDefaultSignoffLifecycleConfig
  );
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ReleaseFormData, string>>>({});
  const [formAlert, setFormAlert] = useState<ReleaseFormAlert | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictFinding[]>([]);
  const [highlightReleaseDate, setHighlightReleaseDate] = useState(false);
  const [raisingConflicts, setRaisingConflicts] = useState(false);
  const [raisedForRm, setRaisedForRm] = useState(false);
  const pendingReleaseCode = useRef("");
  const [created, setCreated] = useState<CreatedSummary | null>(null);
  const [editChanges, setEditChanges] = useState<FieldChange[] | null>(null);
  const editBaseline = useRef<ReleaseFormData | null>(null);
  const exceptionReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const isEdit = Boolean(initial?.id);

  /**
   * Scroll/focus the exception reason field (Flexible gates). Never bury this
   * behind an OK-only alert — users need a place to type the reason.
   */
  const focusExceptionReason = () => {
    window.requestAnimationFrame(() => {
      const el = exceptionReasonRef.current;
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus();
    });
  };

  /**
   * Promote the selected next status to needs_override when the API (or a
   * stale preview) said allowed but Flexible checks actually failed.
   */
  const markSelectedStatusNeedsOverride = (unmetReasons: string[]) => {
    const target = form.status.trim().toLocaleLowerCase();
    setEditLegalNext((prev) =>
      prev.map((item) => {
        if (item.label.trim().toLocaleLowerCase() !== target) return item;
        const softGates =
          unmetReasons.length > 0
            ? unmetReasons.map((reason, index) => ({
                gateType: "blocker_resolved" as const,
                label: index === 0 ? "Blocker resolved" : "Check",
                passed: false,
                enforcement: "flexible" as const,
                reason,
                soft: true,
                hard: false,
              }))
            : item.gates.map((gate) =>
                gate.passed
                  ? gate
                  : {
                      ...gate,
                      soft: true,
                      hard: false,
                      enforcement: "flexible" as const,
                    }
              );
        return {
          ...item,
          outcome: "needs_override" as const,
          gates: softGates.length > 0 ? softGates : item.gates,
        };
      })
    );
  };

  const editStatusChoices = useMemo(
    () =>
      isEdit
        ? editReleaseStatusOptions(initial?.status || form.status || "", editLegalNext)
        : [],
    [editLegalNext, form.status, initial?.status, isEdit]
  );

  const showTerminalStatusNotice = useMemo(() => {
    if (!isEdit) return false;
    const current = (initial?.status || form.status || "").trim();
    return shouldShowTerminalLifecycleEditNotice({
      currentLabel: current,
      legalNextCount: editLegalNext.length,
      isTerminal: currentIsTerminal,
    });
  }, [currentIsTerminal, editLegalNext.length, form.status, initial?.status, isEdit]);

  const selectedNext = useMemo(() => {
    if (!isEdit) return null;
    const current = (initial?.status ?? "").trim().toLocaleLowerCase();
    if (form.status.trim().toLocaleLowerCase() === current) return null;
    return (
      editLegalNext.find(
        (item) => item.label.trim().toLocaleLowerCase() === form.status.trim().toLocaleLowerCase()
      ) ?? null
    );
  }, [editLegalNext, form.status, initial?.status, isEdit]);

  const statusOptions = useMemo(() => {
    if (isEdit) {
      const labels = editStatusChoices.map((o) => o.label);
      if (form.status && !labels.some((l) => l === form.status)) {
        return [...labels, form.status];
      }
      return labels;
    }
    const base =
      statusOptionsProp && statusOptionsProp.length > 0
        ? statusOptionsProp
        : lifecycleStatusOptions;
    return [...new Set([...base, form.status].filter(Boolean))];
  }, [
    editStatusChoices,
    form.status,
    isEdit,
    lifecycleStatusOptions,
    statusOptionsProp,
  ]);

  useEffect(() => {
    if (!open) return;
    return loadJsonEffect<{ id: string; userId: string; name: string }[]>(
      "/api/users",
      (rows) =>
        setUsers(
          rows.map((u) => ({
            value: u.id,
            label: `${u.userId} — ${u.name}`,
          }))
        ),
      { label: "release-form-users" }
    );
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditLegalNext([]);
      setLegalNextLoading(false);
      setCurrentIsTerminal(null);
      return;
    }
    if (isEdit && initial?.id) {
      const current = initial.status || form.status || "";
      const previewConfig = createDefaultReleaseLifecycleConfig();
      setCurrentIsTerminal(
        resolveLifecycleStatusRef(previewConfig, current)?.terminal ?? false
      );
      // Paint graph next immediately — the per-release lifecycle GET can take >15s.
      setEditLegalNext(
        previewEditLegalNext(current, previewConfig, {
          name: initial.name,
          owner: initial.owner,
          applicationCount: initial.applicationIds?.length ?? 0,
          releaseSize: initial.releaseSize,
          priority: initial.priority,
          startDate: initial.startDate || null,
          releaseDate: initial.releaseDate || null,
        })
      );
      setLegalNextLoading(true);
      const stop = loadJsonEffect<{
        currentLabel: string;
        currentTerminal?: boolean;
        next: LegalNextStatusView[];
      }>(
        `/api/releases/${initial.id}/lifecycle?preview=1`,
        (payload) => {
          setEditLegalNext(payload.next ?? []);
          if (typeof payload.currentTerminal === "boolean") {
            setCurrentIsTerminal(payload.currentTerminal);
          }
        },
        {
          label: "release-form-legal-next",
          onFinally: () => setLegalNextLoading(false),
        }
      );
      return () => {
        stop();
        setLegalNextLoading(false);
      };
    }
    if (statusOptionsProp && statusOptionsProp.length > 0) {
      setDefaultStatusLabel(statusOptionsProp[0] ?? "Draft");
      return;
    }
    return loadJsonEffect<{ config: ReleaseLifecycleConfig }>(
      "/api/release-lifecycle-config",
      (payload) => {
        setLifecycleStatusOptions(enabledReleaseStatusLabels(payload.config));
        setDefaultStatusLabel(
          defaultReleaseStatusLabel(payload.config) || "Draft"
        );
      },
      { label: "release-form-lifecycle-statuses" }
    );
    // Create-mode labels: length/[0] avoid aborting the edit fetch on parent rerenders.
  }, [initial?.id, initial?.status, isEdit, open, statusOptionsProp?.length, statusOptionsProp?.[0]]);

  useEffect(() => {
    if (!open) return;
    return loadJsonEffect<{ config: SignoffLifecycleConfig }>(
      "/api/signoff-lifecycle-config",
      (payload) => {
        if (payload.config) setSignoffConfig(payload.config);
      },
      { label: "release-form-signoff-config" }
    );
  }, [open]);

  useEffect(() => {
    if (!open || environments.length > 0) {
      setLoadedEnvs([]);
      return;
    }
    return loadJsonEffect<{ id: string; name: string; applicationId: string }[]>(
      "/api/environments",
      (rows) =>
        setLoadedEnvs(
          rows.map((e) => ({
            value: e.name,
            label: e.name,
            applicationId: e.applicationId,
          }))
        ),
      { label: "release-form-environments" }
    );
  }, [open, environments.length]);

  // Clear success screens only when the modal fully closes — not when parent
  // refreshes list/detail data after save (that was wiping the confirmation instantly).
  useEffect(() => {
    if (open) return;
    setCreated(null);
    setEditChanges(null);
    setFieldErrors({});
    setFormAlert(null);
    setPendingConflicts([]);
    setHighlightReleaseDate(false);
    setOverrideReason("");
    setEditLegalNext([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Keep create/edit confirmation visible while parent reloads after onSaved().
    if (created || editChanges) return;
    setFieldErrors({});
    setFormAlert(null);
    const next: ReleaseFormData = {
      ...EMPTY_FORM,
      releaseCode: initial?.releaseCode ?? generateReleaseId(existingReleaseCodes),
      name: initial?.name ?? "",
      programProject: initial?.programProject ?? "",
      owner: initial?.owner ?? "",
      status: initial?.status ?? defaultStatusLabel,
      releaseDate: dateInput(initial?.releaseDate),
      priority: initial?.priority ?? "P3 - Medium",
      impact: initial?.impact ?? "Medium",
      departmentId: initial?.departmentId ?? "",
      applicationIds: initial?.applicationIds ?? [],
      dependsOnReleaseIds: initial?.dependsOnReleaseIds ?? [],
      notes: initial?.notes ?? "",
      releaseSize: initial?.releaseSize ?? "Medium",
      cabDate: dateInput(initial?.cabDate),
      startDate: dateInput(initial?.startDate),
      testEnvRequired: initial?.testEnvRequired ?? "",
      uatEnvRequired: initial?.uatEnvRequired ?? "",
      releaseOwnerId: initial?.releaseOwnerId ?? "",
      approvalStatus: initial?.approvalStatus ?? "",
      rollbackPlan: initial?.rollbackPlan ?? "",
      hypercarePlan: initial?.hypercarePlan ?? "",
      commsPlan: initial?.commsPlan ?? "",
      trainingStatus: initial?.trainingStatus ?? "",
      stakeholderIds: initial?.stakeholderIds ?? [],
      devSignoff: initial?.devSignoff ?? "",
      testSignoff: initial?.testSignoff ?? "",
      uatSignoff: initial?.uatSignoff ?? "",
      securityClearance: initial?.securityClearance ?? "",
      businessSignoff: initial?.businessSignoff ?? "",
      opsSignoff: initial?.opsSignoff ?? "",
    };
    if (initial?.id) next.id = initial.id;
    setForm(next);
    editBaseline.current = initial?.id ? { ...next } : null;
  }, [open, initial, existingReleaseCodes, created, editChanges, defaultStatusLabel]);

  const departmentName = useMemo(
    () => departments.find((d) => d.value === form.departmentId)?.label ?? "",
    [departments, form.departmentId]
  );

  const filteredApps = useMemo(() => {
    if (!form.departmentId) return [];
    return applications.filter((a) => a.departmentId === form.departmentId);
  }, [applications, form.departmentId]);

  /** Owners are global — do not filter by selected department. */
  const ownerOptions = useMemo(
    () => [...users].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [users]
  );

  const envSource = environments.length > 0 ? environments : loadedEnvs;
  const appIdsInDept = useMemo(() => new Set(filteredApps.map((a) => a.value)), [filteredApps]);
  const appIdsForEnv = useMemo(() => {
    if (form.applicationIds.length) return new Set(form.applicationIds);
    return appIdsInDept;
  }, [form.applicationIds, appIdsInDept]);

  const testEnvOptions = useMemo(() => {
    const rows = envSource.filter(
      (e) =>
        appIdsForEnv.has(e.applicationId) &&
        /test/i.test(e.label) &&
        !/uat/i.test(e.label)
    );
    const names = [...new Set(rows.map((e) => e.label))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [envSource, appIdsForEnv]);

  const uatEnvOptions = useMemo(() => {
    const rows = envSource.filter(
      (e) => appIdsForEnv.has(e.applicationId) && /uat/i.test(e.label)
    );
    const names = [...new Set(rows.map((e) => e.label))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [envSource, appIdsForEnv]);

  const releaseOptions = useMemo(
    () => releases.filter((r) => r.value !== initial?.id),
    [releases, initial?.id]
  );

  const signoffDecisionTypes = useMemo(
    () => signoffDecisionTypesForForm(signoffConfig),
    [signoffConfig]
  );

  if (!open) return null;

  const regenerateId = () => {
    const codes = isEdit
      ? existingReleaseCodes.filter((c) => c !== initial?.releaseCode)
      : existingReleaseCodes;
    setForm((f) => ({ ...f, releaseCode: generateReleaseId(codes) }));
  };

  const set = <K extends keyof ReleaseFormData>(key: K, value: ReleaseFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onDepartmentChange = (departmentId: string) => {
    setForm((f) => ({
      ...f,
      departmentId,
      // Apps and envs are department-scoped; owner is not.
      applicationIds: [],
      testEnvRequired: "",
      uatEnvRequired: "",
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.departmentId;
      delete next.applicationIds;
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof ReleaseFormData, string>> = {};
    if (!form.releaseCode.trim()) errors.releaseCode = "Release ID is required";
    if (!form.name.trim()) errors.name = "Release name is required";
    if (!form.departmentId) errors.departmentId = "Department is required";
    if (!form.releaseOwnerId) errors.releaseOwnerId = "Release owner is required";
    if (!form.applicationIds.length) errors.applicationIds = "Select at least one application";
    if (!form.releaseDate) errors.releaseDate = "End date is required";
    if (!form.status) errors.status = "Status is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormAlert({
        title: "Missing required fields",
        message: "Please fill in the required fields highlighted below.",
      });
      return false;
    }
    setFormAlert(null);
    return true;
  };

  const save = async (opts?: { raiseConflicts?: boolean; conflictNotes?: string }) => {
    if (!validate()) return;
    if (isEdit && selectedNext?.outcome === "blocked") {
      setFormAlert({
        title: "Status change blocked",
        message: `You can’t move this release to “${selectedNext.label}” until the required checks pass.`,
        details: selectedNext.gates
          .filter((g) => g.hard && !g.passed)
          .map((g) => g.reason),
      });
      return;
    }
    if (
      isEdit &&
      selectedNext?.outcome === "needs_override" &&
      overrideReason.trim().length < MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH
    ) {
      // Exception panel already has the textarea — focus it; don’t OK-only alert.
      focusExceptionReason();
      return;
    }
    setSaving(true);
    setFormAlert(null);
    const ownerLabel = users.find((u) => u.value === form.releaseOwnerId)?.label;
    const ownerName = ownerLabel?.includes(" — ")
      ? ownerLabel.split(" — ").slice(1).join(" — ")
      : form.owner;
    const full: Record<string, unknown> = {
      ...form,
      programProject: normalizeProgramProject(form.programProject) ?? "N/A",
      owner: ownerName || form.owner || "Unknown",
      cabDate: form.cabDate || null,
      startDate: form.startDate || null,
      releaseOwnerId: form.releaseOwnerId || null,
      notes: form.notes.trim() || null,
      testEnvRequired: form.testEnvRequired.trim() || null,
      uatEnvRequired: form.uatEnvRequired.trim() || null,
      releaseSize: form.releaseSize || null,
      approvalStatus: form.approvalStatus.trim() || null,
      rollbackPlan: form.rollbackPlan.trim() || null,
      hypercarePlan: form.hypercarePlan.trim() || null,
      commsPlan: form.commsPlan.trim() || null,
      trainingStatus: form.trainingStatus.trim() || null,
      stakeholderIds: form.stakeholderIds,
      devSignoff: form.devSignoff.trim() || null,
      testSignoff: form.testSignoff.trim() || null,
      uatSignoff: form.uatSignoff.trim() || null,
      securityClearance: form.securityClearance.trim() || null,
      businessSignoff: form.businessSignoff.trim() || null,
      opsSignoff: form.opsSignoff.trim() || null,
    };
    // Edit Release must not echo unchanged fields — Limited/Locked statuses
    // (Blocked, CAB Approved) reject owner/programProject rewrites and mask
    // the real status transition.
    let payload: Record<string, unknown>;
    if (isEdit && editBaseline.current) {
      payload = sparseReleaseEditPayload(editBaseline.current, full);
    } else {
      payload = full;
    }
    if (
      isEdit &&
      selectedNext?.outcome === "needs_override" &&
      overrideReason.trim().length >= MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH
    ) {
      payload.overrideReason = overrideReason.trim();
    }
    if (opts?.raiseConflicts) {
      payload.raiseConflicts = true;
      if (opts.conflictNotes) payload.conflictNotes = opts.conflictNotes;
    }

    // Dev compile + Neon cold starts can take a long time; never leave Save stuck forever.
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), 60_000);
    try {
      const result = await safeFetchJson<{
        id: string;
        releaseCode?: string;
        name?: string;
        pendingConflicts?: ConflictFinding[];
      }>(
        isEdit ? `/api/releases/${initial!.id}` : "/api/releases",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          label: "release-form-save",
          rejectHttpErrors: false,
          signal: ac.signal,
        }
      );
      if (!result.ok || (result.status ?? 0) >= 300) {
        const data = result.ok ? result.data : null;
        const heldConflicts =
          (result.status ?? 0) === 409 &&
          data &&
          typeof data === "object" &&
          Array.isArray((data as { pendingConflicts?: unknown }).pendingConflicts)
            ? ((data as { pendingConflicts: ConflictFinding[] }).pendingConflicts)
            : [];
        if (heldConflicts.length > 0) {
          pendingReleaseCode.current = form.releaseCode || "";
          setPendingConflicts(heldConflicts);
          return;
        }
        if (!result.ok && result.code === "aborted") {
          setFormAlert({
            title: "Save timed out",
            message:
              "The server may still be compiling or the database is slow — wait a moment and try again.",
          });
          return;
        }
        const body =
          data && typeof data === "object"
            ? (data as {
                code?: string;
                field?: string;
                error?: string;
                unmetReasons?: unknown;
                transition?: { unmetReasons?: unknown };
              })
            : null;
        if (body?.field && body.field in EMPTY_FORM && typeof body.error === "string") {
          const field = body.field as keyof ReleaseFormData;
          setFieldErrors((prev) => ({ ...prev, [field]: body.error }));
        }
        // Preview/legal-next can lag real gate facts (e.g. open blockers). Show
        // the exception textarea instead of an OK-only “enter a reason” dialog.
        if (body?.code === "TRANSITION_NEEDS_OVERRIDE") {
          const unmet = [
            ...(Array.isArray(body.unmetReasons) ? body.unmetReasons : []),
            ...(Array.isArray(body.transition?.unmetReasons)
              ? body.transition.unmetReasons
              : []),
          ].filter((r): r is string => typeof r === "string" && r.trim().length > 0);
          markSelectedStatusNeedsOverride(unmet);
          // Panel may mount this paint — autoFocusReason + delayed focus.
          window.setTimeout(() => focusExceptionReason(), 50);
          return;
        }
        setPendingConflicts([]);
        setFormAlert(
          buildReleaseFormSaveAlert(
            data,
            !result.ok ? result.error : "Failed to save release"
          )
        );
        return;
      }

      const saved = result.data;
      setPendingConflicts([]);
      if (opts?.raiseConflicts) setRaisedForRm(true);

      // VR-21 (and similar): announce status side effects after a successful save.
      if (result.ok && result.headers) {
        const notices = parseUxNoticesFromHeaders(result.headers);
        if (notices[0]) {
          setFormAlert({
            title: notices[0].title,
            message: notices[0].message,
            details: notices[0].details,
            variant: "notice",
          });
        }
      }

      onSaved();
      if (isEdit) {
        const before = editBaseline.current;
        const afterForDiff: ReleaseFormData = {
          ...form,
          applicationIds: form.applicationIds,
          dependsOnReleaseIds: form.dependsOnReleaseIds,
        };
        // Compare display-friendly snapshots for multi-selects.
        const beforeSnap = {
          ...(before ?? form),
          applicationIds: (before?.applicationIds ?? []).join(", "),
          dependsOnReleaseIds: (before?.dependsOnReleaseIds ?? []).join(", "),
        } as unknown as Record<string, unknown>;
        const afterSnap = {
          ...afterForDiff,
          applicationIds: form.applicationIds.join(", "),
          dependsOnReleaseIds: form.dependsOnReleaseIds.join(", "),
        } as unknown as Record<string, unknown>;
        setEditChanges(
          diffDraftChanges(beforeSnap, afterSnap, RELEASE_EDIT_LABELS as Partial<Record<string, string>>)
        );
        return;
      }

      const appLabels = form.applicationIds
        .map((id) => filteredApps.find((a) => a.value === id)?.label ?? id)
        .join(", ");
      setCreated({
        id: result.data.id,
        releaseCode: result.data.releaseCode ?? form.releaseCode,
        name: result.data.name ?? form.name,
        department: departmentName || "—",
        owner: ownerName || "—",
        applications: appLabels || "—",
        status: form.status,
        releaseDate: form.releaseDate,
        uatEnvRequired: form.uatEnvRequired || "—",
        testEnvRequired: form.testEnvRequired || "—",
      });
    } finally {
      window.clearTimeout(timeoutId);
      setSaving(false);
    }
  };

  if (editChanges) {
    return (
      <EditSuccessDialog
        open
        entityLabel="Release"
        entityCode={form.releaseCode}
        changes={editChanges}
        onDone={onClose}
      />
    );
  }

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Release created</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
                {raisedForRm
                  ? "The date was saved and a conflict was raised. The Release Manager has a notice in their inbox (bell icon)."
                  : "Your release was saved successfully."}
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
            <SummaryRow label="Release ID" value={created.releaseCode} mono />
            <SummaryRow label="Name" value={created.name} />
            <SummaryRow label="Department" value={created.department} />
            <SummaryRow label="Owner" value={created.owner} />
            <SummaryRow label="Application/s" value={created.applications} />
            <SummaryRow label="Status" value={created.status} />
            <SummaryRow label="End date" value={created.releaseDate} />
            <SummaryRow label="Test env" value={created.testEnvRequired} />
            <SummaryRow label="UAT env" value={created.uatEnvRequired} />
          </dl>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={taBtnSecondary}
              onClick={() => {
                // Clearing created re-runs form init with the refreshed release-code list.
                setCreated(null);
              }}
            >
              Create another
            </button>
            <ProgressLink href={`/releases/${created.id}`} className={cn(taBtnSecondary, "inline-flex items-center")}>
              View release
            </ProgressLink>
            <button type="button" className={taBtnPrimary} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {pendingConflicts.length > 0 ? (
        <ConflictChoiceDialog
          findings={pendingConflicts}
          busy={raisingConflicts}
          highlightHint="Change my dates discards the proposed date — nothing was saved — and highlights the end date so you can pick a free window."
          onModify={() => {
            setPendingConflicts([]);
            setHighlightReleaseDate(true);
          }}
          onRaise={async (notes) => {
            setRaisingConflicts(true);
            await save({ raiseConflicts: true, conflictNotes: notes || undefined });
            setRaisingConflicts(false);
          }}
        />
      ) : null}
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-theme-lg p-6 max-h-[90vh] overflow-y-auto dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">
          {isEdit ? "Edit release" : "New release"}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Fields marked <span className="text-rose-500">*</span> are required. Choosing a department
          filters applications and environments for that department.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">
              Release ID
              <RequiredMark />
            </label>
            <div className="mt-1 flex gap-2">
              <input
                className={cn(
                  taInput,
                  "font-mono text-sm bg-gray-50",
                  fieldErrors.releaseCode && "border-rose-400"
                )}
                value={form.releaseCode}
                onChange={(e) => set("releaseCode", e.target.value.toUpperCase())}
                readOnly
                placeholder="Auto-generated unique ID"
              />
              {!isEdit && (
                <button
                  type="button"
                  onClick={regenerateId}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 text-gray-500 hover:bg-brand-50 hover:text-brand-600"
                  title="Generate new ID"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
            <FieldError message={fieldErrors.releaseCode} />
          </div>

          <Field
            label="Release Name"
            required
            value={form.name}
            onChange={(v) => set("name", v)}
            error={fieldErrors.name}
          />
          <Field
            label="Program / Project"
            value={form.programProject}
            onChange={(v) => set("programProject", v)}
            placeholder="N/A for hotfixes, infra, security…"
          />

          <div>
            <label className="text-xs font-medium text-gray-500">
              Department
              <RequiredMark />
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={form.departmentId}
                onChange={onDepartmentChange}
                options={departments}
                placeholder="Select department…"
                searchPlaceholder="Search departments…"
                className={fieldErrors.departmentId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={fieldErrors.departmentId} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">
              Release Owner
              <RequiredMark />
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={form.releaseOwnerId}
                onChange={(v) => set("releaseOwnerId", v)}
                options={ownerOptions}
                placeholder="Select owner…"
                searchPlaceholder="Search users…"
                className={fieldErrors.releaseOwnerId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={fieldErrors.releaseOwnerId} />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">
              Application/s
              <RequiredMark />
            </label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.applicationIds}
                onChange={(v) => set("applicationIds", v)}
                options={filteredApps}
                placeholder={
                  form.departmentId ? "Select applications…" : "Select department first…"
                }
                searchPlaceholder="Search applications…"
                disabled={!form.departmentId}
                className={fieldErrors.applicationIds ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={fieldErrors.applicationIds} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">
              Status
              <RequiredMark />
            </label>
            {isEdit ? (
              <LifecycleStatusSelect
                aria-label="Status"
                className={cn(fieldErrors.status && "[&_button]:border-rose-400")}
                value={form.status}
                onChange={(next) => {
                  set("status", next);
                  setOverrideReason("");
                }}
                options={editStatusChoices.map((opt) => ({
                  value: opt.label,
                  label:
                    opt.outcome === "current"
                      ? opt.label
                      : opt.outcome === "needs_override"
                        ? `${opt.label} · reason needed`
                        : opt.outcome === "blocked"
                          ? `${opt.label} · blocked`
                          : opt.label,
                  disabled: opt.disabled,
                  hint: opt.hint,
                }))}
              />
            ) : (
              <select
                className={cn(taInput, fieldErrors.status && "border-rose-400")}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            {isEdit ? (
              showTerminalStatusNotice ? (
                <LifecycleTerminalStatusNotice
                  statusLabel={initial?.status || form.status}
                />
              ) : (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
                  {legalNextLoading
                    ? "Showing the next steps from the lifecycle graph. Confirming checks…"
                    : selectedNext?.outcome === "needs_override"
                      ? "Some checks aren’t met. Enter an exception reason in the panel below, then continue."
                      : "Only the next allowed steps are listed. Hover a blocked step to see why it can’t be chosen."}
                </p>
              )
            ) : null}
            <FieldError message={fieldErrors.status} />
          </div>

          {selectedNext && selectedNext.outcome !== "allowed" ? (
            <div className="sm:col-span-2">
              <LifecycleExceptionConfirm
                targetLabel={selectedNext.label}
                isReturn={selectedNext.isPreviousStatus}
                needsException={selectedNext.outcome === "needs_override"}
                blocked={selectedNext.outcome === "blocked"}
                exceptionReason={overrideReason}
                onExceptionReasonChange={setOverrideReason}
                autoFocusReason={selectedNext.outcome === "needs_override"}
                reasonInputRef={exceptionReasonRef}
                busy={saving}
                confirmDisabled={
                  saving ||
                  selectedNext.outcome === "blocked" ||
                  (selectedNext.outcome === "needs_override" &&
                    overrideReason.trim().length < MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH)
                }
                onCancel={() => {
                  set("status", initial?.status ?? form.status);
                  setOverrideReason("");
                }}
                onConfirm={() => void save()}
                checks={selectedNext.gates.map((gate) => ({
                  label: gate.label,
                  passed: gate.passed,
                  reason: gate.reason,
                  hard: gate.hard,
                  soft: gate.soft,
                }))}
              />
            </div>
          ) : null}

          <div>
            <label className="text-xs font-medium text-gray-500">Release Size</label>
            <select
              className={taInput}
              value={form.releaseSize}
              onChange={(e) => set("releaseSize", e.target.value)}
            >
              {RELEASE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Priority</label>
            <select
              className={taInput}
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              {[...new Set([...PRIORITIES, form.priority].filter(Boolean))].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Impact</label>
            <select
              className={taInput}
              value={form.impact}
              onChange={(e) => set("impact", e.target.value)}
            >
              {IMPACTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">CAB Date</label>
            <input
              type="date"
              className={taInput}
              value={form.cabDate}
              onChange={(e) => set("cabDate", e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Start Date</label>
            <input
              type="date"
              className={taInput}
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">
              End Date
              <RequiredMark />
            </label>
            <input
              type="date"
              className={cn(
                taInput,
                fieldErrors.releaseDate && "border-rose-400",
                highlightReleaseDate && "border-amber-400 ring-2 ring-amber-300"
              )}
              value={form.releaseDate}
              onChange={(e) => set("releaseDate", e.target.value)}
            />
            <FieldError message={fieldErrors.releaseDate} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Test Env Required</label>
            <select
              className={taInput}
              value={form.testEnvRequired}
              onChange={(e) => set("testEnvRequired", e.target.value)}
              disabled={!form.departmentId}
            >
              <option value="">
                {form.departmentId ? "Select test env…" : "Select department first…"}
              </option>
              {form.testEnvRequired &&
                !testEnvOptions.some((o) => o.value === form.testEnvRequired) && (
                  <option value={form.testEnvRequired}>{form.testEnvRequired}</option>
                )}
              {testEnvOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">UAT Env Required</label>
            <select
              className={taInput}
              value={form.uatEnvRequired}
              onChange={(e) => set("uatEnvRequired", e.target.value)}
              disabled={!form.departmentId}
            >
              <option value="">
                {form.departmentId ? "Select UAT env…" : "Select department first…"}
              </option>
              {form.uatEnvRequired &&
                !uatEnvOptions.some((o) => o.value === form.uatEnvRequired) && (
                  <option value={form.uatEnvRequired}>{form.uatEnvRequired}</option>
                )}
              {uatEnvOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Depends On</label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.dependsOnReleaseIds}
                onChange={(v) => set("dependsOnReleaseIds", v)}
                options={releaseOptions}
                placeholder="Select dependent releases…"
                searchPlaceholder="Search releases…"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Approval Status</label>
            <select
              className={taInput}
              value={form.approvalStatus}
              onChange={(e) => set("approvalStatus", e.target.value)}
            >
              <option value="">Not set</option>
              {selectOptionsWithCurrent(RELEASE_APPROVAL_STATUS_OPTIONS, form.approvalStatus).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Rollback Plan</label>
            <select
              className={taInput}
              value={form.rollbackPlan}
              onChange={(e) => set("rollbackPlan", e.target.value)}
            >
              <option value="">Not set</option>
              {selectOptionsWithCurrent(RELEASE_ROLLBACK_PLAN_OPTIONS, form.rollbackPlan).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Hypercare Plan</label>
            <select
              className={taInput}
              value={form.hypercarePlan}
              onChange={(e) => set("hypercarePlan", e.target.value)}
            >
              <option value="">Not set</option>
              {selectOptionsWithCurrent(RELEASE_PLAN_PROGRESS_OPTIONS, form.hypercarePlan).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Comms Plan</label>
            <select
              className={taInput}
              value={form.commsPlan}
              onChange={(e) => set("commsPlan", e.target.value)}
            >
              <option value="">Not set</option>
              {selectOptionsWithCurrent(RELEASE_PLAN_PROGRESS_OPTIONS, form.commsPlan).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Training Status</label>
            <select
              className={taInput}
              value={form.trainingStatus}
              onChange={(e) => set("trainingStatus", e.target.value)}
            >
              <option value="">Not set</option>
              {selectOptionsWithCurrent(RELEASE_PLAN_PROGRESS_OPTIONS, form.trainingStatus).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
          </div>

          {isEdit ? (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-gray-500">Sign-offs</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                Record Approved, Rejected, or Approved with Conditions. Once recorded, a
                decision can’t be flipped — a new request is required.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {signoffDecisionTypes.map((type) => (
                  <SignoffDecisionSelect
                    key={type.field}
                    type={type}
                    value={form[type.field]}
                    error={fieldErrors[type.field]}
                    config={signoffConfig}
                    disabled={!type.enabled}
                    onChange={(next) => set(type.field, next)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Stakeholders</label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.stakeholderIds}
                onChange={(v) => set("stakeholderIds", v)}
                options={ownerOptions}
                placeholder="Select people to keep informed…"
                searchPlaceholder="Search people…"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500">Notes</label>
          <textarea
            className={`${taInput} min-h-[72px] mt-1`}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={taBtnPrimary}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <FormAlertDialog alert={formAlert} onDismiss={() => setFormAlert(null)} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{message}</p>;
}

function SignoffDecisionSelect({
  type,
  value,
  error,
  config,
  disabled,
  onChange,
}: {
  type: ReturnType<typeof signoffDecisionTypesForForm>[number];
  value: string;
  error?: string;
  config: SignoffLifecycleConfig;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const current = value.trim();
  const next = legalNextSignoffStatuses(config, current || null);
  const options = selectOptionsWithCurrent(
    next.map((item) => item.label),
    current
  );
  const locked = next.length === 0 && Boolean(current);
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">
        {type.label}
        {type.mandatory ? <RequiredMark /> : null}
      </label>
      <select
        className={cn(taInput, error && "border-rose-400")}
        value={current}
        disabled={disabled || locked}
        onChange={(e) => onChange(e.target.value)}
        aria-label={type.label}
      >
        {!current ? <option value="">Pending</option> : null}
        {options.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      {locked ? (
        <p className="mt-1 text-[11px] text-gray-400">
          This decision is recorded and can’t be changed from here.
        </p>
      ) : null}
      {!type.enabled ? (
        <p className="mt-1 text-[11px] text-gray-400">Turned off in Sign-off Settings.</p>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd className={cn("text-right font-medium text-gray-900 dark:text-white", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      <input
        className={cn(taInput, error && "border-rose-400")}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldError message={error} />
    </div>
  );
}
