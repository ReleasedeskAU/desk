-- Per-user risk engine thresholds/labels (Simple + Weighted).
-- Org-ready shape: same pattern as UserAppearancePreference (clerkUserId unique).

CREATE TABLE IF NOT EXISTS "UserRiskEngineConfig" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "likelihoodMax" INTEGER NOT NULL DEFAULT 5,
    "impactMax" INTEGER NOT NULL DEFAULT 5,
    "simpleBandLabels" JSONB NOT NULL,
    "simpleBandCutoffs" JSONB NOT NULL,
    "weightedBandLabels" JSONB NOT NULL,
    "weightedBandCutoffs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRiskEngineConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserRiskEngineConfig_clerkUserId_key"
  ON "UserRiskEngineConfig"("clerkUserId");
