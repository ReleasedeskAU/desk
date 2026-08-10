import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();
try {
  const status = await prisma.release.groupBy({
    by: ["status"],
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  const approval = await prisma.release.groupBy({
    by: ["approvalStatus"],
    _count: { _all: true },
    orderBy: { approvalStatus: "asc" },
  });
  const statusAudits = await prisma.releaseAuditEvent.count({
    where: { action: "status_migration" },
  });
  const approvalAudits = await prisma.releaseAuditEvent.count({
    where: { action: "approval_status_migration" },
  });
  const legacyStatus = await prisma.release.count({
    where: {
      status: {
        in: [
          "Approved",
          "Complete",
          "Completed",
          "In Progress",
          "Scheduled",
          "Planned",
          "Shipped",
          "At Risk",
        ],
      },
    },
  });
  const legacyApproval = await prisma.release.count({
    where: {
      approvalStatus: { in: ["Draft", "Planning", "Testing", "CAB Submitted"] },
    },
  });
  const total = await prisma.release.count();
  console.log(
    JSON.stringify(
      {
        total,
        status,
        approval,
        statusAudits,
        approvalAudits,
        legacyStatus,
        legacyApproval,
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
