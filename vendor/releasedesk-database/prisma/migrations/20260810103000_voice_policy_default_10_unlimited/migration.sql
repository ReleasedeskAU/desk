-- AlterTable: default 10-min semantics + unlimited + approval request
ALTER TABLE "VoiceUserPolicy" ADD COLUMN IF NOT EXISTS "unlimitedUsage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VoiceUserPolicy" ADD COLUMN IF NOT EXISTS "minutesApprovalRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VoiceUserPolicy_minutesApprovalRequestedAt_idx" ON "VoiceUserPolicy"("minutesApprovalRequestedAt");
