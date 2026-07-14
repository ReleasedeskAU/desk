"use client";

import { Globe } from "lucide-react";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { buildEnvironmentPromotions } from "@/lib/environment-promotions";
import type { DeploymentPhase, Release } from "@/lib/types";
import { cn } from "@/lib/utils";

const ENV_LABELS = { dev: "Dev", staging: "Staging", prod: "Prod" } as const;
const ENV_ORDER = ["dev", "staging", "prod"] as const;

const statusStyles: Record<string, string> = {
  live: "bg-success-50 text-success-700 border-success-200",
  deploying: "bg-brand-50 text-brand-700 border-brand-200 ring-2 ring-brand-200/50",
  pending: "bg-gray-50 text-gray-500 border-gray-200",
  failed: "bg-error-50 text-error-700 border-error-200",
  "rolled-back": "bg-orange-50 text-orange-700 border-orange-200",
};

export function EnvironmentPromotionStrip({
  release,
  deployPhase,
}: {
  release: Release;
  deployPhase?: DeploymentPhase;
}) {
  const promotions = buildEnvironmentPromotions(release, deployPhase);
  const regions = Array.from(new Set(promotions.map((p) => p.region)));

  return (
    <AdvancedCard
      title="Environment & Region Promotion"
      subtitle="Version across Dev → Staging → Prod per region"
      icon={Globe}
      variant="glass"
    >
      <div className="space-y-4">
        {regions.map((region) => {
          const row = promotions.filter((p) => p.region === region);
          return (
            <div
              key={region}
              className="rounded-xl border border-gray-100 bg-white/60 p-3 shadow-sm sm:p-4"
            >
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                {region} Region
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {ENV_ORDER.map((env, i) => {
                  const promo = row.find((p) => p.environment === env);
                  if (!promo) return null;
                  return (
                    <div key={`${region}-${env}`} className="flex flex-col sm:flex-row sm:items-center">
                      <div
                        className={cn(
                          "flex w-full flex-col rounded-xl border bg-white px-4 py-2.5 shadow-theme-sm transition-all sm:min-w-[120px] sm:w-auto",
                          statusStyles[promo.status]
                        )}
                      >
                        <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                          {ENV_LABELS[env]}
                        </span>
                        <span className="font-mono text-sm font-bold tracking-wider">{promo.version}</span>
                        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
                          {promo.status === "deploying" ? "Deploying…" : promo.status.replace("-", " ")}
                        </span>
                      </div>

                      {i < ENV_ORDER.length - 1 && (
                        <>
                          <div className="mx-auto hidden text-gray-300 sm:mx-2 sm:block" aria-hidden>
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </div>
                          <div className="flex justify-center py-0.5 text-gray-300 sm:hidden" aria-hidden>
                            <svg className="h-4 w-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AdvancedCard>
  );
}
