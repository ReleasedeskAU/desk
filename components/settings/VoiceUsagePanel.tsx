"use client";

/**
 * Admin voice usage snapshot (Settings → Integrations).
 * Surfaces daily session counts + cost ceilings from GET /api/copilot/voice/usage.
 */
import { useEffect, useState } from "react";
import { Mic } from "lucide-react";

type UsageRow = {
  userId: string;
  dayKey: string;
  sessionCount: number;
  durationMs: number;
  lastSessionAt: number | null;
};

type UsageResponse = {
  users?: UsageRow[];
  ceilings?: {
    maxSessionDurationMs: number;
    maxSessionsPerUserPerDay: number;
  };
  costRates?: {
    audioInputUsdPerMin: number;
    audioOutputUsdPerMin: number;
    duplexUsdPerMin: number;
  };
  worstCaseUsdPerUserPerDay?: number;
  error?: string;
};

/**
 * Load and render today's voice usage for admins.
 */
export function VoiceUsagePanel() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/copilot/voice/usage", {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as UsageResponse;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Could not load usage (${res.status})`);
          return;
        }
        setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load voice usage");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxMin =
    (data?.ceilings?.maxSessionDurationMs ?? 0) / 60_000;
  const maxSessions = data?.ceilings?.maxSessionsPerUserPerDay ?? 0;

  return (
    <div className="space-y-6" data-testid="voice-usage-panel">
      <div>
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-gray-900 dark:text-white">
          <Mic className="h-5 w-5 text-[var(--theme-accent,#2548C9)]" />
          Voice usage (today)
        </h2>
        <p className="mt-1 text-[14px] text-gray-500 dark:text-gray-300">
          In-memory session counts for Gemini Live. Ceilings limit runaway spend;
          rates are planning estimates for audio duplex.
        </p>
      </div>

      {error ? (
        <p className="text-[14px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {data?.ceilings && data.costRates ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-[13px] dark:border-[var(--border)] dark:bg-[var(--card)]">
          <p className="font-semibold text-gray-900 dark:text-white">Ceilings</p>
          <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
            <li>
              Max session duration: {maxMin} min
            </li>
            <li>
              Max sessions / user / day: {maxSessions}
            </li>
            <li>
              Audio rates (planning): in ${data.costRates.audioInputUsdPerMin}/min ·
              out ${data.costRates.audioOutputUsdPerMin}/min · duplex $
              {data.costRates.duplexUsdPerMin}/min
            </li>
            <li>
              Worst-case / user / day (all sessions at max duration, full duplex): ~$
              {(data.worstCaseUsdPerUserPerDay ?? 0).toFixed(2)}
            </li>
          </ul>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[var(--border)]">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-gray-50 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Sessions</th>
              <th className="px-4 py-2.5 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  No voice sessions recorded today on this instance.
                </td>
              </tr>
            ) : (
              (data?.users ?? []).map((u) => (
                <tr
                  key={u.userId}
                  className="border-t border-gray-100 dark:border-white/10"
                >
                  <td className="px-4 py-2.5 font-mono text-[12px] text-gray-800 dark:text-white/90">
                    {u.userId}
                  </td>
                  <td className="px-4 py-2.5">{u.sessionCount}</td>
                  <td className="px-4 py-2.5">
                    {Math.round(u.durationMs / 1000)}s
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
