"use client";

import { useMemo, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import { SignoffRecordModal } from "@/components/signoffs/SignoffRecordModal";
import type { SignoffLifecycleConfig, SignoffReleaseField } from "@/lib/signoff-lifecycle-config";
import { DEFAULT_SIGNOFF_TYPES } from "@/lib/signoff-lifecycle-config";
import { encodeSignoffRowId, signoffCodeFor } from "@/lib/signoff-list";

type Props = {
  releaseId: string;
  releaseCode: string;
  values: Partial<Record<SignoffReleaseField, string | null | undefined>>;
  signoffConfig: SignoffLifecycleConfig | null;
  canEdit?: boolean;
  onChanged: () => void;
};

/**
 * Sign-off checklist for this release (same fields as Edit Release / PATCH).
 * Types come from Sign-off Lifecycle; decisions stay on the Release row.
 */
export function DbReleaseSignoffList({
  releaseId,
  releaseCode,
  values,
  signoffConfig,
  canEdit = false,
  onChanged,
}: Props) {
  const types = useMemo(() => {
    const list = signoffConfig?.types?.length ? signoffConfig.types : [...DEFAULT_SIGNOFF_TYPES];
    return list.filter((type) => type.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [signoffConfig]);

  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Sign-off checklist"
        addLabel="Record sign-off"
        canEdit={canEdit}
        onAdd={() => setModalOpen(true)}
        loading={false}
        loadingLabel=""
        emptyLabel="No sign-off types are enabled."
        hasItems={types.length > 0}
      >
        <ul className="space-y-2">
          {types.map((type) => {
            const value = type.releaseField ? values[type.releaseField] : null;
            const display = value?.trim() || "Pending";
            const href = type.releaseField
              ? `/signoffs/${encodeURIComponent(encodeSignoffRowId(releaseId, type.releaseField))}`
              : null;
            return (
              <li key={type.key} className="space-y-1.5 rounded-lg bg-gray-50/80 px-3 py-2.5 dark:bg-white/5">
                <div className="flex flex-wrap items-center gap-2">
                  {href ? (
                    <ProgressLink
                      href={href}
                      className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {signoffCodeFor(releaseCode, type.key)}
                    </ProgressLink>
                  ) : (
                    <span className="text-sm font-semibold text-gray-800 dark:text-white">{type.label}</span>
                  )}
                  <span className="text-sm text-gray-700 dark:text-white/80">{type.label}</span>
                  <StatusBadge status={display} />
                  {type.mandatory ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Required
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Optional
                    </span>
                  )}
                </div>
                {!type.releaseField ? (
                  <p className="text-xs text-gray-500 dark:text-white/50">No release field yet.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </ReleaseRelatedListFrame>

      <SignoffRecordModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onChanged}
        config={signoffConfig}
        lockedRelease={{ id: releaseId, values }}
      />
    </>
  );
}
