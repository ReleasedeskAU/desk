"use client";

import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";
import type { PageDocKey } from "@/lib/page-documentation";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { ArrowLeft } from "lucide-react";

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-white/45">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-white break-words">{value ?? "—"}</dd>
    </div>
  );
}

export function DetailFieldGrid({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <dl
      className={
        cols === 3
          ? "grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm"
          : "grid sm:grid-cols-2 gap-3 text-sm"
      }
    >
      {children}
    </dl>
  );
}

type DetailPageShellProps = {
  /** Shown in the navigation history trail */
  entityCode: string;
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel: string;
  pageKey?: PageDocKey;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

/** Shared chrome for entity detail pages (header, badges, actions, back link). */
export function DetailPageShell({
  entityCode,
  title,
  subtitle,
  backHref,
  backLabel,
  pageKey,
  badges,
  actions,
  children,
}: DetailPageShellProps) {
  useNavHistoryLabel(entityCode);

  return (
    <div className="space-y-6">
      <TopBar
        title={title}
        subtitle={subtitle}
        highlight
        pageKey={pageKey}
        trailing={pageKey ? <PageDocumentation pageKey={pageKey} /> : undefined}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProgressLink
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </ProgressLink>
        {badges}
        {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {children}
    </div>
  );
}
