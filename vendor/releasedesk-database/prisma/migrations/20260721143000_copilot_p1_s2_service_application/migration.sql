-- Copilot P1-S2: optional Service.applicationId → Application
-- Enables Service → Application → ReleaseApplication → Release without denormalizing onto Release.

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "applicationId" TEXT;

CREATE INDEX IF NOT EXISTS "Service_applicationId_idx" ON "Service"("applicationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Service_applicationId_fkey'
  ) THEN
    ALTER TABLE "Service"
      ADD CONSTRAINT "Service_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
