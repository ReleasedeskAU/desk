-- Additive migration: IntegrationFlow (Key Integration Flows).
-- No destructive changes; safe to run against the existing Neon DB.

CREATE TABLE IF NOT EXISTS "IntegrationFlow" (
    "id" TEXT NOT NULL,
    "flowCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "integrationType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dataElements" TEXT NOT NULL,
    "businessPurpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationFlow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationFlow_flowCode_key" ON "IntegrationFlow"("flowCode");
