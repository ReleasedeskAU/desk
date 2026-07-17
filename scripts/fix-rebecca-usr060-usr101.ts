/**
 * One-off fix: restore USR-060 after email collision with USR-101,
 * insert USR-101 with placeholder email.
 * Run: npx tsx scripts/fix-rebecca-usr060-usr101.ts
 */
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

const USR060 = {
  userId: "USR-060",
  name: "Rebecca Stone",
  email: "rebecca.stone@company.com",
  role: "Operations Manager",
  department: "Operations",
  manager: "VP Operations",
  accessLevel: "Admin",
  status: "Active",
  lastLogin: new Date("2026-06-24"),
};

const USR101 = {
  userId: "USR-101",
  name: "Rebecca Stone",
  // PLACEHOLDER — needs a real unique email once Excel is corrected upstream
  email: "rebecca.stone+usr101@company.com",
  role: "Conflict Resolution Specialist",
  department: "IT",
  manager: "Release Director",
  accessLevel: "Standard",
  status: "Active",
  lastLogin: new Date("2026-07-05"),
};

async function main() {
  const existing = await prisma.user.findMany({
    where: {
      OR: [
        { email: "rebecca.stone@company.com" },
        { email: USR101.email },
        { userId: "USR-060" },
        { userId: "USR-101" },
      ],
    },
  });
  console.log("before:", existing.map((u) => ({ userId: u.userId, email: u.email, role: u.role })));

  const collision = existing.find((u) => u.email === "rebecca.stone@company.com");
  if (!collision) throw new Error("No row with rebecca.stone@company.com");

  await prisma.user.update({
    where: { id: collision.id },
    data: USR060,
  });
  console.log("restored USR-060 on", collision.id);

  const already101 = existing.find((u) => u.userId === "USR-101" && u.id !== collision.id);
  if (already101) {
    console.log("USR-101 already exists as separate row — skipping insert");
  } else {
    const orgRows = await prisma.$queryRawUnsafe<{ organizationId: string | null }[]>(
      `SELECT "organizationId" FROM "User" WHERE id = $1`,
      collision.id
    );
    const organizationId = orgRows[0]?.organizationId;
    if (!organizationId) {
      throw new Error("organizationId missing on existing Rebecca row — cannot insert USR-101");
    }
    const id = `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, "userId", name, email, role, department, manager, "accessLevel", status, "lastLogin", "organizationId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      id,
      USR101.userId,
      USR101.name,
      USR101.email,
      USR101.role,
      USR101.department,
      USR101.manager,
      USR101.accessLevel,
      USR101.status,
      USR101.lastLogin,
      organizationId
    );
    console.log("inserted USR-101 as", id, "with PLACEHOLDER email", USR101.email);
  }

  const final = await prisma.user.findMany({
    where: {
      OR: [{ userId: "USR-060" }, { userId: "USR-101" }],
    },
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      role: true,
      department: true,
      manager: true,
      accessLevel: true,
      status: true,
      lastLogin: true,
    },
    orderBy: { userId: "asc" },
  });
  console.log("FINAL_ROWS");
  console.log(JSON.stringify(final, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
