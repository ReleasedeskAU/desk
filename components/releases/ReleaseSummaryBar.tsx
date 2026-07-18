"use client";

import { CrmStatCard } from "@/components/materio/crm/CrmStatCard";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { AlertTriangle, Gauge, ShieldAlert } from "lucide-react";

function readinessColor(value: number): "success" | "warning" | "error" {
  if (value >= 80) return "success";
  if (value >= 50) return "warning";
  return "error";
}

function slipColor(value: number | null | undefined): "success" | "warning" | "error" | "neutral" {
  if (value == null) return "neutral";
  if (value >= 60) return "error";
  if (value >= 40) return "warning";
  return "success";
}

export type ReleaseSummaryBarProps = {
  /** Live operational readiness (headline KPI). */
  headlineReadiness: number;
  slipRisk?: number | null;
  envConflict?: boolean;
};

/**
 * Executive-style KPI tiles (Readiness / Slip / Env conflict).
 * Matches /executive CrmStatCard pattern; tiles link into deep-dive sections.
 * "?" help sits beside the title so it never overlaps the metric icon.
 *
 * @param props - The three headline KPIs shown at the top of the release page.
 * @returns Row of KPI tiles, each with a "?" explainer and a link to more detail.
 */
export function ReleaseSummaryBar({
  headlineReadiness,
  slipRisk,
  envConflict = false,
}: ReleaseSummaryBarProps) {
  const slipValue = slipRisk == null ? "—" : `${Math.round(slipRisk)}%`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <a href="#section-readiness" className="block h-full transition-opacity duration-150 hover:opacity-95">
        <CrmStatCard
          title="Readiness"
          value={`${headlineReadiness}%`}
          icon={Gauge}
          color={readinessColor(headlineReadiness)}
          trendText="How much prep work is done — tap to see what's left"
          trendDirection="neutral"
          help={
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <InfoTooltip
                label="About Readiness"
                text="Live readiness score based on completed checklist items, sign-offs, and open blockers recorded in Release Desk. 100% means every prep step is done. This can differ from the 'Team's estimate' number in the Readiness & Lifecycle tile below, which is entered manually."
              />
            </span>
          }
        />
      </a>

      <a href="#section-readiness" className="block h-full transition-opacity duration-150 hover:opacity-95">
        <CrmStatCard
          title="Slip risk"
          value={slipValue}
          icon={AlertTriangle}
          color={slipColor(slipRisk)}
          trendText="Chance this release finishes late"
          trendDirection={slipRisk != null && slipRisk >= 40 ? "up" : "neutral"}
          help={
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <InfoTooltip
                label="About slip risk"
                text="Estimates how likely this release is to miss its planned go-live date. It rises when there are open blockers, the release is Blocked or At Risk, or the go-live date is near but readiness is still low. Releases above 40% should be reviewed."
              />
            </span>
          }
        />
      </a>

      <a href="#blockers" className="block h-full transition-opacity duration-150 hover:opacity-95">
        <CrmStatCard
          title="Env conflict"
          value={envConflict ? "Yes" : "No"}
          icon={ShieldAlert}
          color={envConflict ? "error" : "success"}
          trendText={
            envConflict
              ? "Same test/UAT environment is booked by another release"
              : "No scheduling clash with other releases"
          }
          trendDirection="neutral"
          help={
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <InfoTooltip
                label="About environment conflict"
                text="Shows whether the Test or UAT environment this release needs is already booked by another release for an overlapping window. 'Yes' usually means one release needs to be rescheduled, or the teams need to coordinate a shared testing slot."
              />
            </span>
          }
        />
      </a>
    </div>
  );
}
