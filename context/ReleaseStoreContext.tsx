"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  buildLiveOrgContext,
  emptyReleaseStore,
  getDecision,
  getDeployment,
  getGlobalHistory,
  getMergedHistory,
  isAgentPaused,
  unreadCount,
  type QuickStartSeedId,
  type ReleaseStoreState,
} from "@/lib/release-store";
import type { DeploymentLiveState, HistoryEntry, Release, ReleaseDecision } from "@/lib/types";

const POLL_MS = 6000;

interface ReleaseStoreContextValue {
  state: ReleaseStoreState;
  getReleaseDecision: (releaseId: string) => ReturnType<typeof getDecision>;
  getReleaseHistory: (releaseId: string, base: HistoryEntry[]) => HistoryEntry[];
  getDeploymentState: (release: Release) => DeploymentLiveState;
  setReleaseDecision: (
    releaseId: string,
    version: string,
    decision: ReleaseDecision,
    opts?: { rationale?: string; overridden?: boolean }
  ) => void;
  sendApprovalReminder: (releaseId: string, version: string, gate: string, channel: string) => void;
  startDeploy: (release: Release) => void;
  tickDeploy: (release: Release) => void;
  rollbackDeploy: (release: Release) => void;
  setRollbackNarrative: (releaseId: string, narrative: string) => void;
  dismissNotification: (id: string) => void;
  dismissAllNotifications: () => void;
  unreadNotifications: number;
  applySeed: (seedId: QuickStartSeedId) => void;
  resetDemoState: () => void;
  setAgentPaused: (agentId: string, paused: boolean) => void;
  isAgentPaused: (agentId: string) => boolean;
  getGlobalHistory: () => ReturnType<typeof getGlobalHistory>;
  liveOrgContext: ReturnType<typeof buildLiveOrgContext>;
}

const ReleaseStoreContext = createContext<ReleaseStoreContextValue | null>(null);

async function fetchLiveState(): Promise<ReleaseStoreState | null> {
  try {
    const res = await fetch("/api/live-state", { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as ReleaseStoreState;
  } catch {
    return null;
  }
}

async function postJson(url: string, body?: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}

export function ReleaseStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReleaseStoreState>(() => emptyReleaseStore());

  const refresh = useCallback(async () => {
    const next = await fetchLiveState();
    if (next) setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const next = await fetchLiveState();
        if (!cancelled && next) setState(next);
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const afterMutation = useCallback(
    async (fn: () => Promise<void>) => {
      await fn();
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<ReleaseStoreContextValue>(
    () => ({
      state,
      getReleaseDecision: (releaseId) => getDecision(state, releaseId),
      getReleaseHistory: (releaseId, base) => getMergedHistory(state, releaseId, base),
      getDeploymentState: (release) => getDeployment(state, release.id, release),
      setReleaseDecision: (releaseId, version, decision, opts) => {
        void afterMutation(() =>
          postJson(`/api/releases-ai/${releaseId}/decision`, {
            decision,
            version,
            rationale: opts?.rationale,
            overridden: opts?.overridden,
          })
        );
      },
      sendApprovalReminder: (releaseId, version, gate, channel) => {
        void afterMutation(() =>
          postJson(`/api/releases-ai/${releaseId}/reminder`, { version, gate, channel })
        );
      },
      startDeploy: (release) => {
        void afterMutation(() => postJson(`/api/releases-ai/${release.id}/deployment/start`));
      },
      tickDeploy: () => {
        void refresh();
      },
      rollbackDeploy: (release) => {
        void afterMutation(() => postJson(`/api/releases-ai/${release.id}/deployment/rollback`));
      },
      setRollbackNarrative: (releaseId, narrative) => {
        void afterMutation(() =>
          postJson(`/api/releases-ai/${releaseId}/deployment/narrative`, { narrative })
        );
      },
      dismissNotification: (id) => {
        void afterMutation(() => postJson(`/api/notifications/${id}/read`));
      },
      dismissAllNotifications: () => {
        void afterMutation(() => postJson("/api/notifications/read-all"));
      },
      unreadNotifications: unreadCount(state),
      applySeed: (seedId) => {
        void afterMutation(() =>
          seedId === "reset"
            ? postJson("/api/quick-start/reset")
            : postJson(`/api/quick-start/${seedId}`)
        );
      },
      resetDemoState: () => {
        void afterMutation(() => postJson("/api/quick-start/reset"));
      },
      setAgentPaused: (agentId, paused) => {
        void afterMutation(() => postJson(`/api/agents/${agentId}/pause`, { paused }));
      },
      isAgentPaused: (agentId) => isAgentPaused(state, agentId),
      getGlobalHistory: () => getGlobalHistory(state),
      liveOrgContext: buildLiveOrgContext(state),
    }),
    [state, afterMutation, refresh]
  );

  return <ReleaseStoreContext.Provider value={value}>{children}</ReleaseStoreContext.Provider>;
}

export function useReleaseStore() {
  const ctx = useContext(ReleaseStoreContext);
  if (!ctx) throw new Error("useReleaseStore must be used within ReleaseStoreProvider");
  return ctx;
}
