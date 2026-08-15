# Release Lifecycle — Tracked Backlog

Requirements that are **agreed and mandatory**, but intentionally deferred
or only partially shipped.

## Status roles — names must not drive enforcement (Wave 0 shipped 2026-08-13; Wave 1 shipped 2026-08-13)

**Status:** Contract + Settings shipped. Waves 1–2 read live flags (facts, VR-13, cascades, crons). Guards/UI graphs and `statusKey` persist remain Waves 3–4.

See `docs/lifecycle-status-roles.md`. Do not add new `fromKey === "open"` (etc.) checks.

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
- Risk severity routing — CAB/Director/VP-CIO approval requirements by Simple
  Risk band remain descriptive. Building this needs a real approval-routing
  workflow; lifecycle labels and score bands alone must not imply enforcement.
- Incident response/resolution SLA timers — requires scheduled-job ownership,
  durable deadlines, and escalation delivery.
- Dependency **Confirmed** (both parties acknowledge) — not a status rename.
  Needs tracking which two release managers and storing each acknowledgement.
  Same bucket as SLA timers: real new product surface, not a status rename.

## AV-13 — Daily config drift scan (deferred entirely)

**Status:** Out of scope for the Category A cron pass (2026-08-11).

**Why deferred:** There is no product definition of a "baseline" to drift from, and no
environment-snapshot ingest path to compare against. A cron slot that only logs
"skipped" would be dead weight in daily cron logs.

**Needs before build:**

1. What counts as a baseline (golden config, last-known-good, CAB-approved snapshot)?
2. How snapshots are ingested (agent, connector, manual upload)?
3. What entity/alert is created on drift (likely Drift +/or MonitoringAlert)

Do **not** add an AV-13 stub to `/api/cron/lifecycle-automations`.

## Alert quiet-hours suppression (NOTIF-15) — deferred

**Status:** Parked with the other scheduled-logic features (2026-08-16).

**Why deferred:** Quiet hours need a real time-window configuration (timezone,
days, start/end), not just a timer. That is a new scheduled-logic feature,
unlike Alert TTL which reused the existing AV-22 / sign-off SLA job.

**Needs before build:** Settings for the window, cron/evaluator that pauses
repeat-suppression during the window, and a clear resume rule when the
window ends. Do not treat Dismissed as a stand-in for this.

## Missing alert source generators — deferred (separate items)

Each needs wiring into a different source system. Do not attempt as one pass.

1. **Schedule** — raise when a booking / freeze / maintenance window is due.
2. **Approval Pending** — raise when a CAB decision sits in the starting status past its SLA.
3. **Environment** — raise from environment health / booking conflict signals.
4. **Conflict** — raise when a conflict is opened or escalated.
5. **Risk Threshold** — raise when a risk score crosses a Simple Risk band.

Existing generators (stale blocker AV-03, dependency rollback AV-26, system
hooks AV-14) already write `alertSource` + `autoGenerated`.

## Blocker Owner / role enforcement (parked)

**Status:** Informational only (2026-08-13). Settings shows the sheet’s
accountable role per status (Release Manager / Blocker Owner / Manager).
Clerk roles are not checked per status. Do not build permission gates until
product defines how those roles map to users.
