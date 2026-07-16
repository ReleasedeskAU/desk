import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<
    { tableName: string; columnName: string; nullable: string }[]
  >`
    SELECT
      table_name AS "tableName",
      column_name AS "columnName",
      is_nullable AS nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'Risk',
        'Drift',
        'Approval',
        'LeaveRecord',
        'LeaveRecordRelease',
        'EnvironmentVersion',
        'Environment',
        'EnvBooking',
        'Blocker',
        'RiskFactor',
        'Release'
      )
      AND column_name = 'organizationId'
    ORDER BY table_name
  `;
  console.log(rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
