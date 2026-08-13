/**
 * Release-status helpers driven by lifecycle config (SSOT for labels/filters/tones).
 * Pure — safe for client and server; no I/O.
 */
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import type {
  ReleaseLifecycleConfig,
  ReleaseLifecycleStatusConfig,
  ReleaseLifecycleStatusKind,
} from "@/lib/release-lifecycle-config";
import {
  emptyLifecycleGateFacts,
  listLegalNextStatuses,
  type LegalNextStatusView,
  type ReleaseLifecycleGateFacts,
} from "@/lib/release-lifecycle-transition";
import { lifecycleStatusOptionHint } from "@/lib/lifecycle-status-option-hint";

/** Chip / badge tone used across detail chips and table badges. */
export type ReleaseStatusDisplayTone = "good" | "warn" | "bad" | "info" | "neutral";

export type ReleaseStatusDisplay = {
  label: string;
  kind: ReleaseLifecycleStatusKind | null;
  enabled: boolean;
  known: boolean;
  tone: ReleaseStatusDisplayTone;
};

/**
 * Map lifecycle status kind to a UI tone.
 * @param kind - Config kind, or null when unknown.
 */
export function toneForLifecycleKind(
  kind: ReleaseLifecycleStatusKind | null | undefined
): ReleaseStatusDisplayTone {
  switch (kind) {
    case "interrupt":
      return "bad";
    case "branch":
      return "warn";
    case "terminal":
      return "good";
    case "mainline":
      return "info";
    default:
      return "neutral";
  }
}

/**
 * Find a status in config by label or key (case-insensitive).
 * @param config - Lifecycle graph.
 * @param status - Stored release status string.
 */
export function findLifecycleStatusByLabel(
  config: ReleaseLifecycleConfig,
  status: string | null | undefined
): ReleaseLifecycleStatusConfig | null {
  const raw = (status ?? "").trim();
  if (!raw) return null;
  const needle = raw.toLocaleLowerCase();
  return (
    config.statuses.find(
      (s) =>
        s.label.toLocaleLowerCase() === needle ||
        s.key.toLocaleLowerCase() === needle
    ) ?? null
  );
}

/**
 * Enabled status labels in config sort order.
 * @param config - Lifecycle graph.
 */
export function enabledReleaseStatusLabels(
  config: ReleaseLifecycleConfig
): string[] {
  return [...config.statuses]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label);
}

/**
 * Default status label for new releases (first enabled mainline, else first enabled).
 * @param config - Lifecycle graph.
 * @returns Label or empty string if none enabled.
 */
export function defaultReleaseStatusLabel(
  config: ReleaseLifecycleConfig
): string {
  const enabled = [...config.statuses]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const mainline = enabled.find((s) => s.kind === "mainline");
  return (mainline ?? enabled[0])?.label ?? "";
}

/**
 * Whether a status label is allowed for create (enabled in config).
 * @param config - Lifecycle graph.
 * @param status - Proposed label.
 */
export function isEnabledReleaseStatusLabel(
  config: ReleaseLifecycleConfig,
  status: string | null | undefined
): boolean {
  const found = findLifecycleStatusByLabel(config, status);
  return Boolean(found?.enabled);
}

/**
 * Filter dropdown options: enabled labels, then Off/unknown labels still present on data.
 * @param config - Lifecycle graph.
 * @param presentOnData - Status strings observed on releases.
 */
export function releaseStatusFilterOptions(
  config: ReleaseLifecycleConfig,
  presentOnData: Iterable<string> = []
): string[] {
  const enabled = enabledReleaseStatusLabels(config);
  const enabledSet = new Set(enabled.map((l) => l.toLocaleLowerCase()));
  const extras: string[] = [];
  const seenExtra = new Set<string>();
  for (const raw of presentOnData) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (enabledSet.has(key) || seenExtra.has(key)) continue;
    const known = findLifecycleStatusByLabel(config, label);
    extras.push(known?.label ?? label);
    seenExtra.add(key);
  }
  extras.sort((a, b) => a.localeCompare(b));
  return [...enabled, ...extras];
}

/**
 * Resolve display metadata for a stored release status.
 * @param config - Lifecycle graph.
 * @param status - Stored status string.
 */
export function resolveReleaseStatusDisplay(
  config: ReleaseLifecycleConfig,
  status: string | null | undefined
): ReleaseStatusDisplay {
  const raw = (status ?? "").trim();
  const found = findLifecycleStatusByLabel(config, raw);
  if (!found) {
    return {
      label: raw || "—",
      kind: null,
      enabled: false,
      known: false,
      tone: "neutral",
    };
  }
  return {
    label: found.label,
    kind: found.kind,
    enabled: found.enabled,
    known: true,
    tone: toneForLifecycleKind(found.kind),
  };
}

/**
 * Labels used for needs-attention / inbox style queries (enabled interrupt statuses).
 * @param config - Lifecycle graph.
 */
export function attentionStatusLabels(config: ReleaseLifecycleConfig): string[] {
  return [...config.statuses]
    .filter((s) => s.enabled && s.kind === "interrupt")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label);
}

/**
 * Map a status into coarse dashboard buckets using lifecycle kind when known.
 * Legacy demo labels still map for older seed/demo rows.
 * @param status - Stored status.
 * @param config - Optional lifecycle graph for kind-based bucketing.
 */
export function bucketReleaseStatusWithConfig(
  status: string,
  config?: ReleaseLifecycleConfig | null
): "planned" | "inProgress" | "blocked" | "atRisk" | "shipped" {
  const found = config ? findLifecycleStatusByLabel(config, status) : null;
  if (found) {
    if (found.kind === "interrupt") {
      return found.key === "rolled_back" || found.label.toLocaleLowerCase().includes("roll")
        ? "atRisk"
        : "blocked";
    }
    if (found.kind === "terminal") {
      return found.key === "cancelled" || found.label.toLocaleLowerCase().includes("cancel")
        ? "planned"
        : "shipped";
    }
    if (found.kind === "branch") return "atRisk";
    // mainline: early vs mid pipeline
    const early = new Set(["draft", "planning"]);
    if (early.has(found.key) || found.sortOrder <= 20) return "planned";
    if (found.key === "deployed" || found.sortOrder >= 90) return "shipped";
    return "inProgress";
  }

  switch (status) {
    case "Blocked":
      return "blocked";
    case "At Risk":
    case "Rolled Back":
    case "Deferred":
    case "Rejected":
      return "atRisk";
    case "Draft":
    case "Planning":
    case "Planned":
    case "Scheduled":
    case "Cancelled":
      return "planned";
    case "Shipped":
    case "Complete":
    case "Completed":
    case "Deployed":
    case "Closed":
      return "shipped";
    default:
      return "inProgress";
  }
}

/**
 * Tailwind token pair for table badges from display tone.
 * @param tone - Resolved tone.
 */
export function releaseStatusBadgeTokens(tone: ReleaseStatusDisplayTone): {
  bg: string;
  text: string;
} {
  switch (tone) {
    case "good":
      return { bg: "bg-success-50", text: "text-success-600" };
    case "warn":
      return { bg: "bg-warning-50", text: "text-warning-700" };
    case "bad":
      return { bg: "bg-error-50", text: "text-error-600" };
    case "info":
      return { bg: "bg-info-50", text: "text-info-600" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600" };
  }
}

/**
 * Pipeline tile tone for dashboard from lifecycle kind.
 * @param kind - Status kind.
 */
export function pipelineToneForKind(
  kind: ReleaseLifecycleStatusKind
): "indigo" | "rose" | "violet" | "sky" | "emerald" | "amber" | "slate" {
  switch (kind) {
    case "interrupt":
      return "rose";
    case "branch":
      return "amber";
    case "terminal":
      return "emerald";
    case "mainline":
      return "sky";
    default:
      return "slate";
  }
}

export type EditReleaseStatusOption = {
  label: string;
  outcome: "current" | "allowed" | "needs_override" | "blocked";
  disabled: boolean;
  /** Hover copy explaining blocked / exception-needed steps. */
  hint?: string;
};

/**
 * Status choices for Edit Release: current status plus legal next only.
 *
 * @param currentLabel - Status the release is in now.
 * @param next - Legal-next rows from the lifecycle API (same as the detail picker).
 * @returns Deduped options; blocked next steps are listed but not selectable.
 */
export function editReleaseStatusOptions(
  currentLabel: string,
  next: readonly {
    label: string;
    outcome: "allowed" | "needs_override" | "blocked";
    gates?: readonly {
      label: string;
      reason: string;
      passed: boolean;
      hard: boolean;
      soft: boolean;
    }[];
  }[]
): EditReleaseStatusOption[] {
  const seen = new Set<string>();
  const out: EditReleaseStatusOption[] = [];
  const current = currentLabel.trim();
  if (current) {
    out.push({ label: current, outcome: "current", disabled: false });
    seen.add(current.toLocaleLowerCase());
  }
  for (const item of next) {
    const key = item.label.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: item.label,
      outcome: item.outcome,
      disabled: item.outcome === "blocked",
      hint: lifecycleStatusOptionHint({
        outcome: item.outcome,
        gates: item.gates,
      }),
    });
  }
  return out;
}

/**
 * Graph next-steps without waiting on per-release gate facts (those load several
 * other entity configs and can take tens of seconds). Used to paint Edit Release
 * immediately; the lifecycle API overwrites with live blocked/allowed outcomes.
 *
 * @param fromStatus - Current release status label or key.
 * @param config - Lifecycle graph; defaults to the Enterprise Default.
 * @param facts - Optional field facts already on the form (name, apps, dates).
 */
export function previewEditLegalNext(
  fromStatus: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig(),
  facts?: Partial<ReleaseLifecycleGateFacts>
): LegalNextStatusView[] {
  return listLegalNextStatuses({
    config,
    fromStatus,
    gateFacts: emptyLifecycleGateFacts(facts),
  });
}
