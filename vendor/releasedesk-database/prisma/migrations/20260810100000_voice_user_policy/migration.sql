-- CreateTable
CREATE TABLE "VoiceUserPolicy" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "dailyMinutesLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceUserPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceUserPolicy_clerkUserId_key" ON "VoiceUserPolicy"("clerkUserId");

-- CreateIndex
CREATE INDEX "VoiceUserPolicy_email_idx" ON "VoiceUserPolicy"("email");
