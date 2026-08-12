-- AlterTable: bridge directory User → Clerk session id for lifecycle cron personalization
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerkUserId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE INDEX IF NOT EXISTS "User_clerkUserId_idx" ON "User"("clerkUserId");
