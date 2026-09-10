"use client";

import { useEffect, useState } from "react";
import { FileText, History, Paperclip, Plus, Trash2 } from "lucide-react";
import { DetailSection, EmptyHint, StatusChip, TintedCallout } from "@/components/detail/editable";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import {
  grantsFromScopeWriteBody,
  SCOPE_APPROVE_BY_HELP,
  SCOPE_APPROVE_BY_LABEL,
  SCOPE_APPROVED,
  SCOPE_CHANGE_REQUEST_APPROVED,
  SCOPE_CHANGE_REQUEST_SAVED,
  SCOPE_DRAFT_SAVED,
  SCOPE_EDITOR_ADDED,
  SCOPE_EDITOR_REMOVED,
  SCOPE_SECTION_EDITORS_HELP,
  SCOPE_SECTION_HELP,
} from "@/lib/release-scope-feedback";

type HistoryRow = {
  id: string;
  actorName: string;
  beforeText: string | null;
  afterText: string | null;
  createdAt: string;
};

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  uploadedByName: string;
  createdAt: string;
};

type GrantRow = {
  id: string;
  granteeUserId: string;
  grantedByUserId: string;
};

type SectionCaps = {
  canEditDescription: boolean;
  canAddAttachments: boolean;
  canApprove: boolean;
  canAddGrant: boolean;
  canRemoveGrant: boolean;
  canStartChangeRequest: boolean;
  grantHint: string | null;
};

type ChangeRequestView = {
  id: string;
  statusKey: string;
  statusLabel: string;
  proposedText: string;
  approvalWhy: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  lockVersion: number;
  createdAt: string;
  history: HistoryRow[];
  attachments: FileRow[];
  grants: GrantRow[];
  capabilities: SectionCaps;
};

export type NativeScopeView = {
  id: string;
  statusKey: string;
  statusLabel: string;
  approvalDueAt: string | null;
  approvalDueOverdue: boolean;
  approvalDueRequired: boolean;
  approvedAt: string | null;
  approvedByName: string | null;
  lockVersion: number;
  description: string;
  history: HistoryRow[];
  attachments: FileRow[];
  grants: GrantRow[];
  changeRequests: ChangeRequestView[];
};

type AssignmentOption = { id: string; label: string; name: string };

type TabKey = "description" | "history" | "attachments";

type ScopeWriteBody = {
  error?: string;
  scope?: { grants?: GrantRow[] };
};

async function writeJson(
  url: string,
  init: RequestInit & { label: string }
): Promise<{ ok: true; data: ScopeWriteBody } | { ok: false; error: string }> {
  const res = await safeFetchJson<ScopeWriteBody>(url, {
    ...init,
    rejectHttpErrors: false,
  });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.status >= 400) {
    return { ok: false, error: res.data?.error ?? "Request failed." };
  }
  return { ok: true, data: res.data ?? {} };
}

/**
 * Native Scope + change-request sections on the release page.
 *
 * @param props.releaseId - Release id or code for API paths.
 * @param props.scope - Payload from GET /api/releases/[id].
 * @param props.scopeCaps - Scope-section capabilities.
 * @param props.users - Directory users for grants (existing users only).
 * @param props.onChanged - Reload the release after a write.
 */
export function ReleaseScopeSection({
  releaseId,
  scope,
  scopeCaps,
  users,
  onChanged,
}: {
  releaseId: string;
  scope: NativeScopeView;
  scopeCaps: SectionCaps;
  users: AssignmentOption[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("description");
  const [text, setText] = useState(scope.description);
  const [due, setDue] = useState(scope.approvalDueAt ? scope.approvalDueAt.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [grants, setGrants] = useState(scope.grants);

  const approved = scope.statusKey !== "draft";

  useEffect(() => {
    setText(scope.description);
    setDue(scope.approvalDueAt ? scope.approvalDueAt.slice(0, 10) : "");
  }, [scope.description, scope.approvalDueAt, scope.lockVersion]);

  useEffect(() => {
    setGrants(scope.grants);
  }, [scope.grants]);

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await writeJson(`/api/releases/${releaseId}/scope`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: text,
        approvalDueAt: due || null,
        lockVersion: scope.lockVersion,
      }),
      label: "scope-save",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(SCOPE_DRAFT_SAVED);
    onChanged();
  }

  async function approve() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await writeJson(`/api/releases/${releaseId}/scope/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lockVersion: scope.lockVersion }),
      label: "scope-approve",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(SCOPE_APPROVED);
    onChanged();
  }

  async function startChangeRequest() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await writeJson(`/api/releases/${releaseId}/scope/change-requests`, {
      method: "POST",
      label: "scope-cr-create",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged();
  }

  return (
    <DetailSection
      id="section-scope"
      icon={FileText}
      tone="sky"
      title="Scope"
      description="What is in and out of this release."
      detail={SCOPE_SECTION_HELP}
      collapsible
      defaultOpen
    >
      <ScopeChrome
        statusLabel={scope.statusLabel}
        dueLabel={dueDisplay(scope.approvalDueAt)}
        overdue={scope.approvalDueOverdue}
        canApprove={scopeCaps.canApprove}
        approveBusy={busy}
        onApprove={approve}
        grantHint={scopeCaps.grantHint}
      />
      {error ? (
        <TintedCallout tone="rose" className="mt-3">
          {error}
        </TintedCallout>
      ) : null}
      {success ? (
        <div
          role="status"
          className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30"
        >
          {success}
        </div>
      ) : null}
      <SectionTabs tab={tab} onTab={setTab} />
      {tab === "description" ? (
        <div className="mt-3 space-y-3">
          {scopeCaps.canEditDescription ? (
            <>
              <textarea
                className={cn(taInput, "min-h-[140px]")}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What is in scope, what is out of scope, and which applications are involved."
              />
              <div className="flex flex-wrap items-end gap-3">
                {/* Cap the date field so taInput's w-full cannot cover Save draft. */}
                <label className="block min-w-0 w-full max-w-xs text-xs font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    {SCOPE_APPROVE_BY_LABEL}
                    {scope.approvalDueRequired ? " *" : null}
                    <InfoTooltip text={SCOPE_APPROVE_BY_HELP} label={`About ${SCOPE_APPROVE_BY_LABEL}`} />
                  </span>
                  <input
                    type="date"
                    className={cn(taInput, "mt-1")}
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={cn(taBtnSecondary, "relative z-[1] shrink-0")}
                  disabled={busy}
                  onClick={saveDraft}
                >
                  Save draft
                </button>
              </div>
            </>
          ) : (
            <TintedCallout tone="sky">{scope.description || "No scope text yet."}</TintedCallout>
          )}
          {scope.approvedByName && scope.approvedAt ? (
            <p className="text-[12px] text-slate-500">
              Approved by {scope.approvedByName} · {formatDateTime(scope.approvedAt)}
            </p>
          ) : null}
          <GrantRow
            grants={grants}
            users={users}
            canAdd={scopeCaps.canAddGrant}
            canRemove={scopeCaps.canRemoveGrant}
            grantUserId={grantUserId}
            onGrantUserId={setGrantUserId}
            busy={busy}
            onAdd={async () => {
              if (!grantUserId) return;
              setBusy(true);
              setError(null);
              setSuccess(null);
              const res = await writeJson(`/api/releases/${releaseId}/scope/grants`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ granteeUserId: grantUserId }),
                label: "scope-grant",
              });
              setBusy(false);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              const nextGrants = grantsFromScopeWriteBody(res.data);
              if (nextGrants) setGrants(nextGrants);
              setGrantUserId("");
              setSuccess(SCOPE_EDITOR_ADDED);
              onChanged();
            }}
            onRemove={async (grantId) => {
              setBusy(true);
              setError(null);
              setSuccess(null);
              const res = await writeJson(`/api/releases/${releaseId}/scope/grants/${grantId}`, {
                method: "DELETE",
                label: "scope-ungrant",
              });
              setBusy(false);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              const nextGrants = grantsFromScopeWriteBody(res.data);
              if (nextGrants) setGrants(nextGrants);
              else setGrants((prev) => prev.filter((g) => g.id !== grantId));
              setSuccess(SCOPE_EDITOR_REMOVED);
              onChanged();
            }}
          />
        </div>
      ) : null}
      {tab === "history" ? <HistoryList rows={scope.history} /> : null}
      {tab === "attachments" ? (
        <AttachmentList
          files={scope.attachments}
          canAdd={scopeCaps.canAddAttachments}
          downloadHref={(fileId) => `/api/releases/${releaseId}/scope/attachments/${fileId}`}
          uploadHref={`/api/releases/${releaseId}/scope/attachments`}
          onUploaded={onChanged}
          onError={setError}
        />
      ) : null}

      {approved ? (
        <div className="mt-6 space-y-4 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold text-slate-800 dark:text-white">Scope change requests</h4>
            {scopeCaps.canStartChangeRequest &&
            !scope.changeRequests.some((r) => r.statusKey === "draft") ? (
              <button type="button" className={taBtnSecondary} disabled={busy} onClick={startChangeRequest}>
                <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                New change request
              </button>
            ) : null}
          </div>
          {scope.changeRequests.length === 0 ? (
            <EmptyHint>No scope-change requests yet.</EmptyHint>
          ) : (
            scope.changeRequests.map((req) => (
              <ChangeRequestCard
                key={req.id}
                releaseId={releaseId}
                request={req}
                users={users}
                onChanged={onChanged}
                onNotify={setSuccess}
              />
            ))
          )}
        </div>
      ) : null}
    </DetailSection>
  );
}

function ScopeChrome({
  statusLabel,
  dueLabel,
  overdue,
  canApprove,
  approveBusy,
  onApprove,
  grantHint,
}: {
  statusLabel: string;
  dueLabel: string;
  overdue: boolean;
  canApprove: boolean;
  approveBusy: boolean;
  onApprove: () => void;
  grantHint: string | null;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={cn(canApprove ? taBtnPrimary : taBtnSecondary, "text-xs")}
        disabled={!canApprove || approveBusy}
        onClick={onApprove}
      >
        {statusLabel}
      </button>
      <span className="text-[12px] text-slate-500">
        Due {dueLabel}
        {overdue ? (
          <span className="ml-2 font-semibold text-amber-700 dark:text-amber-300">Overdue</span>
        ) : null}
      </span>
      {grantHint ? (
        <StatusChip label={grantHint} tone="info" className="text-[11px]" />
      ) : null}
    </div>
  );
}

function SectionTabs({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }) {
  const items: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: "description", label: "Description", icon: FileText },
    { key: "history", label: "History", icon: History },
    { key: "attachments", label: "Attachments", icon: Paperclip },
  ];
  return (
    <div className="flex gap-1 border-b border-slate-100 dark:border-[var(--border)]">
      {items.map((item) => {
        const Icon = item.icon;
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onTab(item.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold",
              active
                ? "border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-300"
                : "text-slate-500 hover:text-slate-700 dark:text-white/55"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function HistoryList({ rows }: { rows: HistoryRow[] }) {
  if (!rows.length) return <EmptyHint>No history yet.</EmptyHint>;
  return (
    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
      {rows.map((row) => (
        <div key={row.id} className="rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] dark:bg-white/5">
          <p className="font-semibold text-slate-800 dark:text-white">
            {row.actorName} · {formatDateTime(row.createdAt)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-white/70">
            {(row.beforeText || "(empty)") + " → " + (row.afterText || "(empty)")}
          </p>
        </div>
      ))}
    </div>
  );
}

function AttachmentList({
  files,
  canAdd,
  downloadHref,
  uploadHref,
  onUploaded,
  onError,
}: {
  files: FileRow[];
  canAdd: boolean;
  downloadHref: (id: string) => string;
  uploadHref: string;
  onUploaded: () => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      {canAdd ? (
        <label className={cn(taBtnSecondary, "cursor-pointer text-xs")}>
          Add file
          <input
            type="file"
            accept=".pdf,.doc,.docx,.eml,.msg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,message/rfc822"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const body = new FormData();
              body.append("file", file);
              const res = await fetch(uploadHref, { method: "POST", body });
              if (!res.ok) {
                const json = (await res.json().catch(() => null)) as { error?: string } | null;
                onError(json?.error ?? "Could not add that file.");
                return;
              }
              onUploaded();
            }}
          />
        </label>
      ) : null}
      {files.length === 0 ? (
        <EmptyHint>No attachments.</EmptyHint>
      ) : (
        files.map((file) => (
          <a
            key={file.id}
            href={downloadHref(file.id)}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-indigo-700 hover:bg-slate-100 dark:bg-white/5 dark:text-indigo-300"
          >
            <span>
              {file.originalName}
              <span className="ml-2 text-slate-400">
                {file.uploadedByName} · {formatDateTime(file.createdAt)}
              </span>
            </span>
          </a>
        ))
      )}
    </div>
  );
}

function GrantRow({
  grants,
  users,
  canAdd,
  canRemove,
  grantUserId,
  onGrantUserId,
  busy,
  onAdd,
  onRemove,
}: {
  grants: GrantRow[];
  users: AssignmentOption[];
  canAdd: boolean;
  canRemove: boolean;
  grantUserId: string;
  onGrantUserId: (id: string) => void;
  busy: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const nameFor = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  return (
    <div className="space-y-2">
      <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Section editors
        <InfoTooltip text={SCOPE_SECTION_EDITORS_HELP} label="About Section editors" />
      </p>
      {grants.map((g) => (
        <div
          key={g.id}
          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-[12.5px] dark:bg-white/5"
        >
          <span>{nameFor(g.granteeUserId)} — can edit this section</span>
          {canRemove ? (
            <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => onRemove(g.id)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
      {canAdd ? (
        <div className="flex flex-wrap items-end gap-2">
          {/* Same w-full overflow as the due-date row — cap the picker so Add stays clickable. */}
          <div className="min-w-0 w-full max-w-xs">
            <SearchableSelect
              value={grantUserId}
              onChange={onGrantUserId}
              options={users.map((u) => ({ value: u.id, label: u.label }))}
              placeholder="Add an existing user…"
              searchPlaceholder="Search users…"
            />
          </div>
          <button
            type="button"
            className={cn(taBtnSecondary, "relative z-[1] shrink-0")}
            disabled={busy || !grantUserId}
            onClick={onAdd}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChangeRequestCard({
  releaseId,
  request,
  users,
  onChanged,
  onNotify,
}: {
  releaseId: string;
  request: ChangeRequestView;
  users: AssignmentOption[];
  onChanged: () => void;
  onNotify: (message: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("description");
  const [text, setText] = useState(request.proposedText);
  const [why, setWhy] = useState(request.approvalWhy ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [grants, setGrants] = useState(request.grants);
  const caps = request.capabilities;
  const base = `/api/releases/${releaseId}/scope/change-requests/${request.id}`;

  useEffect(() => {
    setText(request.proposedText);
    setWhy(request.approvalWhy ?? "");
  }, [request.proposedText, request.approvalWhy, request.lockVersion]);

  useEffect(() => {
    setGrants(request.grants);
  }, [request.grants]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await writeJson(base, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proposedText: text,
        approvalWhy: why,
        lockVersion: request.lockVersion,
      }),
      label: "scope-cr-save",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onNotify(SCOPE_CHANGE_REQUEST_SAVED);
    onChanged();
  }

  async function approve() {
    setBusy(true);
    setError(null);
    const res = await writeJson(`${base}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lockVersion: request.lockVersion }),
      label: "scope-cr-approve",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onNotify(SCOPE_CHANGE_REQUEST_APPROVED);
    onChanged();
  }

  return (
    <div className="rounded-2xl border border-slate-100 p-3 dark:border-[var(--border)]">
      <ScopeChrome
        statusLabel={request.statusLabel}
        dueLabel="—"
        overdue={false}
        canApprove={caps.canApprove}
        approveBusy={busy}
        onApprove={approve}
        grantHint={caps.grantHint}
      />
      {error ? (
        <TintedCallout tone="rose" className="mb-2">
          {error}
        </TintedCallout>
      ) : null}
      <SectionTabs tab={tab} onTab={setTab} />
      {tab === "description" ? (
        <div className="mt-3 space-y-3">
          {caps.canEditDescription ? (
            <>
              <textarea
                className={cn(taInput, "min-h-[120px]")}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Proposed scope text (does not change current scope until approved)"
              />
              <label className="block text-xs font-medium text-slate-500">
                Why (required before approve)
                <textarea
                  className={cn(taInput, "mt-1 min-h-[64px]")}
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                />
              </label>
              <button type="button" className={taBtnSecondary} disabled={busy} onClick={save}>
                Save draft
              </button>
            </>
          ) : (
            <>
              <TintedCallout tone="sky">{request.proposedText || "No proposed text."}</TintedCallout>
              {request.approvalWhy ? (
                <p className="text-[12px] text-slate-500">Why: {request.approvalWhy}</p>
              ) : null}
            </>
          )}
          <GrantRow
            grants={grants}
            users={users}
            canAdd={caps.canAddGrant}
            canRemove={caps.canRemoveGrant}
            grantUserId={grantUserId}
            onGrantUserId={setGrantUserId}
            busy={busy}
            onAdd={async () => {
              if (!grantUserId) return;
              setBusy(true);
              setError(null);
              const res = await writeJson(`${base}/grants`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ granteeUserId: grantUserId }),
                label: "scope-cr-grant",
              });
              setBusy(false);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              const nextGrants = grantsFromScopeWriteBody(res.data, request.id);
              if (nextGrants) setGrants(nextGrants);
              setGrantUserId("");
              onNotify(SCOPE_EDITOR_ADDED);
              onChanged();
            }}
            onRemove={async (grantId) => {
              setBusy(true);
              setError(null);
              const res = await writeJson(`${base}/grants/${grantId}`, {
                method: "DELETE",
                label: "scope-cr-ungrant",
              });
              setBusy(false);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              const nextGrants = grantsFromScopeWriteBody(res.data, request.id);
              if (nextGrants) setGrants(nextGrants);
              else setGrants((prev) => prev.filter((g) => g.id !== grantId));
              onNotify(SCOPE_EDITOR_REMOVED);
              onChanged();
            }}
          />
        </div>
      ) : null}
      {tab === "history" ? <HistoryList rows={request.history} /> : null}
      {tab === "attachments" ? (
        <AttachmentList
          files={request.attachments}
          canAdd={caps.canAddAttachments}
          downloadHref={(fileId) => `${base}/attachments/${fileId}`}
          uploadHref={`${base}/attachments`}
          onUploaded={onChanged}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function dueDisplay(value: string | null): string {
  if (!value) return "—";
  return formatDate(value);
}
