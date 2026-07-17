-- Webhook connectors + Release.jiraIssueKey (shared schema)

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "jiraIssueKey" TEXT;

CREATE INDEX IF NOT EXISTS "Release_jiraIssueKey_idx" ON "Release"("jiraIssueKey");

CREATE TABLE IF NOT EXISTS "WebhookConnector" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpointToken" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "baseUrl" TEXT,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConnector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookConnector_endpointToken_key"
  ON "WebhookConnector"("endpointToken");

CREATE INDEX IF NOT EXISTS "WebhookConnector_organizationId_idx"
  ON "WebhookConnector"("organizationId");

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "organizationId" TEXT,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookEvent_organizationId_status_idx"
  ON "WebhookEvent"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "WebhookEvent_connectorId_idx"
  ON "WebhookEvent"("connectorId");

CREATE INDEX IF NOT EXISTS "WebhookEvent_status_receivedAt_idx"
  ON "WebhookEvent"("status", "receivedAt");

DO $$ BEGIN
  ALTER TABLE "WebhookEvent"
    ADD CONSTRAINT "WebhookEvent_connectorId_fkey"
    FOREIGN KEY ("connectorId") REFERENCES "WebhookConnector"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
