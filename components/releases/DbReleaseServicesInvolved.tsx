"use client";

/**
 * Live "Services Involved" panel — traces Service → Application → Release
 * on each load. Empty list is an intentional state (no linked Copilot services),
 * not an error.
 */
import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { DetailSection, EmptyHint } from "@/components/detail/editable";
import { loadJsonEffect } from "@/lib/safe-fetch";
import { cn } from "@/lib/utils";

type InvolvedService = {
  id: string;
  name: string;
  criticality: string;
  applicationId: string;
  applicationName: string;
};

type Props = {
  /** Release id or releaseCode — API accepts either. */
  releaseId: string;
};

/**
 * Renders Copilot services linked to this release via applicationId.
 * @param releaseId - Release primary key or code for the live GET.
 */
export function DbReleaseServicesInvolved({ releaseId }: Props) {
  const [services, setServices] = useState<InvolvedService[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    return loadJsonEffect<{ services: InvolvedService[] }>(
      `/api/releases/${encodeURIComponent(releaseId)}/services`,
      (data) => {
        setServices(Array.isArray(data.services) ? data.services : []);
      },
      {
        label: "services-involved",
        onError: () => {
          setFailed(true);
          setServices([]);
        },
      }
    );
  }, [releaseId]);

  const count = services?.length ?? 0;

  return (
    <DetailSection
      icon={Boxes}
      tone="sky"
      title="Services Involved"
      description={
        services === null
          ? "Loading…"
          : count === 0
            ? "None linked"
            : `${count} service${count === 1 ? "" : "s"}`
      }
      detail="Copilot services linked to this release through Application membership (Service → Application → Release). Computed live — not stored on the release row."
      collapsible
      defaultOpen
    >
      {failed ? (
        <EmptyHint>Could not load services. Try refreshing the page.</EmptyHint>
      ) : services === null ? (
        <p className="text-sm text-slate-500 dark:text-white/50">Loading services…</p>
      ) : services.length === 0 ? (
        <EmptyHint>
          No Copilot services are linked to this release yet. Link a Service to one of
          this release&apos;s applications (optional applicationId) to see it here.
        </EmptyHint>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-white/90">
                  {s.name}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-400 dark:text-white/40">
                  {s.id}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-white/55">
                <span className="truncate">{s.applicationName || "—"}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                  )}
                >
                  {s.criticality}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
