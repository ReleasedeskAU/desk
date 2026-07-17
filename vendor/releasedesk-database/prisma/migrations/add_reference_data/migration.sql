-- Additive migration: generic ReferenceData lookup table.
-- First use case: category="drift_type" for Drift.driftType dropdown values.
-- No destructive changes; safe to run against the existing Neon DB.

CREATE TABLE IF NOT EXISTS "ReferenceData" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferenceData_category_value_key"
    ON "ReferenceData"("category", "value");

CREATE INDEX IF NOT EXISTS "ReferenceData_category_idx"
    ON "ReferenceData"("category");
