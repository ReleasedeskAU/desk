-- AlterTable
ALTER TABLE "EnvBooking" ADD COLUMN IF NOT EXISTS "bookingCode" TEXT;
ALTER TABLE "EnvBooking" ADD COLUMN IF NOT EXISTS "dependencies" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EnvBooking_bookingCode_key" ON "EnvBooking"("bookingCode");
