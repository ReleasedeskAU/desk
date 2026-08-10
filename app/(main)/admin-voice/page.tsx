"use client";

/**
 * /admin-voice — Voice super-admin console.
 * Only admin@releasedesk.com.au may view or mutate bans / minute limits.
 * Default: every user gets 10 min/day; admin can raise minutes or grant unlimited.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { Mic, ShieldBan, Timer } from "lucide-react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { isVoiceSuperAdminEmail } from "@/lib/voice/admin-gate-constants";
import { VOICE_DEFAULT_DAILY_MINUTES } from "@/lib/voice/policy-constants";
import { cn } from "@/lib/utils";

type AdminVoiceUser = {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  banned: boolean;
  unlimitedUsage: boolean;
  dailyMinutesLimit: number | null;
  effectiveDailyMinutes: number | null;
  approvalRequested: boolean;
  minutesApprovalRequestedAt: string | null;
  sessionCount: number;
  durationMs: number;
  minutesUsed: number;
  dayKey: string | null;
  lastSessionAt: number | null;
};

type AdminVoiceResponse = {
  users?: AdminVoiceUser[];
  defaultDailyMinutes?: number;
  warning?: string | null;
  ceilings?: {
    maxSessionDurationMs: number;
    maxSessionsPerUserPerDay: number;
  };
  error?: string;
  detail?: string;
};

type PolicyPatch = {
  banned?: boolean;
  dailyMinutesLimit?: number | null;
  unlimitedUsage?: boolean;
  clearMinutesApproval?: boolean;
  email?: string;
};

/**
 * Voice admin dashboard — usage, per-user minute caps, bans, approval requests.
 */
function AdminVoicePageInner() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<AdminVoiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({});
  const [newClerkId, setNewClerkId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newLimit, setNewLimit] = useState(String(VOICE_DEFAULT_DAILY_MINUTES));
  const [newUnlimited, setNewUnlimited] = useState(false);

  const defaultMinutes = data?.defaultDailyMinutes ?? VOICE_DEFAULT_DAILY_MINUTES;

  const load = useCallback(async () => {
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
      const meJson = (await meRes.json().catch(() => ({}))) as {
        user?: { email?: string };
      };
      if (!meRes.ok || !isVoiceSuperAdminEmail(meJson.user?.email)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const res = await fetch("/api/admin/voice", { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as AdminVoiceResponse;
      if (!res.ok) {
        const detail = json.detail ? ` — ${json.detail}` : "";
        setError(`${json.error ?? `Failed to load (${res.status})`}${detail}`);
        return;
      }
      setData(json);
      if (json.warning) {
        setError(json.warning);
      }
      const drafts: Record<string, string> = {};
      for (const u of json.users ?? []) {
        drafts[u.clerkUserId] =
          u.unlimitedUsage || u.dailyMinutesLimit == null
            ? ""
            : String(u.dailyMinutesLimit);
      }
      setDraftLimits(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setAllowed(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchUser = async (clerkUserId: string, body: PolicyPatch) => {
    setBusyId(clerkUserId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/voice/${encodeURIComponent(clerkUserId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Update failed (${res.status})`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  if (allowed === null) {
    return <TablePageSuspenseFallback />;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <ShieldBan className="mx-auto h-10 w-10 text-gray-400" />
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Voice admin only
        </h1>
        <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-300">
          This console is restricted to the Release Desk voice super-admin
          mailbox.
        </p>
      </div>
    );
  }

  const maxSessionMin = (data?.ceilings?.maxSessionDurationMs ?? 0) / 60_000;
  const maxSessions = data?.ceilings?.maxSessionsPerUserPerDay ?? 0;
  const pendingCount = (data?.users ?? []).filter((u) => u.approvalRequested).length;

  return (
    <div className="w-full pb-24 font-sans" data-testid="admin-voice-page">
      <div className="mb-8 mt-2">
        <h1 className="mb-2 flex items-center gap-2 text-[32px] font-bold tracking-tight text-gray-900 dark:text-white">
          <Mic className="h-8 w-8 text-[var(--theme-accent,#2548C9)]" />
          Voice Admin
        </h1>
        <p className="text-[15px] font-medium leading-relaxed text-gray-500 dark:text-gray-300">
          Every user starts with {defaultMinutes} voice minutes per day. Raise
          a limit, grant unlimited, or ban accounts. Pending “need more minutes”
          requests appear at the top.
        </p>
      </div>

      {error ? (
        <p className="mb-4 text-[14px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-[13px] dark:border-[var(--border)] dark:bg-[var(--card)]">
        <p className="font-semibold text-gray-900 dark:text-white">Global ceilings</p>
        <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
          <li>Default daily minutes / user: {defaultMinutes} min</li>
          <li>Max session duration: {maxSessionMin} min</li>
          <li>Max sessions / user / day: {maxSessions}</li>
          <li>
            Pending approval requests: {pendingCount}
          </li>
        </ul>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--card)]">
        <p className="text-[14px] font-semibold text-gray-900 dark:text-white">
          Add / seed a user policy
        </p>
        <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
          Use the Clerk user id (from a prior Voice session row or Clerk dashboard).
          Leave minutes empty for the default {defaultMinutes} min/day.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-gray-600 dark:text-gray-300">
            Clerk user id
            <input
              value={newClerkId}
              onChange={(e) => setNewClerkId(e.target.value)}
              className="mt-1 block w-64 rounded-md border border-gray-200 px-2 py-1.5 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
              placeholder="user_..."
            />
          </label>
          <label className="text-[12px] text-gray-600 dark:text-gray-300">
            Email
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1 block w-56 rounded-md border border-gray-200 px-2 py-1.5 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
              placeholder="user@company.com"
            />
          </label>
          <label className="text-[12px] text-gray-600 dark:text-gray-300">
            Daily minutes
            <input
              type="number"
              min={0}
              disabled={newUnlimited}
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="mt-1 block w-28 rounded-md border border-gray-200 px-2 py-1.5 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white disabled:opacity-50"
              placeholder={String(defaultMinutes)}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[12px] text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={newUnlimited}
              onChange={(e) => setNewUnlimited(e.target.checked)}
            />
            Unlimited
          </label>
          <button
            type="button"
            disabled={!newClerkId.trim() || busyId === newClerkId.trim()}
            onClick={() => {
              const id = newClerkId.trim();
              const raw = newLimit.trim();
              const dailyMinutesLimit =
                newUnlimited || raw === ""
                  ? null
                  : Number.parseInt(raw, 10);
              if (
                !newUnlimited &&
                raw !== "" &&
                !Number.isFinite(dailyMinutesLimit)
              ) {
                setError("Minutes limit must be a whole number");
                return;
              }
              void (async () => {
                setBusyId(id);
                try {
                  const res = await fetch(
                    `/api/admin/voice/${encodeURIComponent(id)}`,
                    {
                      method: "PATCH",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email: newEmail.trim() || undefined,
                        dailyMinutesLimit,
                        unlimitedUsage: newUnlimited,
                        banned: false,
                      }),
                    }
                  );
                  const json = (await res.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  if (!res.ok) {
                    setError(json.error ?? `Create failed (${res.status})`);
                    return;
                  }
                  setNewClerkId("");
                  setNewEmail("");
                  setNewLimit(String(defaultMinutes));
                  setNewUnlimited(false);
                  await load();
                } finally {
                  setBusyId(null);
                }
              })();
            }}
            className="rounded-md bg-[var(--theme-accent,#2548C9)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            Save policy
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[var(--border)]">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-gray-50 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Today</th>
              <th className="px-4 py-2.5 font-semibold">Minutes / unlimited</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No voice usage or policies yet today. The default{" "}
                  {defaultMinutes} min/day applies as soon as someone opens Voice.
                </td>
              </tr>
            ) : (
              (data?.users ?? []).map((u) => {
                const busy = busyId === u.clerkUserId;
                const limitLabel = u.unlimitedUsage
                  ? "Unlimited"
                  : `${u.effectiveDailyMinutes ?? defaultMinutes} min/day`;
                return (
                  <tr
                    key={u.clerkUserId}
                    className={cn(
                      "border-t border-gray-100 dark:border-[var(--border)]",
                      u.approvalRequested && "bg-amber-50/70 dark:bg-amber-500/10"
                    )}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {u.name ?? u.email ?? "Unknown user"}
                      </div>
                      <div className="text-[12px] text-gray-500 dark:text-gray-400">
                        {u.email ?? "(no email stored yet)"}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-gray-400">
                        {u.clerkUserId}
                      </div>
                      {u.approvalRequested ? (
                        <div className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          Requested more minutes
                          {u.minutesApprovalRequestedAt
                            ? ` · ${new Date(u.minutesApprovalRequestedAt).toLocaleString()}`
                            : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                      <div>{u.sessionCount} sessions</div>
                      <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                        <Timer className="h-3.5 w-3.5" />
                        {u.minutesUsed} / {limitLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={24 * 60}
                          placeholder={`default ${defaultMinutes}`}
                          disabled={busy || u.unlimitedUsage}
                          value={draftLimits[u.clerkUserId] ?? ""}
                          onChange={(e) =>
                            setDraftLimits((prev) => ({
                              ...prev,
                              [u.clerkUserId]: e.target.value,
                            }))
                          }
                          className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px] dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={busy || u.unlimitedUsage}
                          onClick={() => {
                            const raw = (draftLimits[u.clerkUserId] ?? "").trim();
                            const dailyMinutesLimit =
                              raw === "" ? null : Number.parseInt(raw, 10);
                            if (raw !== "" && !Number.isFinite(dailyMinutesLimit)) {
                              setError("Minutes limit must be a whole number");
                              return;
                            }
                            void patchUser(u.clerkUserId, {
                              dailyMinutesLimit,
                              unlimitedUsage: false,
                            });
                          }}
                          className="rounded-md bg-gray-900 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900"
                        >
                          Save mins
                        </button>
                        <label className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={u.unlimitedUsage}
                            onChange={(e) =>
                              void patchUser(u.clerkUserId, {
                                unlimitedUsage: e.target.checked,
                                ...(e.target.checked
                                  ? { dailyMinutesLimit: null }
                                  : {}),
                              })
                            }
                          />
                          Unlimited
                        </label>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        Empty + not unlimited = default {defaultMinutes} min/day
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
                          u.banned
                            ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                            : u.approvalRequested
                              ? "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        )}
                      >
                        {u.banned
                          ? "Banned"
                          : u.approvalRequested
                            ? "Needs approval"
                            : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex flex-col items-end gap-2">
                        {u.approvalRequested && !u.banned ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const raw = (draftLimits[u.clerkUserId] ?? "").trim();
                              const bumped =
                                raw === ""
                                  ? Math.max(
                                      defaultMinutes * 3,
                                      Math.ceil(u.minutesUsed) + defaultMinutes
                                    )
                                  : Number.parseInt(raw, 10);
                              if (!Number.isFinite(bumped)) {
                                setError("Set a whole-number minutes limit first");
                                return;
                              }
                              void patchUser(u.clerkUserId, {
                                dailyMinutesLimit: bumped,
                                unlimitedUsage: false,
                                clearMinutesApproval: true,
                              });
                            }}
                            className="rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            Approve + raise mins
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void patchUser(u.clerkUserId, { banned: !u.banned })
                          }
                          className={cn(
                            "rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50",
                            u.banned
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-red-600 text-white hover:bg-red-700"
                          )}
                        >
                          {u.banned ? "Unban" : "Ban voice"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminVoicePage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <AdminVoicePageInner />
    </Suspense>
  );
}
