-- CreateTable
CREATE TABLE "UserTablePreference" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "hiddenColumns" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTablePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTablePreference_clerkUserId_pageKey_key" ON "UserTablePreference"("clerkUserId", "pageKey");
