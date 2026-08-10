-- Baseline reconciliation (2026-08-07).
--
-- Records the live Organization table in Prisma migration history. On production
-- Neon the table already exists (created 2026-07-02 via unrecoverable migrations
-- outside this repo). Statements are idempotent so apply is a no-op there and
-- safe for any environment that still lacks the table.
--
-- Deliberately does NOT create the other 25 abandoned tenancy-era tables.
-- See docs/migration-history-note.md and docs/tickets/cleanup-25-dead-tenancy-tables.md.

CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isSystemGlobal" BOOLEAN NOT NULL DEFAULT false,
    "clerkOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "logoUrl" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingStep" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");
