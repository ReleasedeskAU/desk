/** Browser event fired after Settings successfully saves risk engine config (same-tab consumers reload). */
export const RISK_ENGINE_CONFIG_UPDATED_EVENT = "sentinel:risk-engine-config-updated";

/**
 * Notify open Risk/Dashboard clients to refetch config.
 * No-op on the server.
 */
export function broadcastRiskEngineConfigUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RISK_ENGINE_CONFIG_UPDATED_EVENT));
}
