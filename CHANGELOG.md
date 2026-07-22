# Changelog

All notable changes to Sentinel are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Per-user **Risk Engine** settings (`UserRiskEngineConfig`, Settings → Risk Engine): Simple Risk scale/labels/cutoffs and Weighted Risk labels/cutoffs. Unifies list / heat map / detail-hero / RiskMatrix onto one classifier (defaults 5/11/19). RiskFactor catalog UI unchanged.
- Copilot P1-S2 DependencyGraph: optional `Service.applicationId` bridge to Application/Release, `getBlockedReleases` / `calculateDeploymentOrder` / `CycleError`, and a live Release detail "Services Involved" section (computed via Service → Application → ReleaseApplication — not stored on Release).
- Added Jira webhook connectors: shared `WebhookConnector` / `WebhookEvent` models, HMAC-SHA256 receiver on connector-engine, scheduler-based processing (no Redis/BullMQ), Sentinel setup UI with one-time secret confirmation, delivery log, and replay.

### Deferred (do not lose)

- **Wire `computeWeightedRiskScore` on RiskFactor / ReleaseRiskFactorInput edits** — catalog weight changes currently leave `Release.weightedRiskScore` stale until `seed-risk-factors` (or a future recompute API) runs. Separate ticket.
- Per-factor data-driven band rules (raw→1–5) — still hardcoded in `lib/risk-scoring/factors.ts`; fast-follow after this Settings pass.
- Added editor-gated Risk and Drift create flows with strict POST schemas, server-generated IDs, validated relational dependencies, and post-create confirmations.
- Added editor-gated create flows for approvals, leave records, and environment versions, with strict POST validation, server-generated identities, relational lookups, and post-create confirmations.
- Added authenticated per-user color appearance persistence with strict theme validation and an isolated `UserAppearancePreference` data model.
- Added the System Mapping redesign data layer: authenticated strict CRUD for core systems, matrix cells, shared environments, and critical paths; persisted release-manager notes; canonical edge synchronization; and complete workbook-derived seed data.

### Changed

- Env Booking create now checks overlapping BOOKED windows on the same environment (not just application), returns a clear conflict prompt, and allows confirmed create-with-conflict (`confirmConflict` + `conflictFlag`). Multi-application create payloads are rejected (1:1:1:1). Conflict matching covers legacy seed rows (`environmentId` null) and seed env codes like `FIN-TEST-01` mapped to catalog names like `Test`.
- New booking form date labels follow the selected environment phase (Test / UAT / Pre-Prod / Dev / Prod / DR); DR is labeled as Disaster Recovery; create writes the matching phase columns. Booking table defaults show Environment/Start/End plus UAT/Pre-Prod env columns.
- Locked department rename (UI + PATCH): name is immutable so System Mapping matrix/edge projection stays consistent; only head is updatable.
- Shared Environments filter option lists refresh after create/update/delete.
- Risk, Blocker, and Drift detail edit forms now use the same select cascades / FK validation as create (applicationId for risks; release picker for blockers; dept→app→release→env for drifts).
- Extracted canonical Prisma schema into workspace package `@releasedesk/database`; Sentinel and connector-engine now share one client (Neon retry logic remains in Sentinel `lib/prisma`).
- Centralized organization-compatible create handling for Batch 2 entities and Releases so live v2 inserts always persist the required organization while local v1 remains supported.

### Security

- Webhook connector secrets are encrypted at rest in connector-engine, returned plaintext once on create, never listed by GET APIs, and verified with timing-safe HMAC-SHA256 over the raw body; public `/webhooks/:token` uses UUID endpoint tokens + rate limiting (no API key).
- System Mapping redesign endpoints enforce `readonly` access for reads and `editor` access for mutations, reject unknown request fields, and return generic non-PII database errors.
- Enforced real RBAC: `requireRole` checks privilege ranks; session role from Clerk `publicMetadata.sentinelRole` / `role`, else DB `User.accessLevel`, else `SENTINEL_DEFAULT_AUTH_ROLE`, else `readonly`.
- Disabled legacy unsigned `/api/auth/login` cookie minting (410 Gone); removed from public middleware allowlist.
- Stopped returning internal error messages from agent/chat/bookings/connector routes to clients in production.
- Added baseline security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Added Zod validation for `/api/agent`, `/api/chat`, and user create/update APIs; CSV import size/row caps.
- User provisioning APIs require `admin`; Reference Data UI hides mutate controls for readonly users.
- Zod on `POST /api/risks` (likelihood/impact 1–5); strict allowlists on department/environment/application PATCH; CSV import uses `csv-parse` (quoted fields) while keeping size/row caps.
- Env Booking Timeline/Calendar: reuse `TIMELINE_TONES` pastel washes (no private saturated palette); env-code bar labels; conflict as AlertTriangle badge (not rose outline clusters); consolidated day milestone chip.

## [0.2.0] - 2026-06-23

### Added

- **Environment Desk** (`/environments`) — enterprise release calendar, environment booking, system topology, version matrix, application env/app config, and enterprise release impact panels.
- Synthetic data layer (`lib/enterprise-env-data.ts`) — `buildEnvironmentDesk()` derives all desk views from `releases`, `services`, connectors, and freeze windows.
- Cross-panel UI — timeline, map, version matrix, and config tabs sync on selection; links to release detail pages.
- Metric strip and auto-generated briefing for standups and CAB prep.
- Quick Start template: **Environment desk** (Planning category).
- Documentation: [docs/ENVIRONMENT-DESK.md](./docs/ENVIRONMENT-DESK.md).

### Changed

- README updated with Environment Desk route and demo guidance.

## [0.1.0] - Initial

- AI-powered Release Command Center demo prototype.
- Releases, executive dashboard, calendar, agents, connectors, knowledge graph, Quick Start templates, live demo state via `localStorage`.

[Unreleased]: https://github.com/aimtechs2-collab/sentinel/compare/master...HEAD
[0.2.0]: https://github.com/aimtechs2-collab/sentinel/compare/8f56db3...4cf5b9b
[0.1.0]: https://github.com/aimtechs2-collab/sentinel/releases/tag/v0.1.0
