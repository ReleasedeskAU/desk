/**
 * Additive Release Manager + native Scope tables.
 * Do not use `prisma db push` — the vendored schema is behind the live DB
 * and would drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "releaseManagerId" TEXT
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Release_releaseManagerId_idx" ON "Release"("releaseManagerId")
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Release"
        ADD CONSTRAINT "Release_releaseManagerId_fkey"
        FOREIGN KEY ("releaseManagerId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReleaseScope" (
      "id" TEXT NOT NULL,
      "releaseId" TEXT NOT NULL,
      "statusKey" TEXT NOT NULL,
      "approvalDueAt" TIMESTAMP(3),
      "approvedAt" TIMESTAMP(3),
      "approvedByUserId" TEXT,
      "approvedByName" TEXT,
      "lockVersion" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ReleaseScope_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseScope_releaseId_key" ON "ReleaseScope"("releaseId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScope_statusKey_idx" ON "ReleaseScope"("statusKey")
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScope"
        ADD CONSTRAINT "ReleaseScope_releaseId_fkey"
        FOREIGN KEY ("releaseId") REFERENCES "Release"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReleaseScopeHistory" (
      "id" TEXT NOT NULL,
      "scopeId" TEXT NOT NULL,
      "actorUserId" TEXT NOT NULL,
      "actorName" TEXT NOT NULL,
      "beforeText" TEXT,
      "afterText" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReleaseScopeHistory_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeHistory_scopeId_createdAt_idx"
      ON "ReleaseScopeHistory"("scopeId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeHistory"
        ADD CONSTRAINT "ReleaseScopeHistory_scopeId_fkey"
        FOREIGN KEY ("scopeId") REFERENCES "ReleaseScope"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReleaseScopeChangeRequest" (
      "id" TEXT NOT NULL,
      "scopeId" TEXT NOT NULL,
      "statusKey" TEXT NOT NULL,
      "proposedText" TEXT,
      "approvalWhy" TEXT,
      "approvedAt" TIMESTAMP(3),
      "approvedByUserId" TEXT,
      "approvedByName" TEXT,
      "lockVersion" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ReleaseScopeChangeRequest_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeChangeRequest_scopeId_createdAt_idx"
      ON "ReleaseScopeChangeRequest"("scopeId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeChangeRequest_scopeId_statusKey_idx"
      ON "ReleaseScopeChangeRequest"("scopeId", "statusKey")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseScopeChangeRequest_one_draft"
      ON "ReleaseScopeChangeRequest"("scopeId")
      WHERE "statusKey" = 'draft'
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeChangeRequest"
        ADD CONSTRAINT "ReleaseScopeChangeRequest_scopeId_fkey"
        FOREIGN KEY ("scopeId") REFERENCES "ReleaseScope"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReleaseScopeChangeHistory" (
      "id" TEXT NOT NULL,
      "changeRequestId" TEXT NOT NULL,
      "actorUserId" TEXT NOT NULL,
      "actorName" TEXT NOT NULL,
      "beforeText" TEXT,
      "afterText" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReleaseScopeChangeHistory_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeChangeHistory_changeRequestId_createdAt_idx"
      ON "ReleaseScopeChangeHistory"("changeRequestId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeChangeHistory"
        ADD CONSTRAINT "ReleaseScopeChangeHistory_changeRequestId_fkey"
        FOREIGN KEY ("changeRequestId") REFERENCES "ReleaseScopeChangeRequest"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReleaseScopeFile" (
      "id" TEXT NOT NULL,
      "tenantKey" TEXT NOT NULL,
      "storageKey" TEXT NOT NULL,
      "originalName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "byteSize" INTEGER NOT NULL,
      "uploadedByUserId" TEXT NOT NULL,
      "uploadedByName" TEXT NOT NULL,
      "scopeId" TEXT,
      "changeRequestId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReleaseScopeFile_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseScopeFile_storageKey_key" ON "ReleaseScopeFile"("storageKey")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeFile_scopeId_idx" ON "ReleaseScopeFile"("scopeId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeFile_changeRequestId_idx" ON "ReleaseScopeFile"("changeRequestId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeFile_tenantKey_idx" ON "ReleaseScopeFile"("tenantKey")
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeFile"
        ADD CONSTRAINT "ReleaseScopeFile_scopeId_fkey"
        FOREIGN KEY ("scopeId") REFERENCES "ReleaseScope"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeFile"
        ADD CONSTRAINT "ReleaseScopeFile_changeRequestId_fkey"
        FOREIGN KEY ("changeRequestId") REFERENCES "ReleaseScopeChangeRequest"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReleaseScopeSectionGrant" (
      "id" TEXT NOT NULL,
      "granteeUserId" TEXT NOT NULL,
      "grantedByUserId" TEXT NOT NULL,
      "scopeId" TEXT,
      "changeRequestId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReleaseScopeSectionGrant_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeSectionGrant_scopeId_idx"
      ON "ReleaseScopeSectionGrant"("scopeId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeSectionGrant_changeRequestId_idx"
      ON "ReleaseScopeSectionGrant"("changeRequestId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReleaseScopeSectionGrant_granteeUserId_idx"
      ON "ReleaseScopeSectionGrant"("granteeUserId")
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeSectionGrant"
        ADD CONSTRAINT "ReleaseScopeSectionGrant_scopeId_fkey"
        FOREIGN KEY ("scopeId") REFERENCES "ReleaseScope"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ReleaseScopeSectionGrant"
        ADD CONSTRAINT "ReleaseScopeSectionGrant_changeRequestId_fkey"
        FOREIGN KEY ("changeRequestId") REFERENCES "ReleaseScopeChangeRequest"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserScopeSectionConfig" (
      "id" TEXT NOT NULL,
      "clerkUserId" TEXT NOT NULL,
      "snapshot" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserScopeSectionConfig_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserScopeSectionConfig_clerkUserId_key"
      ON "UserScopeSectionConfig"("clerkUserId")
  `);
}

main()
  .catch((err) => {
    console.error("[add-release-scope-tables] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
