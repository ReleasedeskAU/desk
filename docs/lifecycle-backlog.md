# Release Lifecycle — Tracked Backlog

Requirements that are **agreed and mandatory**, but intentionally deferred
or only partially shipped.

## Effective-dating / config versioning (Wave 1 mid-flight guard)

**Status:** Snapshot + pin shipped for **new** releases (2026-08-07).

**What shipped:**

- `UserReleaseLifecycleConfigVersion` — immutable JSON snapshot on every
  seed/save
- `Release.lifecycleConfigVersionId` — pin to the snapshot the release
  entered under
- `POST /api/releases` pins new rows to the creator's latest version
- Enforcement (when wired) must call `resolveLifecycleConfigForRelease`
  so pinned releases keep their graph after settings edits

**Still open — existing unpinned releases:**

> **80 existing releases remain unpinned (`configPin: latest-unpinned`) —
> they silently follow whatever the current latest config is, meaning the
> mid-flight editing problem is NOT solved for them yet, only for new
> releases going forward. Needs a deliberate backfill/pin decision later.**

**Done (2026-08-07) — status / approval vocabulary on live data:**

- Neon backup: `backup-pre-status-migration-2026-08-07` (`br-winter-tooth-ahjq9rcn`)
- Script 1: `scripts/migrate-release-status-vocabulary.ts` — 7 rows remapped
  (Approved→CAB Approved, Complete→Deployed, In Progress→Planning,
  Scheduled→Planning) + audit `status_migration`
- Script 2: `scripts/migrate-release-approval-status.ts` — 75 rows cleaned
  (Draft/Planning/Testing→Not Submitted, CAB Submitted→Pending; On Hold kept)
  + audit `approval_status_migration`
- Verified: `legacyStatus=0`, `legacyApproval=0`

Do not treat that backfill as optional polish. Until those rows are pinned
(or explicitly accepted as “follow latest”), editing a user’s lifecycle
rules can still strand or re-route in-flight work for those 80.

**Must ship before:**

- Promoting any transition/gate from Flexible to Required with hard block
- Any "no override" CAB/go-live gate behaviour

**Still deferred (optional layering):**

- Effective-dating (`effectiveFrom` / `effectiveTo`) for scheduled cutovers
- UI “adopt latest config” for a single in-flight release
- Migration path that pins the 80 existing rows to a chosen version

## Other deferred items

- Provisional Override (never built)
- Org-scoped config (`organizationId` / `tenant_id`) — still `clerkUserId` today
- Hard Required gates on Deploying → Deployed / Deployed → Closed (stay Flexible)
