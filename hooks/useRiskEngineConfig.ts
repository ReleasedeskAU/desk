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
import { RISK_ENGINE_CONFIG_UPDATED_EVENT } from "@/lib/risk-engine-config-events";

/**
 * Fetches GET /api/risk-engine-config on mount and whenever Settings broadcasts an update.
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
    const onUpdated = () => setTick((t) => t + 1);
    window.addEventListener(RISK_ENGINE_CONFIG_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(RISK_ENGINE_CONFIG_UPDATED_EVENT, onUpdated);
  }, []);

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
        const next = normalizeRiskEngineConfig(data.config ?? data);
        // #region agent log
        fetch('http://127.0.0.1:7344/ingest/492950fb-2790-4cbd-9ede-c2d15d57b4c6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'496e00'},body:JSON.stringify({sessionId:'496e00',runId:'post-fix',hypothesisId:'H3',location:'useRiskEngineConfig.ts:loaded',message:'Client hook loaded config',data:{tick,bands:next.simpleBands.map((b)=>({id:b.id,label:b.label,maxScore:b.maxScore})),likelihoodMax:next.likelihoodMax,impactMax:next.impactMax,isDefaultLabels:next.simpleBands.map((b)=>b.label).join('|')==='LOW|MEDIUM|HIGH|CRITICAL'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        setConfig(next);
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
