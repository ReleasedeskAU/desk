# Changelog

All notable changes to Sentinel are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Voice Phase 4 hardening: Live WebSocket stale detection + exponential reconnect with fresh ephemeral remint; remint invalidates pending `propose_action` rows; orange disconnected/reconnecting mic UI; daily session ceiling (40) + 15 min max duration with usage heartbeats; admin voice usage on Settings → Integrations; text fallback through the same `dispatchVoiceToolCalls` pipeline (two-turn write gate preserved).
- Voice UX: Gemini Live `sessionResumption` so reconnect restores the same conversation; silent in-app viewport JPEGs (~1fps via html-to-image) so the model sees the page without getDisplayMedia / Chrome share banner; `lib/voice/sidebar-catalog.ts` maps sidebar labels/synonyms/aliases (`calendar tab`, `env booking page`, `/bookings` → `/booking`); compact VoiceMic pill UI.
- Voice Phase 3: `propose_action` / `confirm_action` for exactly two writes — `set_approval_decision` (`PATCH /api/approvals/[id]` + `patchApprovalSchema`) and `acknowledge_alert` (`PATCH /api/monitoring-alerts/[id]` + `patchMonitoringAlertSchema`). Editor RBAC at propose and confirm; short-lived one-time `actionId` store; hard same-batch gate so compressed “yes, approve now” cannot execute; audit tagged `source:voice`. Amber transcript treatment for proposals. `record_release_decision` deferred (no Zod on events route).
- Voice Phase 2: `get_summary` tool (manifest now 3 tools) answers spoken questions about a record via read-only `POST /api/copilot/voice/summary`, reusing Conversation Agent `lookupReleaseByCode` / same Prisma context (`lib/conversation-entity-summary.ts`) — no writes; ambiguous “tell me about…” defaults to summary before navigate.
- Voice get_summary UX: system-instruction nudge to speak a short “Let me check that release” before `entityType=release` lookups (slow cold path); no filler for faster entity types. Transcript strip echoes the line if the model skipped pre-tool audio (`gemini-3.1-flash-live-preview` has no NON_BLOCKING tool audio).
- Voice / GlobalSearch entity coverage expansion: `searchAll` + `GET /api/search` now index seed-backed domain entities (bookings `ENV-0001`, risks, blockers, drifts, approvals, incidents, conflicts, dependencies, leaves, alerts, maintenance, flows, depts/apps/users, etc.); `search_entity.entityType` enum + spoken ordinals/`env 001` normalization aligned; route allowlist already matched App Router product pages (auth/dev excluded).
- Voice Phase 0 plumbing (`feature/voice-navigation`): `POST /api/copilot/voice/session` mints Gemini Live ephemeral tokens (server-side `GEMINI_API_KEY` only) with frozen `navigate_to` / `search_entity` toolManifest, per-user mint cooldown, and `lib/voice/client.ts` mic + WebSocket lifecycle (no tool handlers / mic UI yet).
- Permissions-Policy now allows `microphone=(self)` so browser voice capture works (was `microphone=()`, which denied getUserMedia even when the site toggle was on).
- Voice Phase 1: `navigate_to` / `search_entity` handlers (allowlist from `lib/navigation.ts` + detail patterns; search reuses GlobalSearch’s `searchAll` + `GET /api/search`), tool dispatch in `VoiceLiveClient`, and Dashboard `VoiceMic` with live transcript strip (no DB writes; session route unchanged).
- VoiceMic mounted in `AppShell` (not Dashboard-only) so the Live session and transcript survive `navigate_to` client route changes.
- Voice navigate_to: search results expose `path`/`href` for navigation and `refId` for speech only; reject invented `/releases/REL-*` and verify detail entities exist before `router.push` (no silent allowlist false-success).
- Voice search understands human phrasing: filler strip, spoken versions, and ordinals (`first release`, `rel 01`) so detail pages open without memorizing route ids.

### Changed

- Removed Settings → Risk Factors (add form + bulk import). CRUD lives only on the sidebar Risk Factors tab (`/risk-factors`).
- Risk Factors browse (`/risk-factors`): factors grouped under collapsible category sections with jump chips, per-category counts/weights, and “Add in category” — no more flat table repeating the category on every row.
- Dynamic Simple Risk bands (3–6): Settings can add/remove bands; ordered `{ id, label, maxScore }` drives list chips, heat map legend, Risk detail, and Dashboard distribution. Legacy 4-band JSON still upgrades on load.
- Risk Engine Settings UI: stepped Scale → Score bands → Band names → Try a score layout with live band ladder so cutoffs/labels are self-explanatory (e.g. CRITICAL → EXTREME).
- Risk Engine Settings edits now drive list chips, heat map, create/edit scale dropdowns, Risk detail matrix/score bar, and Dashboard risk distribution labels (not only the Settings preview).
- Risk list / heat map showed the internal band key (`CRITICAL`) instead of the Settings display label (`EXTREME`); chips now use `simpleRiskLevelLabel` (detail hero already did).
- Risk Engine Settings save on preview/prod: create `UserRiskEngineConfig` if missing before upsert (label rename like CRITICAL → EXTREME was valid; write failed when the Vercel DB never got that migration). Clearer API error when the table/model is still unavailable.
- Risk Engine Settings: per-section Edit / Save / Cancel / Delete (reset to defaults). Fields stay read-only until Edit; universal Save removed. Weighted Risk (System 2) has an On/Off feature flag (persisted with cutoffs JSON; Dashboard severe-weighted highlights respect it).
- Risk Engine PUT validates bands before normalize so invalid cutoffs return 400 instead of silently wiping to shipped defaults; SoftNumberInput commits flush before Save; Settings save broadcasts so open Risk/Detail views refetch; L/I list filters accept 1–10; Dashboard `?band=` deep-links filter Risk list by score range; heat map copy/palette follow dynamic scale/bands.
- Vercel production typecheck: force-clean Prisma client generate before `next build` and pin `@releasedesk/database` TS paths to the vendored generated client so new models (`Service`, `UserRiskEngineConfig`, etc.) are never typed from a stale cached client.

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
