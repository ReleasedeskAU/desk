# Ticket: Clean up 25 confirmed-dead tables from the July tenancy rollback

**Status:** Open — **not** part of the 2026-08-07 baseline reconciliation.  
**Priority:** Separate deliberate change; requires human review before any DROP.  
**Related:** `docs/migration-history-note.md`

## Background

On 2026-08-07 we confirmed live Neon still has 26 tables absent from the
pre-baseline Prisma schema. Twenty-three match the abandoned multi-tenant
models removed from connector-engine during the July tenancy rollback; three
are `_orphaned_v2_*` renames from the v2→v1 bridge.

**Baseline work adopted only `Organization`.** The remaining **25** were left
in the database on purpose.

## Scope (tables to remove — after re-verification)

1. `SuperAdminProfile`
2. `SystemIntegration`
3. `ApplicationStatusCheck`
4. `RiskFactorDefinition`
5. `ReleaseRiskMetric`
6. `RiskScoreThreshold`
7. `RiskLikelihoodScale`
8. `RiskImpactScale`
9. `SLAMetricDefinition`
10. `WorkflowStageDefinition`
11. `ApprovalTypeDefinition`
12. `RoleDefinition`
13. `TestingPhaseGate`
14. `NotificationTypeDefinition`
15. `ReleaseSizeDefinition`
16. `ChangeFreezePeriod`
17. `EnvironmentTypeDefinition`
18. `DeploymentWindowDefinition`
19. `SharedEnvironmentConfig`
20. `SharedEnvironmentDepartment`
21. `ApplicationCategoryDefinition`
22. `CustomFieldDefinition`
23. `_orphaned_v2_Incident`
24. `_orphaned_v2_MonitoringAlert`
25. `_orphaned_v2_PlannedMaintenance`

**Out of scope for this ticket:** `Organization` and any `organizationId`
columns on core tables (still required by `lib/org-compat.ts` / CE writes).

## Required checklist before DROP

1. Re-run a full-repo reference search for every name above (Sentinel +
   connector-engine, all active branches). Must be zero hits outside this
   ticket / history docs.
2. Create a fresh Neon branch backup from current production (named, dated).
3. Capture row counts and a sample dump if anyone might need forensic data.
4. Explicit human approval to DROP.
5. Ship a committed Prisma migration (or documented SQL) that performs the
   drops — never ad-hoc console DDL without a migration file.
6. Update `docs/migration-history-note.md` with the date the cleanup shipped.

## Explicitly not this ticket

- Baseline / `_prisma_migrations` reconciliation (done 2026-08-07)
- Removing `organizationId` columns from live core tables
- Product multi-tenancy design
