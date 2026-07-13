import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";

const dir = path.join(process.cwd(), "prisma", "seed-data");
const seedCount = (file: string) =>
  (JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as unknown[]).length;

async function main() {
  const checks = [
    ["Releases", seedCount("releases.json"), await prisma.release.count(), await prisma.release.count({ where: { sourceOrder: { not: null } } })],
    ["Calendar", seedCount("calendar.json"), await prisma.calendarEvent.count(), await prisma.calendarEvent.count({ where: { sourceOrder: { not: null } } })],
    ["Env booking", seedCount("env_booking.json"), await prisma.envBooking.count(), await prisma.envBooking.count({ where: { sourceOrder: { not: null } } })],
    ["Environment Conflicts", seedCount("conflicts.json"), await prisma.environmentConflict.count(), await prisma.environmentConflict.count()],
    ["Risk", seedCount("risk.json"), await prisma.risk.count(), await prisma.risk.count({ where: { sourceOrder: { not: null } } })],
    ["Drift", seedCount("drift.json"), await prisma.drift.count(), await prisma.drift.count({ where: { sourceOrder: { not: null } } })],
    ["Dependencies", seedCount("dependencies.json"), await prisma.releaseDependency.count(), await prisma.releaseDependency.count({ where: { sourceOrder: { not: null } } })],
    ["Approvals", seedCount("approvals.json"), await prisma.approval.count(), await prisma.approval.count({ where: { sourceOrder: { not: null } } })],
    ["Leave Calendar", seedCount("leave_calendar.json"), await prisma.leaveRecord.count(), await prisma.leaveRecord.count({ where: { sourceOrder: { not: null } } })],
    ["Versions", seedCount("versions.json"), await prisma.environmentVersion.count(), await prisma.environmentVersion.count({ where: { sourceOrder: { not: null } } })],
    ["System Mapping / Core", seedCount("system-core.json"), await prisma.systemCoreRecord.count(), await prisma.systemCoreRecord.count()],
    ["System Mapping / Matrix", seedCount("system-matrix.json"), await prisma.systemMatrixRow.count(), await prisma.systemMatrixRow.count()],
    ["System Mapping / Flows", seedCount("integration-flows.json"), await prisma.integrationFlow.count(), await prisma.integrationFlow.count({ where: { sourceOrder: { not: null } } })],
    ["Monitoring Alerts", seedCount("monitoring-alerts.json"), await prisma.monitoringAlert.count(), await prisma.monitoringAlert.count({ where: { sourceOrder: { not: null } } })],
    ["Incidents", seedCount("incidents.json"), await prisma.incident.count(), await prisma.incident.count({ where: { sourceOrder: { not: null } } })],
    ["Application Status", seedCount("application-status.json"), await prisma.applicationStatus.count(), await prisma.applicationStatus.count({ where: { sourceOrder: { not: null } } })],
    ["Blockers", seedCount("blockers.json"), await prisma.blocker.count(), await prisma.blocker.count()],
    ["Planned Maintenance", seedCount("planned-maintenance.json"), await prisma.plannedMaintenance.count(), await prisma.plannedMaintenance.count({ where: { sourceOrder: { not: null } } })],
  ] as const;

  let failed = false;
  for (const [name, excel, database, ordered] of checks) {
    const ok = excel === database && database === ordered;
    failed ||= !ok;
    console.log(`${ok ? "MATCH" : "MISMATCH"} ${name}: Excel=${excel}, DB=${database}, ordered=${ordered}`);
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
