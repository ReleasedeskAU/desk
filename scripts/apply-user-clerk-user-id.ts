/**
 * Apply User.clerkUserId column + indexes (additive only).
 * Prefer this over `prisma db push` — push tries to drop ensure*-created lifecycle tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerkUserId" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_key" ON "User"("clerkUserId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "User_clerkUserId_idx" ON "User"("clerkUserId")`
  );
  console.log("User.clerkUserId migration applied");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
