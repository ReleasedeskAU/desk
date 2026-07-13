"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EnvironmentDetailsTable } from "@/components/environments/EnvironmentDetailsTable";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import {
  ENVIRONMENT_COLUMNS,
  ENVIRONMENT_DEFAULT_HIDDEN_FILTER_KEYS,
  ENVIRONMENT_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { ENVIRONMENT_SORT_PRESETS } from "@/lib/table-sort-presets";
import { useTableFilters } from "@/hooks/useTableFilters";
import { useTableSort } from "@/hooks/useTableSort";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { TopBar } from "@/components/layout/TopBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { ENVIRONMENTS_FILTER_SCHEMA } from "@/lib/table-filters";
import { loadJsonEffect } from "@/lib/safe-fetch";

type DeskPayload = {
  versionMatrix: unknown[];
  versions: Array<{
    id?: string;
    appCode?: string | null;
    status?: string | null;
    version?: string | null;
    buildNumber?: string | null;
    deployDate?: string | Date | null;
    updatedBy?: string | null;
    notes?: string | null;
    environment?: { name?: string; type?: string; owner?: string | null };
    application?: { id?: string; name?: string; department?: { id?: string; name?: string } };
  }>;
  applications?: Array<{ id: string; name: string; departmentId?: string }>;
  departments?: Array<{ id: string; name: string }>;
  environments?: Array<{ id: string; name: string; type: string }>;
};

export function EnvironmentsContent() {
  const { values, setFilter, setSort, clearAll, hasActive, apiQuery } = useTableFilters(ENVIRONMENTS_FILTER_SCHEMA);
  const { sortKey, sortDir, toggleSort } = useTableSort(values, setFilter, "application", "asc");
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [deskLoading, setDeskLoading] = useState(true);

  const loadDesk = useCallback(() => {
    setDeskLoading(true);
    return loadJsonEffect<DeskPayload>(
      `/api/environment-desk${apiQuery}`,
      setDesk,
      { label: "environment-desk", onFinally: () => setDeskLoading(false) },
    );
  }, [apiQuery]);

  useEffect(() => {
    return loadDesk();
  }, [loadDesk]);

  const appOptions = useMemo(() => {
    if (!desk?.applications?.length) {
      const seen = new Map<string, string>();
      for (const v of desk?.versions ?? []) {
        const id = v.application?.id;
        const name = v.application?.name;
        if (id && name) seen.set(id, name);
      }
      return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }
    const list = values.departmentId
      ? desk.applications.filter((a) => a.departmentId === values.departmentId)
      : desk.applications;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [desk, values.departmentId]);

  const departmentOptions = useMemo(() => {
    if (desk?.departments?.length) return desk.departments;
    const seen = new Map<string, string>();
    for (const v of desk?.versions ?? []) {
      const name = v.application?.department?.name;
      if (name) seen.set(name, name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [desk]);

  const environmentNames = useMemo(() => {
    const fromEnvs = (desk?.environments ?? []).flatMap((e) => [e.type, e.name].filter(Boolean));
    const fromVersions = (desk?.versions ?? []).flatMap((v) =>
      [v.environment?.type, v.environment?.name].filter(Boolean) as string[]
    );
    return [...new Set([...fromEnvs, ...fromVersions])].sort();
  }, [desk]);

  const statusOptions = useMemo(
    () =>
      [...new Set((desk?.versions ?? []).map((v) => (v.status ?? "").trim()).filter(Boolean))].sort(),
    [desk]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "environments",
    ENVIRONMENT_COLUMNS,
    ENVIRONMENT_FILTER_FIELDS,
    {
      lockedKeys: ["appId"],
      defaultHiddenFilters: ENVIRONMENT_DEFAULT_HIDDEN_FILTER_KEYS,
    }
  );

  const tablePending = useTablePageLoading(deskLoading, prefsLoaded);

  if (tablePending) {
    return (
      <div className="space-y-6 min-w-0">
        <TableSkeleton columns={ENVIRONMENT_COLUMNS.length} rows={10} showFilterBar={false} />
      </div>
    );
  }

  if (!desk) {
    return null;
  }

  return (
    <div className="space-y-6 min-w-0">
      <TopBar
        pageKey="environments"
        title="Versions & Config"
        trailing={<PageDocumentation pageKey="environments" />}
      />

      <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
        {isFilterVisible("applicationId") && (
          <FilterSelect
            value={values.applicationId}
            onChange={(v) => setFilter("applicationId", v)}
          >
            <option value="">All applications</option>
            {appOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("departmentId") && (
          <FilterSelect value={values.departmentId} onChange={(v) => setFilter("departmentId", v)}>
            <option value="">All departments</option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("environmentName") && (
          <FilterSelect value={values.environmentName} onChange={(v) => setFilter("environmentName", v)}>
            <option value="">All environments</option>
            {environmentNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("status") && (
          <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("versionQ") && (
          <FilterTextInput
            value={values.versionQ}
            onChange={(v) => setFilter("versionQ", v)}
            placeholder="Version…"
          />
        )}
        {isFilterVisible("envOwnerQ") && (
          <FilterTextInput
            value={values.envOwnerQ}
            onChange={(v) => setFilter("envOwnerQ", v)}
            placeholder="Env owner…"
          />
        )}
        {isFilterVisible("buildNumberQ") && (
          <FilterTextInput
            value={values.buildNumberQ}
            onChange={(v) => setFilter("buildNumberQ", v)}
            placeholder="Build number…"
          />
        )}
        {isFilterVisible("deployDateQ") && (
          <FilterTextInput
            value={values.deployDateQ}
            onChange={(v) => setFilter("deployDateQ", v)}
            placeholder="Deploy date…"
          />
        )}
        {isFilterVisible("deployedByQ") && (
          <FilterTextInput
            value={values.deployedByQ}
            onChange={(v) => setFilter("deployedByQ", v)}
            placeholder="Deployed by…"
          />
        )}
        {isFilterVisible("notesQ") && (
          <FilterTextInput
            value={values.notesQ}
            onChange={(v) => setFilter("notesQ", v)}
            placeholder="Notes…"
          />
        )}
      </TableFilterBar>

      <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
        <EnvironmentDetailsTable
          versions={desk.versions}
          isColumnVisible={isColumnVisible}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={ENVIRONMENT_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          }
        />
      </div>
    </div>
  );
}
