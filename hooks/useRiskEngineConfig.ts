/**
 * Client hook: load the current user's risk engine config (defaults if none).
 */
"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  normalizeRiskEngineConfig,
  type RiskEngineConfig,
} from "@/lib/risk-engine-config";

/**
 * Fetches GET /api/risk-engine-config once on mount.
 * @returns { config, loading, reload } — config is always usable (defaults while loading).
 */
export function useRiskEngineConfig(): {
  config: RiskEngineConfig;
  loading: boolean;
  reload: () => void;
} {
  const [config, setConfig] = useState<RiskEngineConfig>(DEFAULT_RISK_ENGINE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/risk-engine-config")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setConfig(normalizeRiskEngineConfig(data.config ?? data));
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    config,
    loading,
    reload: () => setTick((t) => t + 1),
  };
}
