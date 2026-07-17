-- Bridge v2 Neon DB back to v1 Prisma schema (additive only — no row deletes)

-- 1) Restore v1 Release.owner column
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "owner" TEXT;

UPDATE "Release" r
SET "owner" = u."name"
FROM "User" u
WHERE r."releaseOwnerId" = u."id"
  AND (r."owner" IS NULL OR r."owner" = '');

UPDATE "Release"
SET "owner" = 'Unassigned'
WHERE "owner" IS NULL OR btrim("owner") = '';

ALTER TABLE "Release" ALTER COLUMN "owner" SET NOT NULL;

-- 2) Backfill Application required v1 fields
UPDATE "Application" SET "type" = 'General' WHERE "type" IS NULL;
UPDATE "Application" SET "support" = '' WHERE "support" IS NULL;
UPDATE "Application" SET "criticality" = 'Medium' WHERE "criticality" IS NULL;

ALTER TABLE "Application" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "Application" ALTER COLUMN "support" SET NOT NULL;
ALTER TABLE "Application" ALTER COLUMN "criticality" SET NOT NULL;
