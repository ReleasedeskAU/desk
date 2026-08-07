-- Lifecycle config versioning + release pin (Wave 1 mid-flight guard).
-- Additive only: immutable version snapshots + nullable FK on Release.
-- See docs/lifecycle-backlog.md.

-- CreateTable
CREATE TABLE "UserReleaseLifecycleConfigVersion" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReleaseLifecycleConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserReleaseLifecycleConfigVersion_clerkUserId_version_key" ON "UserReleaseLifecycleConfigVersion"("clerkUserId", "version");

-- CreateIndex
CREATE INDEX "UserReleaseLifecycleConfigVersion_clerkUserId_createdAt_idx" ON "UserReleaseLifecycleConfigVersion"("clerkUserId", "createdAt");

-- AlterTable
ALTER TABLE "Release" ADD COLUMN "lifecycleConfigVersionId" TEXT;

-- CreateIndex
CREATE INDEX "Release_lifecycleConfigVersionId_idx" ON "Release"("lifecycleConfigVersionId");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_lifecycleConfigVersionId_fkey" FOREIGN KEY ("lifecycleConfigVersionId") REFERENCES "UserReleaseLifecycleConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
