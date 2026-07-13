"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { useReleaseFilters } from "@/context/ReleaseFiltersContext";
import { PERIOD_OPTIONS } from "@/lib/period-labels";
import type { Period } from "@/lib/period-range";
import { TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  FilterRangeInputs,
  FilterSelect,
  FilterTextInput,
  FilterTriState,
} from "@/components/filters/TableFilterControls";

export type ReleaseFilterOptionLists = {
  statuses?: string[];
  priorities?: string[];
  impacts?: string[];
  approvalStatuses?: string[];
  rollbackPlans?: string[];
  deploymentWindows?: string[];
  changeFreezes?: string[];
  regulatories?: string[];
  vendorMaintenances?: string[];
  releaseSizes?: string[];
  releaseHealths?: string[];
  devSignoffs?: string[];
  testSignoffs?: string[];
  uatSignoffs?: string[];
  securityClearances?: string[];
  dressRehearsals?: string[];
  hypercarePlans?: string[];
  commsPlans?: string[];
  trainingStatuses?: string[];
  conflictTypes?: string[];
};

export function ReleaseFiltersBar({
  className,
  variant = "default",
  period,
  onPeriodChange,
  showListFilters = false,
  statusOptions = [],
  priorityOptions = [],
  impactOptions = [],
  options,
  manageFilters,
  children,
  /** Page must pass prefs-backed visibility. Default: only shared scope filters (no Releases-only fields). */
  isFilterVisible = (key) =>
    key === "departmentId" || key === "applicationId" || key === "environmentId",
}: {
  className?: string;
  variant?: "default" | "large";
  period?: Period;
  onPeriodChange?: (period: Period) => void;
  showListFilters?: boolean;
  statusOptions?: string[];
  priorityOptions?: string[];
  impactOptions?: string[];
  options?: ReleaseFilterOptionLists;
  manageFilters?: React.ReactNode;
  children?: React.ReactNode;
  isFilterVisible?: (key: string) => boolean;
}) {
  const {
    filters,
    setDepartmentId,
    setApplicationId,
    setEnvironmentId,
    setStatus,
    setPriority,
    setImpact,
    setFilter,
    clearFilters,
    hasRefinement,
    departments,
    applications,
    envOptions,
    loading,
  } = useReleaseFilters();

  const appOptions = filters.departmentId
    ? applications.filter((a) => a.departmentId === filters.departmentId)
    : applications;

  const approvalStatuses = options?.approvalStatuses ?? [];
  const rollbackPlans = options?.rollbackPlans ?? [];
  const deploymentWindows = options?.deploymentWindows ?? [];
  const changeFreezes = options?.changeFreezes ?? [];
  const regulatories = options?.regulatories ?? [];
  const vendorMaintenances = options?.vendorMaintenances ?? [];
  const releaseSizes = options?.releaseSizes ?? [];
  const releaseHealths = options?.releaseHealths ?? [];
  const devSignoffs = options?.devSignoffs ?? [];
  const testSignoffs = options?.testSignoffs ?? [];
  const uatSignoffs = options?.uatSignoffs ?? [];
  const securityClearances = options?.securityClearances ?? [];
  const dressRehearsals = options?.dressRehearsals ?? [];
  const hypercarePlans = options?.hypercarePlans ?? [];
  const commsPlans = options?.commsPlans ?? [];
  const trainingStatuses = options?.trainingStatuses ?? [];
  const conflictTypes = options?.conflictTypes ?? [];

  const signoffSelect = (
    key:
      | "devSignoff"
      | "testSignoff"
      | "uatSignoff"
      | "securityClearance"
      | "dressRehearsal"
      | "hypercarePlan"
      | "commsPlan"
      | "trainingStatus",
    label: string,
    values: string[]
  ) =>
    showListFilters &&
    isFilterVisible(key) && (
      <FilterSelect
        disabled={loading}
        value={filters[key]}
        onChange={(v) => setFilter(key, v)}
      >
        <option value="">{label}</option>
        {values.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </FilterSelect>
    );

  return (
    <TableFilterBar className={className} hasActive={hasRefinement} onClear={clearFilters} manageFilters={manageFilters}>
      {children}

      {isFilterVisible("departmentId") && (
        <FilterSelect disabled={loading} value={filters.departmentId} onChange={setDepartmentId}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </FilterSelect>
      )}

      {isFilterVisible("applicationId") && (
        <FilterSelect disabled={loading} value={filters.applicationId} onChange={setApplicationId}>
          <option value="">All applications</option>
          {appOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </FilterSelect>
      )}

      {isFilterVisible("environmentId") && (
        <FilterSelect disabled={loading || !envOptions.length} value={filters.environmentId} onChange={setEnvironmentId}>
          <option value="">All environments</option>
          {envOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.application.name} — {e.name}
            </option>
          ))}
        </FilterSelect>
      )}

      {period !== undefined && onPeriodChange && (
        <FilterSelect value={period} onChange={(v) => onPeriodChange(v as Period)}>
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FilterSelect>
      )}

      {showListFilters && isFilterVisible("status") && (
        <FilterSelect disabled={loading} value={filters.status} onChange={setStatus}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("priority") && (
        <FilterSelect disabled={loading} value={filters.priority} onChange={setPriority}>
          <option value="">All priorities</option>
          {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("impact") && (
        <FilterSelect disabled={loading} value={filters.impact} onChange={setImpact}>
          <option value="">All impacts</option>
          {impactOptions.map((i) => <option key={i} value={i}>{i}</option>)}
        </FilterSelect>
      )}

      {showListFilters && isFilterVisible("approvalStatus") && (
        <FilterSelect
          disabled={loading}
          value={filters.approvalStatus}
          onChange={(v) => setFilter("approvalStatus", v)}
        >
          <option value="">All approval statuses</option>
          {approvalStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("rollbackPlan") && (
        <FilterSelect
          disabled={loading}
          value={filters.rollbackPlan}
          onChange={(v) => setFilter("rollbackPlan", v)}
        >
          <option value="">All rollback plans</option>
          {rollbackPlans.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("deploymentWindow") && (
        <FilterSelect
          disabled={loading}
          value={filters.deploymentWindow}
          onChange={(v) => setFilter("deploymentWindow", v)}
        >
          <option value="">All deployment windows</option>
          {deploymentWindows.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("changeFreeze") && (
        <FilterSelect
          disabled={loading}
          value={filters.changeFreeze}
          onChange={(v) => setFilter("changeFreeze", v)}
        >
          <option value="">All change freezes</option>
          {changeFreezes.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("regulatory") && (
        <FilterSelect
          disabled={loading}
          value={filters.regulatory}
          onChange={(v) => setFilter("regulatory", v)}
        >
          <option value="">All regulatory</option>
          {regulatories.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("vendorMaintenance") && (
        <FilterSelect
          disabled={loading}
          value={filters.vendorMaintenance}
          onChange={(v) => setFilter("vendorMaintenance", v)}
        >
          <option value="">All vendor maintenance</option>
          {vendorMaintenances.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}
      {showListFilters && isFilterVisible("releaseSize") && (
        <FilterSelect
          disabled={loading}
          value={filters.releaseSize}
          onChange={(v) => setFilter("releaseSize", v)}
        >
          <option value="">All sizes</option>
          {releaseSizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}

      {showListFilters && isFilterVisible("releaseHealth") && (
        <FilterSelect
          disabled={loading}
          value={filters.releaseHealth}
          onChange={(v) => setFilter("releaseHealth", v)}
        >
          <option value="">All release health</option>
          {releaseHealths.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}

      {signoffSelect("devSignoff", "All dev signoff", devSignoffs)}
      {signoffSelect("testSignoff", "All test sign-off", testSignoffs)}
      {signoffSelect("uatSignoff", "All UAT sign-off", uatSignoffs)}
      {signoffSelect("securityClearance", "All security clearance", securityClearances)}
      {signoffSelect("dressRehearsal", "All dress rehearsal", dressRehearsals)}
      {signoffSelect("hypercarePlan", "All hypercare plans", hypercarePlans)}
      {signoffSelect("commsPlan", "All comms plans", commsPlans)}
      {signoffSelect("trainingStatus", "All training status", trainingStatuses)}

      {showListFilters && isFilterVisible("conflictType") && (
        <FilterSelect
          disabled={loading}
          value={filters.conflictType}
          onChange={(v) => setFilter("conflictType", v)}
        >
          <option value="">All conflict types</option>
          {conflictTypes.map((s) => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      )}

      {showListFilters && isFilterVisible("readinessPercent") && (
        <div className="inline-flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ready%</span>
          <FilterRangeInputs
            minValue={filters.readinessMin}
            maxValue={filters.readinessMax}
            onMinChange={(v) => setFilter("readinessMin", v)}
            onMaxChange={(v) => setFilter("readinessMax", v)}
            minPlaceholder="0"
            maxPlaceholder="100"
            disabled={loading}
          />
        </div>
      )}
      {showListFilters && isFilterVisible("goLiveChecklistPercent") && (
        <div className="inline-flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Go-Live%</span>
          <FilterRangeInputs
            minValue={filters.goLiveMin}
            maxValue={filters.goLiveMax}
            onMinChange={(v) => setFilter("goLiveMin", v)}
            onMaxChange={(v) => setFilter("goLiveMax", v)}
            minPlaceholder="0"
            maxPlaceholder="100"
            disabled={loading}
          />
        </div>
      )}

      {showListFilters && isFilterVisible("conflictFlag") && (
        <FilterTriState
          value={filters.conflictFlag}
          onChange={(v) => setFilter("conflictFlag", v)}
          yesLabel="Has conflict"
          noLabel="No conflict"
          allLabel="All conflicts"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("hasBlockers") && (
        <FilterTriState
          value={filters.hasBlockers}
          onChange={(v) => setFilter("hasBlockers", v)}
          yesLabel="Has blockers"
          noLabel="No blockers"
          allLabel="All blockers"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("hasDependsOn") && (
        <FilterTriState
          value={filters.hasDependsOn}
          onChange={(v) => setFilter("hasDependsOn", v)}
          yesLabel="Has depends-on"
          noLabel="No depends-on"
          allLabel="All depends-on"
          disabled={loading}
        />
      )}

      {showListFilters && isFilterVisible("releaseCodeQ") && (
        <FilterTextInput
          value={filters.releaseCodeQ}
          onChange={(v) => setFilter("releaseCodeQ", v)}
          placeholder="Release ID…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("nameQ") && (
        <FilterTextInput
          value={filters.nameQ}
          onChange={(v) => setFilter("nameQ", v)}
          placeholder="Release name…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("externalDependenciesQ") && (
        <FilterTextInput
          value={filters.externalDependenciesQ}
          onChange={(v) => setFilter("externalDependenciesQ", v)}
          placeholder="External dependencies…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("notesQ") && (
        <FilterTextInput
          value={filters.notesQ}
          onChange={(v) => setFilter("notesQ", v)}
          placeholder="Notes…"
          disabled={loading}
        />
      )}

      {showListFilters && isFilterVisible("releaseOwnerId") && (
        <FilterTextInput
          value={filters.releaseOwnerId}
          onChange={(v) => setFilter("releaseOwnerId", v)}
          placeholder="Owner name…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("stakeholderId") && (
        <FilterTextInput
          value={filters.stakeholderId}
          onChange={(v) => setFilter("stakeholderId", v)}
          placeholder="Stakeholder name…"
          disabled={loading}
        />
      )}

      {showListFilters && isFilterVisible("cabDateQ") && (
        <FilterTextInput
          value={filters.cabDateQ}
          onChange={(v) => setFilter("cabDateQ", v)}
          placeholder="CAB date…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("startDateQ") && (
        <FilterTextInput
          value={filters.startDateQ}
          onChange={(v) => setFilter("startDateQ", v)}
          placeholder="Start date…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("endDateQ") && (
        <FilterTextInput
          value={filters.endDateQ}
          onChange={(v) => setFilter("endDateQ", v)}
          placeholder="End date…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("testEnvRequiredQ") && (
        <FilterTextInput
          value={filters.testEnvRequiredQ}
          onChange={(v) => setFilter("testEnvRequiredQ", v)}
          placeholder="Test env required…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("uatEnvRequiredQ") && (
        <FilterTextInput
          value={filters.uatEnvRequiredQ}
          onChange={(v) => setFilter("uatEnvRequiredQ", v)}
          placeholder="UAT env required…"
          disabled={loading}
        />
      )}

      {showListFilters && isFilterVisible("conflictIdQ") && (
        <FilterTextInput
          value={filters.conflictIdQ}
          onChange={(v) => setFilter("conflictIdQ", v)}
          placeholder="Conflict ID…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("conflictingReleaseQ") && (
        <FilterTextInput
          value={filters.conflictingReleaseQ}
          onChange={(v) => setFilter("conflictingReleaseQ", v)}
          placeholder="Conflicting release…"
          disabled={loading}
        />
      )}
      {showListFilters && isFilterVisible("conflictNotesQ") && (
        <FilterTextInput
          value={filters.conflictNotesQ}
          onChange={(v) => setFilter("conflictNotesQ", v)}
          placeholder="Conflict notes…"
          disabled={loading}
        />
      )}

      {variant === "large" && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {filters.departmentId && (
            <Chip size="small" label={`Dept: ${departments.find((d) => d.id === filters.departmentId)?.name ?? filters.departmentId}`} />
          )}
        </Box>
      )}
    </TableFilterBar>
  );
}
