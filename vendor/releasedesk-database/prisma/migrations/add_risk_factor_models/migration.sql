-- Additive migration: Risk Scoring Part 2 (System 2 — Weighted Risk Score)
-- Adds RiskFactor + ReleaseRiskFactorInput tables and two nullable columns on Release.
-- No destructive changes; safe to run against the existing v2-leaning Neon DB.

CREATE TABLE IF NOT EXISTS "RiskFactor" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "factorName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskFactor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReleaseRiskFactorInput" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "riskFactorId" TEXT NOT NULL,
    "rawValue" DOUBLE PRECISION NOT NULL,
    "bandScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseRiskFactorInput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseRiskFactorInput_releaseId_riskFactorId_key"
    ON "ReleaseRiskFactorInput"("releaseId", "riskFactorId");

DO $$ BEGIN
    ALTER TABLE "ReleaseRiskFactorInput"
        ADD CONSTRAINT "ReleaseRiskFactorInput_releaseId_fkey"
        FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ReleaseRiskFactorInput"
        ADD CONSTRAINT "ReleaseRiskFactorInput_riskFactorId_fkey"
        FOREIGN KEY ("riskFactorId") REFERENCES "RiskFactor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "weightedRiskScore" DOUBLE PRECISION;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "weightedRiskLevel" TEXT;
