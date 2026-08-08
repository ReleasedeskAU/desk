"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Clock, CheckCircle2, XCircle, AlertCircle, Plus } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { APPROVAL_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  APPROVAL_COLUMNS,
  APPROVAL_DEFAULT_HIDDEN_COLUMN_KEYS,
  APPROVALS_DEFAULT_HIDDEN_FILTER_KEYS,
  APPROVALS_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { cn, formatDate } from "@/lib/utils";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { APPROVALS_FILTER_SCHEMA } from "@/lib/table-filters";
import { safeFetchJson } from "@/lib/safe-fetch";
import { ApprovalCreateModal } from "@/components/approvals/ApprovalCreateModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";

type ApprovalRow = {
  id: string;
  approvalCode: string;
  releaseId: string;
  release: { id: string; releaseCode: string; name: string; status: string; releaseDate: string };
  applicationName: string | null;
  departmentName: string | null;
  approvalType: string;
  approver: { id: string; userId: string; name: string; email: string; role: string };
  submittedDate: string;
  decisionDate: string | null;
  decision: string;
  comments: string | null;
  cabMeetingId: string | null;
};

const DECISION_ICON: Record<string, React.ReactNode> = {
  Approved: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  "Approved with Conditions": <AlertCircle className="h-4 w-4 text-amber-500" />,
  Pending: <Clock className="h-4 w-4 text-gray-400" />,
  Rejected: <XCircle className="h-4 w-4 text-red-500" />,
  Deferred: <Clock className="h-4 w-4 text-amber-500" />,
  Expired: <AlertCircle className="h-4 w-4 text-orange-500" />,
  Withdrawn: <XCircle className="h-4 w-4 text-slate-400" />,
};

export default function ApprovalQueueContent() {
  const {
    rows: approvals,
    loading,
    values,
    setFilter,
    setSort,
    clearAll,
    hasActive,
    sortKey,
    sortDir,
    toggleSort,
    refetch,
  } = useFilteredFetch<ApprovalRow>("/api/approvals", APPROVALS_FILTER_SCHEMA, {
    defaultSortKey: "submittedDate",
    defaultSortDir: "desc",
    sortAccessors: {
      approvalCode: (r) => r.approvalCode,
      releaseId: (r) => r.release.releaseCode,
      releaseName: (r) => r.release.name,
      application: (r) => r.applicationName ?? "",
      department: (r) => r.departmentName ?? "",
      approvalType: (r) => r.approvalType,
      approverId: (r) => r.approver.userId,
      approverName: (r) => r.approver.name,
      approverRole: (r) => r.approver.role,
      submittedDate: (r) => new Date(r.submittedDate).getTime(),
      decisionDate: (r) => (r.decisionDate ? new Date(r.decisionDate).getTime() : 0),
      decision: (r) => r.decision,
      comments: (r) => r.comments ?? "",
      cabMeetingId: (r) => r.cabMeetingId ?? "",
    },
  });
  const [allApprovals, setAllApprovals] = useState<ApprovalRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [approvalsRes, meRes] = await Promise.all([
        safeFetchJson<typeof allApprovals>("/api/approvals", { signal: ac.signal, label: "approvals" }),
        safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal: ac.signal, label: "auth-me" }),
      ]);
      if (ac.signal.aborted) return;
      if (approvalsRes.ok) setAllApprovals(approvalsRes.data);
      if (meRes.ok) setUser(meRes.data.user);
    })();
    return () => ac.abort();
  }, []);

  const decisions = useMemo(() => [...new Set(allApprovals.map((a) => a.decision))].sort(), [allApprovals]);
  const types = useMemo(() => [...new Set(allApprovals.map((a) => a.approvalType))].sort(), [allApprovals]);
  const roles = useMemo(
    () => [...new Set(allApprovals.map((a) => a.approver.role).filter(Boolean))].sort(),
    [allApprovals]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "approvals",
    APPROVAL_COLUMNS,
    APPROVALS_FILTER_FIELDS,
    {
      lockedKeys: ["approvalCode"],
      defaultHiddenFilters: APPROVALS_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: APPROVAL_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const voiceVisibleRows = useMemo(
    () =>
      approvals.map((a) => ({
        code: a.approvalCode,
        label: `${a.approvalCode} — ${a.release.releaseCode}`,
        path: `/approvals/${a.id}`,
      })),
    [approvals]
  );
  useVoiceListContext(
    "/approvals",
    "approval",
    voiceVisibleRows,
    hasActive ? "filtered" : undefined
  );

  return (
    <div>
      <TopBar
        pageKey="approvals"
        trailing={
          <div className="flex items-center gap-2">
            {sessionCanEdit(user) ? (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> Add New Approval
              </button>
            ) : null}
            <PageDocumentation pageKey="approvals" />
          </div>
        }
        title="Approval Queue" subtitle={`${approvals.length} approval${approvals.length === 1 ? "" : "s"} across all releases`} />
      <ApprovalCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          refetch();
          void safeFetchJson<ApprovalRow[]>("/api/approvals", { label: "approvals-refresh" }).then((result) => {
            if (result.ok) setAllApprovals(result.data);
          });
        }}
        approvalTypes={types}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("decision") && (
            <FilterSelect value={values.decision} onChange={(v) => setFilter("decision", v)}>
              <option value="">All decisions</option>
              {decisions.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("approvalType") && (
            <FilterSelect value={values.approvalType} onChange={(v) => setFilter("approvalType", v)}>
              <option value="">All approval types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("approverQ") && (
            <FilterTextInput
              value={values.approverQ}
              onChange={(v) => setFilter("approverQ", v)}
              placeholder="Approver name or ID…"
            />
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release ID…"
            />
          )}
          {isFilterVisible("releaseNameQ") && (
            <FilterTextInput
              value={values.releaseNameQ}
              onChange={(v) => setFilter("releaseNameQ", v)}
              placeholder="Release name…"
            />
          )}
          {isFilterVisible("approvalCodeQ") && (
            <FilterTextInput
              value={values.approvalCodeQ}
              onChange={(v) => setFilter("approvalCodeQ", v)}
              placeholder="Approval ID…"
            />
          )}
          {isFilterVisible("approverRole") && (
            <FilterSelect value={values.approverRole} onChange={(v) => setFilter("approverRole", v)}>
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("submittedDateQ") && (
            <FilterTextInput
              value={values.submittedDateQ}
              onChange={(v) => setFilter("submittedDateQ", v)}
              placeholder="Submitted (YYYY-MM-DD)…"
            />
          )}
          {isFilterVisible("decisionDateQ") && (
            <FilterTextInput
              value={values.decisionDateQ}
              onChange={(v) => setFilter("decisionDateQ", v)}
              placeholder="Decision (YYYY-MM-DD)…"
            />
          )}
          {isFilterVisible("commentsQ") && (
            <FilterTextInput
              value={values.commentsQ}
              onChange={(v) => setFilter("commentsQ", v)}
              placeholder="Comments…"
            />
          )}
          {isFilterVisible("cabMeetingIdQ") && (
            <FilterTextInput
              value={values.cabMeetingIdQ}
              onChange={(v) => setFilter("cabMeetingIdQ", v)}
              placeholder="CAB meeting…"
            />
          )}
          {isFilterVisible("applicationQ") && (
            <FilterTextInput
              value={values.applicationQ}
              onChange={(v) => setFilter("applicationQ", v)}
              placeholder="Application…"
            />
          )}
          {isFilterVisible("departmentQ") && (
            <FilterTextInput
              value={values.departmentQ}
              onChange={(v) => setFilter("departmentQ", v)}
              placeholder="Department…"
            />
          )}
        </TableFilterBar>
      )}

      {tablePending ? (
        <TableSkeleton columns={APPROVAL_COLUMNS.length} />
      ) : approvals.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <ClipboardCheck className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{hasActive ? "No approvals match the selected filters." : "No approvals found."}</p>
        </div>
      ) : (
        <DataTable title="All Approvals" icon={ClipboardCheck} toolbar={<TablePageToolbar columnPicker={columnPicker} presets={APPROVAL_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={APPROVAL_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className={tableRow}>
                    {isColumnVisible("approvalCode") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <ProgressLink href={`/approvals/${a.id}`} data-voice-row={a.approvalCode} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
                        {a.approvalCode}
                      </ProgressLink>
                    </td>
                    )}
                    {isColumnVisible("releaseId") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <ProgressLink href={`/releases/${a.release.id}`} className="text-brand-600 dark:text-brand-400 hover:underline text-xs">
                        {a.release.releaseCode}
                      </ProgressLink>
                    </td>
                    )}
                    {isColumnVisible("releaseName") && <td className={`${tableCell} whitespace-nowrap`}>{a.release.name}</td>}
                    {isColumnVisible("application") && <td className={`${tableCell} whitespace-nowrap`}>{a.applicationName ?? "—"}</td>}
                    {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{a.departmentName ?? "—"}</td>}
                    {isColumnVisible("approvalType") && <td className={`${tableCell} whitespace-nowrap`}>{a.approvalType}</td>}
                    {isColumnVisible("approverId") && <td className={`${tableCell} whitespace-nowrap`}><span className="font-mono text-xs text-gray-500">{a.approver.userId}</span></td>}
                    {isColumnVisible("approverName") && <td className={`${tableCell} whitespace-nowrap`}>{a.approver.name}</td>}
                    {isColumnVisible("approverRole") && <td className={`${tableCell} whitespace-nowrap text-gray-600 text-xs`}>{a.approver.role}</td>}
                    {isColumnVisible("submittedDate") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(a.submittedDate)}</td>}
                    {isColumnVisible("decisionDate") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{a.decisionDate ? formatDate(a.decisionDate) : "—"}</td>}
                    {isColumnVisible("decision") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <div className="flex items-center gap-1.5">
                        {DECISION_ICON[a.decision] ?? <Clock className="h-4 w-4 text-gray-400" />}
                        <span className="font-medium">{a.decision}</span>
                      </div>
                    </td>
                    )}
                    {isColumnVisible("comments") && <td className={`${tableCell} truncate max-w-[200px] whitespace-nowrap`} title={a.comments ?? ""}>{a.comments ?? "—"}</td>}
                    {isColumnVisible("cabMeetingId") && <td className={`${tableCell} whitespace-nowrap`}>{a.cabMeetingId ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      )}
    </div>
  );
}
