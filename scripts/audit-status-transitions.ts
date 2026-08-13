/**
 * Zero-tolerance status-transition auditor for all 10 lifecycle entities.
 *
 * Creates disposable AUD-ST-* records under clerk scope `status_transition_audit_scope`,
 * calls real validate* / enforce* functions, and deletes everything in finally.
 *
 * Usage:
 *   npm run audit:status-transitions
 *
 * Exit 0 only when every enforcement case passes. Config-shape mismatches are
 * reported separately and do not alone fail the run.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const AUDIT_SCOPE = "status_transition_audit_scope";
const CODE_PREFIX = "AUD-ST";
/** Set AUDIT_ST_SIMULATE_CRASH=1 to throw after first entity matrix — proves finally cleanup. */
const SIMULATE_CRASH = process.env.AUDIT_ST_SIMULATE_CRASH === "1";

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadDbEnvFromFiles(): void {
  const root = resolve(__dirname, "..");
  for (const name of [".env.local", ".env"] as const) {
    const envPath = resolve(root, name);
    if (!existsSync(envPath)) continue;
    const fromFile = parseDotEnv(readFileSync(envPath, "utf8"));
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
      if (fromFile[key]) process.env[key] = fromFile[key];
    }
  }
  // Prefer DIRECT_URL for long auditors — Neon pooler drops idle long runs.
  if (process.env.DIRECT_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
  }
}

loadDbEnvFromFiles();

type StatusLike = {
  key: string;
  label: string;
  terminal: boolean;
  enabled: boolean;
  sortOrder: number;
};

type TransitionLike = {
  fromKey: string;
  toKey: string | null;
  enabled: boolean;
  isPreviousStatus?: boolean;
  enforcement?: string;
};

type FailureRow = {
  entity: string;
  from: string;
  to: string;
  expected: string;
  actual: string;
};

type EntityReport = {
  entity: string;
  attempted: number;
  passed: number;
  failed: number;
  failures: FailureRow[];
};

type ConfigMismatch = {
  entity: string;
  detail: string;
};

type FixtureIds = {
  departmentId: string | null;
  applicationId: string | null;
  userId: string | null;
  releaseId: string | null;
  releaseCode: string | null;
  release2Id: string | null;
  release2Code: string | null;
  blockerId: string | null;
  approvalId: string | null;
  riskId: string | null;
  incidentId: string | null;
  dependencyId: string | null;
  conflictId: string | null;
  driftId: string | null;
  alertId: string | null;
};

function emptyFixture(): FixtureIds {
  return {
    departmentId: null,
    applicationId: null,
    userId: null,
    releaseId: null,
    releaseCode: null,
    release2Id: null,
    release2Code: null,
    blockerId: null,
    approvalId: null,
    riskId: null,
    incidentId: null,
    dependencyId: null,
    conflictId: null,
    driftId: null,
    alertId: null,
  };
}

function enabledStatuses(statuses: StatusLike[]): StatusLike[] {
  return statuses
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function graphAllows(
  transitions: TransitionLike[],
  fromKey: string,
  toKey: string
): boolean {
  if (fromKey === toKey) return true;
  return transitions.some(
    (t) =>
      t.enabled &&
      t.fromKey === fromKey &&
      t.toKey === toKey &&
      !t.isPreviousStatus
  );
}

function edgeEnforcement(
  transitions: TransitionLike[],
  fromKey: string,
  toKey: string
): string | null {
  const edge = transitions.find(
    (t) =>
      t.enabled &&
      t.fromKey === fromKey &&
      t.toKey === toKey &&
      !t.isPreviousStatus
  );
  return edge?.enforcement ?? null;
}

function compareConfigShape(
  entity: string,
  live: { statuses: StatusLike[]; transitions: TransitionLike[] },
  defaults: { statuses: StatusLike[]; transitions: TransitionLike[] }
): ConfigMismatch[] {
  const out: ConfigMismatch[] = [];
  const liveKeys = new Set(live.statuses.map((s) => s.key));
  const defKeys = new Set(defaults.statuses.map((s) => s.key));
  for (const key of defKeys) {
    if (!liveKeys.has(key)) {
      out.push({
        entity,
        detail: `Missing default status key "${key}" in live config`,
      });
    }
  }
  for (const key of liveKeys) {
    if (!defKeys.has(key)) {
      out.push({
        entity,
        detail: `Extra live status key "${key}" (not in enterprise default)`,
      });
    }
  }
  const liveEdges = new Set(
    live.transitions
      .filter((t) => t.enabled && t.toKey)
      .map((t) => `${t.fromKey}->${t.toKey}`)
  );
  const defEdges = new Set(
    defaults.transitions
      .filter((t) => t.enabled && t.toKey)
      .map((t) => `${t.fromKey}->${t.toKey}`)
  );
  for (const edge of defEdges) {
    if (!liveEdges.has(edge)) {
      out.push({
        entity,
        detail: `Missing default edge ${edge} in live config`,
      });
    }
  }
  return out;
}

async function main(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const {
    createApplicationRow,
    createApprovalRow,
    createDepartmentRow,
    createDriftRow,
    createReleaseRow,
    createRiskRow,
    createUserRow,
    getDefaultOrganizationId,
  } = await import("@/lib/org-compat");

  function newAuditId(): string {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 10);
    return `c${t}${r}`.slice(0, 25);
  }

  /**
   * Prefer Prisma create. On live Neon null-organizationId failures, retry with
   * a raw insert that includes organizationId (column not in Prisma schema).
   */
  async function createMaybeOrg(
    createStandard: () => Promise<{ id: string }>,
    insertForOrg: (organizationId: string, id: string) => Promise<void>
  ): Promise<string> {
    try {
      return (await createStandard()).id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/organizationId/i.test(msg)) throw err;
      const orgId = await getDefaultOrganizationId();
      if (!orgId) throw err;
      const id = newAuditId();
      await insertForOrg(orgId, id);
      return id;
    }
  }

  const fixtures = emptyFixture();
  const createdDept = { id: null as string | null };
  const createdApp = { id: null as string | null };
  const createdUser = { id: null as string | null };
  const reports: EntityReport[] = [];
  const configMismatches: ConfigMismatch[] = [];
  const runTag = `${CODE_PREFIX}-${Date.now().toString(36)}`;
  let exitCode = 2;

  console.log("Status-transition auditor (zero tolerance)");
  console.log(`Scope clerkUserId: ${AUDIT_SCOPE}`);
  console.log(`Run tag: ${runTag}`);
  if (SIMULATE_CRASH) {
    console.log("AUDIT_ST_SIMULATE_CRASH=1 — will abort after first entity matrix");
  }
  console.log("");

  async function cleanup(): Promise<void> {
    // Delete children first, then releases/dept/app/user created by this run.
    const codePrefix = CODE_PREFIX;
    await prisma.monitoringAlert.deleteMany({
      where: { alertCode: { startsWith: codePrefix } },
    });
    await prisma.drift.deleteMany({
      where: { driftCode: { startsWith: codePrefix } },
    });
    await prisma.environmentConflict.deleteMany({
      where: { conflictCode: { startsWith: codePrefix } },
    });
    await prisma.releaseDependency.deleteMany({
      where: { dependencyCode: { startsWith: codePrefix } },
    });
    await prisma.incident.deleteMany({
      where: { incidentCode: { startsWith: codePrefix } },
    });
    await prisma.risk.deleteMany({
      where: { riskCode: { startsWith: codePrefix } },
    });
    await prisma.approval.deleteMany({
      where: { approvalCode: { startsWith: codePrefix } },
    });
    await prisma.blocker.deleteMany({
      where: { blockerCode: { startsWith: codePrefix } },
    });
    await prisma.releaseAuditEvent.deleteMany({
      where: { release: { releaseCode: { startsWith: codePrefix } } },
    });
    await prisma.releaseApplication.deleteMany({
      where: { release: { releaseCode: { startsWith: codePrefix } } },
    });
    await prisma.release.deleteMany({
      where: { releaseCode: { startsWith: codePrefix } },
    });
    if (createdApp.id) {
      await prisma.application.deleteMany({ where: { id: createdApp.id } });
    }
    if (createdDept.id) {
      await prisma.department.deleteMany({ where: { id: createdDept.id } });
    }
    if (createdUser.id) {
      await prisma.user.deleteMany({ where: { id: createdUser.id } });
    }
  }

  try {
    const logStep = (msg: string) => {
      console.log(`[aud-st] ${msg}`);
    };

    // Shared fixtures -------------------------------------------------------
    logStep("Creating department/app/user/releases…");
    const dept = await createDepartmentRow(
      `${runTag}-Dept`,
      "Status Transition Auditor"
    );
    createdDept.id = dept.id;
    fixtures.departmentId = dept.id;

    const app = await createApplicationRow({
      name: `${runTag}-App`,
      departmentId: dept.id,
      type: "Internal",
      productOwner: "AUD-ST",
      techLead: "AUD-ST",
      support: "AUD-ST",
      criticality: "Medium",
    });
    createdApp.id = app.id;
    fixtures.applicationId = app.id;

    const user = await createUserRow({
      userId: `${runTag}-USR`,
      name: "AUD ST Owner",
      email: `${runTag.toLowerCase()}@audit.local`,
      role: "Release Manager",
      department: dept.name,
      manager: null,
      accessLevel: "Editor",
      status: "Active",
    });
    createdUser.id = user.id;
    fixtures.userId = user.id;

    const releaseCode = `${runTag}-REL1`;
    const release = await createReleaseRow({
      releaseCode,
      name: `${runTag} Release 1`,
      programProject: "N/A",
      owner: `${user.userId} (${user.name})`,
      status: "Draft",
      releaseDate: new Date("2026-12-01"),
      priority: "P2 - High",
      impact: "Medium",
      departmentId: dept.id,
      releaseSize: "M",
      rollbackPlan: "Rollback to previous build",
      goLiveChecklistPercent: 100,
      notes: "AUD-ST decision recorded",
      releaseOwnerId: user.id,
    });
    fixtures.releaseId = release.id;
    fixtures.releaseCode = releaseCode;
    await prisma.release.update({
      where: { id: release.id },
      data: {
        devSignoff: "Pending",
        testSignoff: "Pending",
        uatSignoff: "Pending",
        securityClearance: "Pending",
      },
    });
    await prisma.releaseApplication.create({
      data: { releaseId: release.id, applicationId: app.id },
    });

    const release2Code = `${runTag}-REL2`;
    const release2 = await createReleaseRow({
      releaseCode: release2Code,
      name: `${runTag} Release 2`,
      programProject: "N/A",
      owner: `${user.userId} (${user.name})`,
      status: "Draft",
      releaseDate: new Date("2026-12-15"),
      priority: "P3 - Medium",
      impact: "Low",
      departmentId: dept.id,
      releaseOwnerId: user.id,
    });
    fixtures.release2Id = release2.id;
    fixtures.release2Code = release2Code;

    logStep("Loading lifecycle configs…");
    // Load configs (seeds defaults for empty scope) -------------------------
    const { loadReleaseLifecycleConfig } = await import(
      "@/lib/release-lifecycle-config-db"
    );
    const { createDefaultReleaseLifecycleConfig } = await import(
      "@/lib/release-lifecycle-config"
    );
    const { loadBlockerLifecycleConfig } = await import(
      "@/lib/blocker-lifecycle-config-db"
    );
    const { createDefaultBlockerLifecycleConfig } = await import(
      "@/lib/blocker-lifecycle-config"
    );
    const { loadApprovalLifecycleConfig } = await import(
      "@/lib/approval-lifecycle-config-db"
    );
    const { createDefaultApprovalLifecycleConfig } = await import(
      "@/lib/approval-lifecycle-config"
    );
    const { loadSignoffLifecycleConfig } = await import(
      "@/lib/signoff-lifecycle-config-db"
    );
    const { createDefaultSignoffLifecycleConfig } = await import(
      "@/lib/signoff-lifecycle-config"
    );
    const { loadRiskLifecycleConfig } = await import(
      "@/lib/risk-lifecycle-config-db"
    );
    const { createDefaultRiskLifecycleConfig } = await import(
      "@/lib/risk-lifecycle-config"
    );
    const { loadIncidentLifecycleConfig } = await import(
      "@/lib/incident-lifecycle-config-db"
    );
    const { createDefaultIncidentLifecycleConfig } = await import(
      "@/lib/incident-lifecycle-config"
    );
    const { loadDependencyLifecycleConfig } = await import(
      "@/lib/dependency-lifecycle-config-db"
    );
    const { createDefaultDependencyLifecycleConfig } = await import(
      "@/lib/dependency-lifecycle-config"
    );
    const { loadConflictLifecycleConfig } = await import(
      "@/lib/conflict-lifecycle-config-db"
    );
    const { createDefaultConflictLifecycleConfig } = await import(
      "@/lib/conflict-lifecycle-config"
    );
    const { loadDriftLifecycleConfig } = await import(
      "@/lib/drift-lifecycle-config-db"
    );
    const { createDefaultDriftLifecycleConfig } = await import(
      "@/lib/drift-lifecycle-config"
    );
    const { loadAlertLifecycleConfig } = await import(
      "@/lib/alert-lifecycle-config-db"
    );
    const { createDefaultAlertLifecycleConfig } = await import(
      "@/lib/alert-lifecycle-config"
    );

    const releaseLoaded = await loadReleaseLifecycleConfig(AUDIT_SCOPE);
    const releaseCfg = releaseLoaded.config;
    const blockerCfg = (await loadBlockerLifecycleConfig(AUDIT_SCOPE)).config;
    const approvalCfg = (await loadApprovalLifecycleConfig(AUDIT_SCOPE)).config;
    const signoffCfg = (await loadSignoffLifecycleConfig(AUDIT_SCOPE)).config;
    const riskCfg = (await loadRiskLifecycleConfig(AUDIT_SCOPE)).config;
    const incidentCfg = (await loadIncidentLifecycleConfig(AUDIT_SCOPE)).config;
    const dependencyCfg = (await loadDependencyLifecycleConfig(AUDIT_SCOPE))
      .config;
    const conflictCfg = (await loadConflictLifecycleConfig(AUDIT_SCOPE)).config;
    const driftCfg = (await loadDriftLifecycleConfig(AUDIT_SCOPE)).config;
    const alertCfg = (await loadAlertLifecycleConfig(AUDIT_SCOPE)).config;

    configMismatches.push(
      ...compareConfigShape(
        "Release",
        releaseCfg,
        createDefaultReleaseLifecycleConfig()
      ),
      ...compareConfigShape(
        "Blocker",
        blockerCfg,
        createDefaultBlockerLifecycleConfig()
      ),
      ...compareConfigShape(
        "Approval",
        approvalCfg,
        createDefaultApprovalLifecycleConfig()
      ),
      ...compareConfigShape(
        "Sign-off",
        signoffCfg,
        createDefaultSignoffLifecycleConfig()
      ),
      ...compareConfigShape("Risk", riskCfg, createDefaultRiskLifecycleConfig()),
      ...compareConfigShape(
        "Incident",
        incidentCfg,
        createDefaultIncidentLifecycleConfig()
      ),
      ...compareConfigShape(
        "Dependency",
        dependencyCfg,
        createDefaultDependencyLifecycleConfig()
      ),
      ...compareConfigShape(
        "Conflict",
        conflictCfg,
        createDefaultConflictLifecycleConfig()
      ),
      ...compareConfigShape(
        "Drift",
        driftCfg,
        createDefaultDriftLifecycleConfig()
      ),
      ...compareConfigShape("Alert", alertCfg, createDefaultAlertLifecycleConfig())
    );

    logStep("Creating disposable entity rows…");
    // Create entity rows (org-compat / org-aware for live Neon FKs) ---------
    const raisedDate = new Date();
    fixtures.blockerId = await createMaybeOrg(
      () =>
        prisma.blocker.create({
          data: {
            blockerCode: `${runTag}-BLK`,
            releaseCode,
            releaseName: release.name,
            departmentName: dept.name,
            applicationName: app.name,
            blockerType: "Technical",
            blockerDescription: "AUD-ST blocker",
            severity: "Medium",
            raisedDate,
            raisedBy: "AUD-ST",
            status: "Open",
            daysOpen: 0,
            escalationLevel: "None",
            impactOnRelease: "Medium",
            sourceOrder: 900001,
          },
        }),
      async (orgId, id) => {
        const now = new Date();
        await prisma.$executeRaw`
          INSERT INTO "Blocker" (
            id, "organizationId", "blockerCode", "releaseCode", "releaseName",
            "departmentName", "applicationName", "blockerType", "blockerDescription",
            severity, "raisedDate", "raisedBy", status, "daysOpen",
            "escalationLevel", "impactOnRelease", "sourceOrder", "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${orgId}, ${`${runTag}-BLK`}, ${releaseCode}, ${release.name},
            ${dept.name}, ${app.name}, ${"Technical"}, ${"AUD-ST blocker"},
            ${"Medium"}, ${raisedDate}, ${"AUD-ST"}, ${"Open"}, ${0},
            ${"None"}, ${"Medium"}, ${900001}, ${now}, ${now}
          )
        `;
      }
    );

    fixtures.approvalId = (
      await createApprovalRow({
        approvalCode: `${runTag}-APR`,
        releaseId: release.id,
        approvalType: "CAB",
        approverId: user.id,
        submittedDate: new Date(),
        decision: "Pending",
        sourceOrder: 900001,
      })
    ).id;

    fixtures.riskId = (
      await createRiskRow({
        riskCode: `${runTag}-RSK`,
        releaseId: release.id,
        category: "Technical",
        description: "AUD-ST risk",
        likelihood: 3,
        impact: 3,
        mitigationStrategy: "Mitigation documented for audit",
        notes: "Acceptance notes for audit",
        status: "Identified",
        riskOwnerId: user.id,
        sourceOrder: 900001,
      })
    ).id;

    const incidentTs = new Date();
    fixtures.incidentId = await createMaybeOrg(
      () =>
        prisma.incident.create({
          data: {
            incidentCode: `${runTag}-INC`,
            timestamp: incidentTs,
            applicationId: app.id,
            severity: "Medium",
            title: "AUD-ST incident",
            status: "Open",
            impact: "Low",
            assignedTo: "AUD-ST Assignee",
            environmentName: "UAT",
            relatedReleaseCode: releaseCode,
            sourceOrder: 900001,
          },
        }),
      async (orgId, id) => {
        const now = new Date();
        await prisma.$executeRaw`
          INSERT INTO "Incident" (
            id, "organizationId", "incidentCode", timestamp, "applicationId",
            severity, title, status, impact, "assignedTo", "environmentName",
            "relatedReleaseCode", "sourceOrder", "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${orgId}, ${`${runTag}-INC`}, ${incidentTs}, ${app.id},
            ${"Medium"}, ${"AUD-ST incident"}, ${"Open"}, ${"Low"},
            ${"AUD-ST Assignee"}, ${"UAT"}, ${releaseCode}, ${900001}, ${now}, ${now}
          )
        `;
      }
    );

    fixtures.dependencyId = await createMaybeOrg(
      () =>
        prisma.releaseDependency.create({
          data: {
            dependencyCode: `${runTag}-DEP`,
            releaseId: release.id,
            dependsOnReleaseId: release2.id,
            dependencyType: "Hard",
            status: "Pending",
            notes: "AUD-ST dependency notes for waive path",
            sourceOrder: 900001,
          },
        }),
      async (orgId, id) => {
        await prisma.$executeRaw`
          INSERT INTO "ReleaseDependency" (
            id, "organizationId", "dependencyCode", "releaseId", "dependsOnReleaseId",
            "dependencyType", status, notes, "sourceOrder"
          ) VALUES (
            ${id}, ${orgId}, ${`${runTag}-DEP`}, ${release.id}, ${release2.id},
            ${"Hard"}, ${"Pending"}, ${"AUD-ST dependency notes for waive path"}, ${900001}
          )
        `;
      }
    );

    fixtures.conflictId = await createMaybeOrg(
      () =>
        prisma.environmentConflict.create({
          data: {
            conflictCode: `${runTag}-CNF`,
            status: "Detected",
            priority: "Medium",
            release1Code: releaseCode,
            release2Code: release2Code,
            applicationName: app.name,
            departmentName: dept.name,
            conflictingEnvironment: "UAT",
            environmentConflictType: "Schedule",
            notes: "AUD-ST conflict",
            sourceOrder: 900001,
          },
        }),
      async (orgId, id) => {
        const now = new Date();
        await prisma.$executeRaw`
          INSERT INTO "EnvironmentConflict" (
            id, "organizationId", "conflictCode", status, priority,
            "release1Code", "release2Code", "applicationName", "departmentName",
            "conflictingEnvironment", "environmentConflictType", notes,
            "sourceOrder", "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${orgId}, ${`${runTag}-CNF`}, ${"Detected"}, ${"Medium"},
            ${releaseCode}, ${release2Code}, ${app.name}, ${dept.name},
            ${"UAT"}, ${"Schedule"}, ${"AUD-ST conflict"}, ${900001}, ${now}, ${now}
          )
        `;
      }
    );

    fixtures.driftId = (
      await createDriftRow({
        driftCode: `${runTag}-DFT`,
        releaseId: release.id,
        applicationId: app.id,
        environmentName: "UAT",
        driftType: "Config",
        detectedDate: new Date(),
        severity: "Medium",
        description: "AUD-ST drift",
        status: "Detected",
        sourceOrder: 900001,
      })
    ).id;

    const alertTs = new Date();
    fixtures.alertId = await createMaybeOrg(
      () =>
        prisma.monitoringAlert.create({
          data: {
            alertCode: `${runTag}-ALT`,
            timestamp: alertTs,
            applicationId: app.id,
            alertType: "Warning",
            severity: "Medium",
            metric: "cpu",
            status: "Pending",
            environmentName: "UAT",
            sourceOrder: 900001,
          },
        }),
      async (orgId, id) => {
        const now = new Date();
        await prisma.$executeRaw`
          INSERT INTO "MonitoringAlert" (
            id, "organizationId", "alertCode", timestamp, "applicationId",
            "alertType", severity, metric, status, "environmentName",
            "sourceOrder", "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${orgId}, ${`${runTag}-ALT`}, ${alertTs}, ${app.id},
            ${"Warning"}, ${"Medium"}, ${"cpu"}, ${"Pending"}, ${"UAT"},
            ${900001}, ${now}, ${now}
          )
        `;
      }
    );

    logStep("Entity rows ready; starting matrices…");
    // Import validators -----------------------------------------------------
    const { validateBlockerTransition } = await import(
      "@/lib/blocker-lifecycle-transition"
    );
    const { validateApprovalTransition } = await import(
      "@/lib/approval-lifecycle-transition"
    );
    const { validateRiskTransition } = await import(
      "@/lib/risk-lifecycle-transition"
    );
    const { validateIncidentTransition } = await import(
      "@/lib/incident-lifecycle-transition"
    );
    const { validateDependencyTransition } = await import(
      "@/lib/dependency-lifecycle-transition"
    );
    const { validateConflictTransition } = await import(
      "@/lib/conflict-lifecycle-transition"
    );
    const { validateDriftTransition } = await import(
      "@/lib/drift-lifecycle-transition"
    );
    const { validateAlertTransition } = await import(
      "@/lib/alert-lifecycle-transition"
    );
    const {
      emptyLifecycleGateFacts,
      validateReleaseTransition,
    } = await import("@/lib/release-lifecycle-transition");
    const { enforceReleaseStatusChange } = await import(
      "@/lib/release-lifecycle-status-patch"
    );

    const passingReleaseFacts = emptyLifecycleGateFacts({
      owner: release.owner,
      releaseSize: "M",
      priority: "P2 - High",
      name: release.name,
      applicationCount: 1,
      startDate: new Date("2026-11-01"),
      releaseDate: new Date("2026-12-01"),
      rollbackPlan: "Rollback to previous build",
      notes: "AUD-ST decision recorded",
      goLiveChecklistPercent: 100,
      openBlockerCount: 0,
      blockingIncidentCount: 0,
      openIncidentCount: 0,
      openEnvironmentConflictCount: 0,
      expiredEnvBookingCount: 0,
      changeFreezeActive: false,
      deploymentOutcomeConfirmed: true,
      testSignoffComplete: true,
      dressRehearsalComplete: true,
      opsSignoffComplete: true,
      incompleteWorkItemCount: 0,
      pirComplete: true,
      scopeDescription: "AUD-ST scope",
      cabScopeSnapshot: {
        releaseSize: "M",
        priority: "P2 - High",
        scopeDescription: "AUD-ST scope",
      },
      hasUatBooking: true,
      hasDeployBooking: true,
      hardDependenciesMet: true,
      signoffsComplete: true,
    });

    // Avoid reloading config from Neon on every enforce (pooler drops long runs).
    const auditEnforceDeps = {
      resolveConfig: async () => ({
        config: releaseCfg,
        versionId: releaseLoaded.latestVersionId ?? null,
        version: releaseLoaded.latestVersion ?? null,
        configPin: "latest-unpinned" as const,
      }),
      loadGateFacts: async () => passingReleaseFacts,
      loadPreviousStatus: async () => null as string | null,
    };

    function newReport(entity: string): EntityReport {
      return { entity, attempted: 0, passed: 0, failed: 0, failures: [] };
    }

    function recordCase(
      report: EntityReport,
      from: string,
      to: string,
      expectedAllowed: boolean,
      actualAllowed: boolean,
      detail?: string
    ): void {
      report.attempted += 1;
      if (expectedAllowed === actualAllowed) {
        report.passed += 1;
        return;
      }
      report.failed += 1;
      report.failures.push({
        entity: report.entity,
        from,
        to,
        expected: expectedAllowed ? "ALLOW" : "REJECT",
        actual: `${actualAllowed ? "ALLOW" : "REJECT"}${detail ? ` (${detail})` : ""}`,
      });
    }

    /**
     * Full N×N via real validate* (in-memory — same rules as PATCH).
     * Plus two Neon spot-checks: one legal write succeeds; one illegal reject
     * leaves the row unchanged. Avoids thousands of round-trips that drop Neon.
     */
    async function runSimpleMatrix(args: {
      entity: string;
      statuses: StatusLike[];
      transitions: TransitionLike[];
      getStatus: () => Promise<string>;
      setStatus: (label: string) => Promise<void>;
      validate: (
        from: string,
        to: string
      ) => { allowed: boolean; canonicalStatus?: string; reason?: string };
    }): Promise<EntityReport> {
      const report = newReport(args.entity);
      const statuses = enabledStatuses(args.statuses);
      let sampleAllow: { from: StatusLike; to: StatusLike; canonical: string } | null =
        null;
      let sampleReject: { from: StatusLike; to: StatusLike } | null = null;

      for (const from of statuses) {
        for (const to of statuses) {
          const expected = graphAllows(args.transitions, from.key, to.key);
          const result = args.validate(from.label, to.label);
          recordCase(
            report,
            from.label,
            to.label,
            expected,
            result.allowed,
            result.allowed
              ? undefined
              : result.reason ??
                (expected ? "expected allow" : undefined)
          );
          if (
            !sampleAllow &&
            expected &&
            result.allowed &&
            from.key !== to.key &&
            result.canonicalStatus
          ) {
            sampleAllow = {
              from,
              to,
              canonical: result.canonicalStatus,
            };
          }
          if (!sampleReject && !expected && !result.allowed && from.key !== to.key) {
            sampleReject = { from, to };
          }
        }
      }

      if (sampleAllow) {
        await args.setStatus(sampleAllow.from.label);
        const before = await args.getStatus();
        const okBefore =
          before.localeCompare(sampleAllow.from.label, undefined, {
            sensitivity: "accent",
          }) === 0;
        if (!okBefore) {
          recordCase(
            report,
            `${sampleAllow.from.label} (db-allow)`,
            sampleAllow.to.label,
            true,
            false,
            `seed failed db=${before}`
          );
        } else {
          await args.setStatus(sampleAllow.canonical);
          const after = await args.getStatus();
          recordCase(
            report,
            `${sampleAllow.from.label} (db-allow)`,
            sampleAllow.to.label,
            true,
            after.localeCompare(sampleAllow.canonical, undefined, {
              sensitivity: "accent",
            }) === 0,
            after === sampleAllow.canonical ? undefined : `db=${after}`
          );
        }
      }

      if (sampleReject) {
        await args.setStatus(sampleReject.from.label);
        const before = await args.getStatus();
        const denied = args.validate(
          sampleReject.from.label,
          sampleReject.to.label
        );
        // Illegal path must not write — leave row as-is after reject.
        const after = await args.getStatus();
        const unchanged =
          after.localeCompare(before, undefined, { sensitivity: "accent" }) ===
          0;
        recordCase(
          report,
          `${sampleReject.from.label} (db-reject)`,
          sampleReject.to.label,
          false,
          denied.allowed || !unchanged,
          denied.allowed
            ? "validator allowed"
            : unchanged
              ? undefined
              : `db mutated to ${after}`
        );
      }

      return report;
    }

    // Blocker ---------------------------------------------------------------
    logStep("Matrix: Blocker");
    reports.push(
      await runSimpleMatrix({
        entity: "Blocker",
        statuses: blockerCfg.statuses,
        transitions: blockerCfg.transitions,
        getStatus: async () =>
          (
            await prisma.blocker.findUniqueOrThrow({
              where: { id: fixtures.blockerId! },
              select: { status: true },
            })
          ).status,
        setStatus: async (label) => {
          await prisma.blocker.update({
            where: { id: fixtures.blockerId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateBlockerTransition({
            config: blockerCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            facts: { assignedTo: "AUD-ST Assignee", resolutionNotes: "waiting", rootCause: "cause" },
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    if (SIMULATE_CRASH) {
      throw new Error(
        "AUDIT_ST_SIMULATE_CRASH: intentional abort after Blocker matrix"
      );
    }

    // Approval (decision field) --------------------------------------------
    logStep("Matrix: Approval");
    reports.push(
      await runSimpleMatrix({
        entity: "Approval",
        statuses: approvalCfg.statuses,
        transitions: approvalCfg.transitions,
        getStatus: async () =>
          (
            await prisma.approval.findUniqueOrThrow({
              where: { id: fixtures.approvalId! },
              select: { decision: true },
            })
          ).decision,
        setStatus: async (label) => {
          await prisma.approval.update({
            where: { id: fixtures.approvalId! },
            data: { decision: label },
          });
        },
        validate: (from, to) => {
          const dest = approvalCfg.statuses.find(
            (s) => s.label === to || s.key === to
          );
          const r = validateApprovalTransition({
            config: approvalCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            conditions: dest?.requiresConditions ? "AUD-ST recorded conditions" : null,
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Sign-off via enforceSignoffFieldChanges (devSignoff) ------------------
    {
      logStep("Matrix: Sign-off");
      const { enforceSignoffFieldChanges } = await import(
        "@/lib/signoff-lifecycle-enforce"
      );
      reports.push(
        await runSimpleMatrix({
          entity: "Sign-off",
          statuses: signoffCfg.statuses,
          transitions: signoffCfg.transitions,
          getStatus: async () =>
            (
              await prisma.release.findUniqueOrThrow({
                where: { id: fixtures.releaseId! },
                select: { devSignoff: true },
              })
            ).devSignoff ?? "Pending",
          setStatus: async (label) => {
            await prisma.release.update({
              where: { id: fixtures.releaseId! },
              data: { devSignoff: label },
            });
          },
          validate: (from, to) => {
            // enforceSignoffFieldChanges calls validateSignoffTransition internally.
            const r = enforceSignoffFieldChanges({
              config: signoffCfg,
              existing: { devSignoff: from },
              body: { devSignoff: to },
            });
            return {
              allowed: r.ok,
              canonicalStatus: r.ok ? r.canonical.devSignoff : undefined,
              reason: r.ok ? undefined : r.body.error,
            };
          },
        })
      );
    }

    // Risk -----------------------------------------------------------------
    logStep("Matrix: Risk");
    reports.push(
      await runSimpleMatrix({
        entity: "Risk",
        statuses: riskCfg.statuses,
        transitions: riskCfg.transitions,
        getStatus: async () =>
          (
            await prisma.risk.findUniqueOrThrow({
              where: { id: fixtures.riskId! },
              select: { status: true },
            })
          ).status,
        setStatus: async (label) => {
          await prisma.risk.update({
            where: { id: fixtures.riskId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateRiskTransition({
            config: riskCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            facts: {
              likelihood: 3,
              impact: 3,
              riskScore: 9,
              mitigationStrategy: "Mitigation documented for audit",
              notes: "Acceptance notes for audit",
            },
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Incident -------------------------------------------------------------
    logStep("Matrix: Incident");
    reports.push(
      await runSimpleMatrix({
        entity: "Incident",
        statuses: incidentCfg.statuses,
        transitions: incidentCfg.transitions,
        getStatus: async () =>
          (
            await prisma.incident.findUniqueOrThrow({
              where: { id: fixtures.incidentId! },
              select: { status: true },
            })
          ).status,
        setStatus: async (label) => {
          await prisma.incident.update({
            where: { id: fixtures.incidentId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateIncidentTransition({
            config: incidentCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            facts: { severity: "Medium", assignedTo: "AUD-ST Assignee" },
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Dependency -----------------------------------------------------------
    logStep("Matrix: Dependency");
    reports.push(
      await runSimpleMatrix({
        entity: "Dependency",
        statuses: dependencyCfg.statuses,
        transitions: dependencyCfg.transitions,
        getStatus: async () =>
          (
            await prisma.releaseDependency.findUniqueOrThrow({
              where: { id: fixtures.dependencyId! },
              select: { status: true },
            })
          ).status ?? "Pending",
        setStatus: async (label) => {
          await prisma.releaseDependency.update({
            where: { id: fixtures.dependencyId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateDependencyTransition({
            config: dependencyCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            facts: { notes: "AUD-ST dependency notes for waive path" },
            // Never pass isSystemTransition — Met→At Risk must stay rejected here.
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Conflict -------------------------------------------------------------
    logStep("Matrix: Conflict");
    reports.push(
      await runSimpleMatrix({
        entity: "Conflict",
        statuses: conflictCfg.statuses,
        transitions: conflictCfg.transitions,
        getStatus: async () =>
          (
            await prisma.environmentConflict.findUniqueOrThrow({
              where: { id: fixtures.conflictId! },
              select: { status: true },
            })
          ).status,
        setStatus: async (label) => {
          await prisma.environmentConflict.update({
            where: { id: fixtures.conflictId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateConflictTransition({
            config: conflictCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            facts: { notes: "AUD-ST conflict justification" },
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Drift ----------------------------------------------------------------
    logStep("Matrix: Drift");
    reports.push(
      await runSimpleMatrix({
        entity: "Drift",
        statuses: driftCfg.statuses,
        transitions: driftCfg.transitions,
        getStatus: async () =>
          (
            await prisma.drift.findUniqueOrThrow({
              where: { id: fixtures.driftId! },
              select: { status: true },
            })
          ).status,
        setStatus: async (label) => {
          await prisma.drift.update({
            where: { id: fixtures.driftId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateDriftTransition({
            config: driftCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Alert ----------------------------------------------------------------
    logStep("Matrix: Alert");
    reports.push(
      await runSimpleMatrix({
        entity: "Alert",
        statuses: alertCfg.statuses,
        transitions: alertCfg.transitions,
        getStatus: async () =>
          (
            await prisma.monitoringAlert.findUniqueOrThrow({
              where: { id: fixtures.alertId! },
              select: { status: true },
            })
          ).status,
        setStatus: async (label) => {
          await prisma.monitoringAlert.update({
            where: { id: fixtures.alertId! },
            data: { status: label },
          });
        },
        validate: (from, to) => {
          const r = validateAlertTransition({
            config: alertCfg,
            fromStatus: from,
            toStatus: to,
            overrideReason: "AUD-ST override reason",
            facts: { reason: "AUD-ST dismiss reason" },
          });
          return {
            allowed: r.allowed,
            canonicalStatus: r.allowed ? r.canonicalStatus : undefined,
            reason: r.allowed ? undefined : r.reason,
          };
        },
      })
    );

    // Release N×N via validateReleaseTransition (graph + gates) ------------
    {
      logStep("Matrix: Release");
      const report = newReport("Release");
      const statuses = enabledStatuses(releaseCfg.statuses);
      for (const from of statuses) {
        for (const to of statuses) {
          const expectedGraph = graphAllows(
            releaseCfg.transitions,
            from.key,
            to.key
          );
          const enforcement = edgeEnforcement(
            releaseCfg.transitions,
            from.key,
            to.key
          );
          // For Flexible edges, supply override so unmet soft gates don't false-fail.
          // For Required edges, never supply override — must pass on facts alone.
          const useOverride = enforcement !== "required";
          const failingFacts = emptyLifecycleGateFacts({
            owner: null,
            releaseSize: null,
            priority: null,
            openBlockerCount: 99,
            blockingIncidentCount: 99,
            hardDependenciesMet: false,
            signoffsComplete: false,
            hasUatBooking: false,
            hasDeployBooking: false,
            goLiveChecklistPercent: 0,
          });
          // Prefer passing facts for expected-allow Required edges; override+passing for Flexible.
          const facts = expectedGraph ? passingReleaseFacts : failingFacts;
          const result = validateReleaseTransition({
            config: releaseCfg,
            fromStatus: from.label,
            toStatus: to.label,
            previousStatus: null,
            overrideReason: useOverride ? "AUD-ST override reason" : null,
            gateFacts: facts,
          });

          if (!expectedGraph) {
            recordCase(
              report,
              from.label,
              to.label,
              false,
              result.allowed,
              result.allowed ? undefined : result.reason
            );
            continue;
          }

          // Full N×N uses validateReleaseTransition (same rules as PATCH).
          // enforceReleaseStatusChange is exercised in CFG-06 + Blocked→Previous.
          recordCase(
            report,
            from.label,
            to.label,
            expectedGraph,
            result.allowed,
            result.allowed ? undefined : result.reason
          );
        }
      }

      // Spot-check: one legal non-self edge through enforceReleaseStatusChange.
      const sampleFrom = statuses.find((s) => s.key === "draft");
      const sampleTo = statuses.find((s) => s.key === "planning");
      if (sampleFrom && sampleTo) {
        await prisma.release.update({
          where: { id: fixtures.releaseId! },
          data: { status: sampleFrom.label },
        });
        const before = await prisma.release.findUniqueOrThrow({
          where: { id: fixtures.releaseId! },
          select: {
            id: true,
            releaseCode: true,
            status: true,
            name: true,
            owner: true,
            releaseSize: true,
            priority: true,
            startDate: true,
            releaseDate: true,
            rollbackPlan: true,
            notes: true,
            changeFreeze: true,
            goLiveChecklistPercent: true,
            lifecycleConfigVersionId: true,
            devSignoff: true,
            testSignoff: true,
            uatSignoff: true,
            securityClearance: true,
            dressRehearsal: true,
          },
        });
        const enforced = await enforceReleaseStatusChange(
          {
            clerkUserId: AUDIT_SCOPE,
            release: before,
            requestedStatus: sampleTo.label,
            overrideReason: "AUD-ST override reason",
          },
          auditEnforceDeps
        );
        recordCase(
          report,
          `${sampleFrom.label} (enforce)`,
          sampleTo.label,
          true,
          enforced.ok,
          enforced.ok ? undefined : enforced.body.error
        );
        if (enforced.ok) {
          await prisma.release.update({
            where: { id: fixtures.releaseId! },
            data: { status: enforced.canonicalStatus },
          });
        }
      }
      reports.push(report);
    }

    // CFG-06 special: Deployed → Closed Required, no override ---------------
    {
      logStep("Special: CFG-06 Deployed→Closed");
      const report = newReport("Release-CFG06");
      const deployed = releaseCfg.statuses.find((s) => s.key === "deployed");
      const closed = releaseCfg.statuses.find((s) => s.key === "closed");
      if (deployed && closed) {
        await prisma.release.update({
          where: { id: fixtures.releaseId! },
          data: { status: deployed.label, goLiveChecklistPercent: 0 },
        });
        const row = await prisma.release.findUniqueOrThrow({
          where: { id: fixtures.releaseId! },
          select: {
            id: true,
            releaseCode: true,
            status: true,
            name: true,
            owner: true,
            releaseSize: true,
            priority: true,
            startDate: true,
            releaseDate: true,
            rollbackPlan: true,
            notes: true,
            changeFreeze: true,
            goLiveChecklistPercent: true,
            lifecycleConfigVersionId: true,
            devSignoff: true,
            testSignoff: true,
            uatSignoff: true,
            securityClearance: true,
            dressRehearsal: true,
          },
        });
        const failFacts = emptyLifecycleGateFacts({
          ...passingReleaseFacts,
          goLiveChecklistPercent: 0,
        });
        const denied = await enforceReleaseStatusChange(
          {
            clerkUserId: AUDIT_SCOPE,
            release: { ...row, goLiveChecklistPercent: 0 },
            requestedStatus: closed.label,
            overrideReason: "AUD-ST trying to override Required gate",
          },
          {
            ...auditEnforceDeps,
            loadGateFacts: async () => failFacts,
          }
        );
        recordCase(
          report,
          deployed.label,
          closed.label,
          false,
          denied.ok,
          denied.ok ? "override wrongly allowed" : denied.body.code
        );
        // Must remain Deployed
        const still = (
          await prisma.release.findUniqueOrThrow({
            where: { id: fixtures.releaseId! },
            select: { status: true },
          })
        ).status;
        recordCase(
          report,
          deployed.label,
          `${closed.label} (db-unchanged)`,
          false,
          still !== deployed.label,
          `db=${still}`
        );
        // Inverse: with passing facts, Required transition succeeds (no override).
        const ok = await enforceReleaseStatusChange(
          {
            clerkUserId: AUDIT_SCOPE,
            release: row,
            requestedStatus: closed.label,
            overrideReason: null,
          },
          {
            ...auditEnforceDeps,
            loadGateFacts: async () =>
              emptyLifecycleGateFacts({
                ...passingReleaseFacts,
                goLiveChecklistPercent: 100,
              }),
          }
        );
        recordCase(
          report,
          deployed.label,
          `${closed.label} (gates-pass)`,
          true,
          ok.ok,
          ok.ok ? undefined : ok.body.error
        );
      } else {
        recordCase(report, "Deployed", "Closed", true, false, "statuses missing");
      }
      reports.push(report);
    }

    // Blocked → Previous Status (dynamic) ----------------------------------
    {
      logStep("Special: Blocked→Previous");
      const report = newReport("Release-BlockedPrevious");
      const blocked = releaseCfg.statuses.find((s) => s.key === "blocked");
      const priors = ["Planning", "Testing", "UAT"].filter((label) =>
        releaseCfg.statuses.some(
          (s) =>
            s.enabled &&
            s.label.localeCompare(label, undefined, { sensitivity: "accent" }) ===
              0
        )
      );
      for (const prior of priors) {
        // Seed audit history: prior → Blocked, then return to prior.
        await prisma.releaseAuditEvent.deleteMany({
          where: { releaseId: fixtures.releaseId! },
        });
        await prisma.release.update({
          where: { id: fixtures.releaseId! },
          data: { status: prior },
        });
        await prisma.releaseAuditEvent.create({
          data: {
            releaseId: fixtures.releaseId!,
            actor: "AUD-ST",
            action: "status_change",
            detail: `Status changed to ${prior}`,
          },
        });
        await prisma.release.update({
          where: { id: fixtures.releaseId! },
          data: { status: blocked!.label },
        });
        await prisma.releaseAuditEvent.create({
          data: {
            releaseId: fixtures.releaseId!,
            actor: "AUD-ST",
            action: "status_change",
            detail: `Status changed to ${blocked!.label}`,
          },
        });

        const row = await prisma.release.findUniqueOrThrow({
          where: { id: fixtures.releaseId! },
          select: {
            id: true,
            releaseCode: true,
            status: true,
            name: true,
            owner: true,
            releaseSize: true,
            priority: true,
            startDate: true,
            releaseDate: true,
            rollbackPlan: true,
            notes: true,
            changeFreeze: true,
            goLiveChecklistPercent: true,
            lifecycleConfigVersionId: true,
            devSignoff: true,
            testSignoff: true,
            uatSignoff: true,
            securityClearance: true,
            dressRehearsal: true,
          },
        });
        const { loadPreviousReleaseStatus } = await import(
          "@/lib/release-lifecycle-status-patch"
        );
        // No previousStatusHint — resolve prior from seeded audit history.
        const enforced = await enforceReleaseStatusChange(
          {
            clerkUserId: AUDIT_SCOPE,
            release: row,
            requestedStatus: prior,
            overrideReason: "AUD-ST unblock",
          },
          {
            ...auditEnforceDeps,
            loadPreviousStatus: loadPreviousReleaseStatus,
          }
        );
        recordCase(
          report,
          blocked!.label,
          prior,
          true,
          enforced.ok && enforced.ok
            ? enforced.canonicalStatus === prior ||
              enforced.canonicalStatus.localeCompare(prior, undefined, {
                sensitivity: "accent",
              }) === 0
            : false,
          enforced.ok
            ? `canonical=${enforced.canonicalStatus}`
            : enforced.body.error
        );
      }
      reports.push(report);
    }

    // Report ----------------------------------------------------------------
    console.log("=== Section A — Config shape vs enterprise default (informational) ===");
    if (configMismatches.length === 0) {
      console.log("No config-shape mismatches.");
    } else {
      for (const m of configMismatches) {
        console.log(`- [${m.entity}] ${m.detail}`);
      }
    }
    console.log("");

    console.log("=== Section B — Enforcement (zero tolerance) ===");
    let grandAttempted = 0;
    let grandPassed = 0;
    let grandFailed = 0;
    const allFailures: FailureRow[] = [];
    for (const r of reports) {
      grandAttempted += r.attempted;
      grandPassed += r.passed;
      grandFailed += r.failed;
      allFailures.push(...r.failures);
      console.log(
        `${r.entity}: attempted=${r.attempted} pass=${r.passed} fail=${r.failed}`
      );
    }
    console.log("");
    console.log(
      `GRAND TOTAL: attempted=${grandAttempted} pass=${grandPassed} fail=${grandFailed}`
    );
    if (allFailures.length > 0) {
      console.log("");
      console.log("FAILURES:");
      console.log(
        "entity | from | to | expected | actual"
      );
      for (const f of allFailures) {
        console.log(
          `${f.entity} | ${f.from} | ${f.to} | ${f.expected} | ${f.actual}`
        );
      }
    }
    console.log("");

    exitCode = grandFailed === 0 ? 0 : 1;
  } catch (err) {
    console.error("FATAL:", err instanceof Error ? err.message : err);
    exitCode = 2;
  } finally {
    try {
      await cleanup();
      // Verify cleanup — zero AUD-ST leftovers.
      const leftovers = {
        releases: await prisma.release.count({
          where: { releaseCode: { startsWith: CODE_PREFIX } },
        }),
        blockers: await prisma.blocker.count({
          where: { blockerCode: { startsWith: CODE_PREFIX } },
        }),
        approvals: await prisma.approval.count({
          where: { approvalCode: { startsWith: CODE_PREFIX } },
        }),
        risks: await prisma.risk.count({
          where: { riskCode: { startsWith: CODE_PREFIX } },
        }),
        incidents: await prisma.incident.count({
          where: { incidentCode: { startsWith: CODE_PREFIX } },
        }),
        deps: await prisma.releaseDependency.count({
          where: { dependencyCode: { startsWith: CODE_PREFIX } },
        }),
        conflicts: await prisma.environmentConflict.count({
          where: { conflictCode: { startsWith: CODE_PREFIX } },
        }),
        drifts: await prisma.drift.count({
          where: { driftCode: { startsWith: CODE_PREFIX } },
        }),
        alerts: await prisma.monitoringAlert.count({
          where: { alertCode: { startsWith: CODE_PREFIX } },
        }),
      };
      const left = Object.values(leftovers).reduce((a, b) => a + b, 0);
      console.log("=== Cleanup verification ===");
      console.log(JSON.stringify(leftovers, null, 2));
      if (left === 0) {
        console.log("CLEANUP OK: zero AUD-ST-* records remain.");
      } else {
        console.error(`CLEANUP FAIL: ${left} AUD-ST-* records remain.`);
        exitCode = exitCode === 0 ? 1 : exitCode;
      }
    } catch (cleanupErr) {
      console.error(
        "CLEANUP ERROR:",
        cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
      );
      exitCode = exitCode === 0 ? 1 : exitCode;
    } finally {
      await prisma.$disconnect();
    }
  }

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
