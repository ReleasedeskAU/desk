# Changelog

All notable changes to Sentinel are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Release lifecycle PATCH enforcement: `PATCH /api/releases/[id]` validates status changes via `validateReleaseTransition` against the release's pinned (or latest-unpinned) config. Illegal/unknown statuses → 422; Flexible unmet gates need `overrideReason`; Required gates → 409 with no override. Canonical status label written on success.
- Release lifecycle config versioning + pin (Wave 1 mid-flight guard): `UserReleaseLifecycleConfigVersion` snapshots on seed/save; `Release.lifecycleConfigVersionId`; new releases pin to the creator's latest version via `POST /api/releases`. Migration `20260807164500_lifecycle_config_version_pin`. Existing unpinned rows remain `latest-unpinned` (tracked in `docs/lifecycle-backlog.md`).
- Migration history baseline (2026-08-07): `Organization` model tracked in Prisma to match live Neon; `20260807120000_baseline_post_reconciliation` migration; `docs/migration-history-note.md`. The other 25 abandoned tenancy-era tables are left in the DB and tracked for a separate cleanup ticket (`docs/tickets/cleanup-25-dead-tenancy-tables.md`).

### Removed

- Quick Start Templates (`/templates`): guided demo scenario page, sidebar entry, quick-start seed APIs, search/help/voice catalog links. Excel/DB seed data remains the operational source. Restore from branch `archive/quick-start-templates` if needed.

### Changed

- Voice branding: end-user copy and spoken identity present as **Release Desk Voice** only. System prompts forbid naming Google/Gemini/other vendors; session API no longer returns the Live model id; public mint/WS errors are sanitized (no billing/provider URLs in Voice Log). Settings voice usage panel uses Release Desk wording.

### Fixed

- Release lifecycle previous-status validation is config-driven: any status with `kind: "interrupt"` may own a `__previous__` edge (no longer hardcoded to key `"blocked"`).
- Invalid stored lifecycle graphs still fall back to the Enterprise Default for reads, but the fallback is loud: structured `console.error`, `usedEnterpriseDefaultFallback` on normalize, and GET `/api/release-lifecycle-config` returns `warning.code = ENTERPRISE_DEFAULT_FALLBACK`.
- Voice session continuity: store Gemini resumption handles only when `resumable !== false` (avoid wiping a good handle mid-tool-call); proactive audio remint at ~8 min before the typical ~10 min Live WebSocket cut; quiet planned refresh (no false “network outage” apology); local transcript digest bridge when resume fails; reconnect remints no longer invalidate pending `propose_action` rows.
- Voice silent WebSocket renew (Gemini-app style): planned remints keep the mic UI connected with no orange flash/transcript noise; `contextWindowCompression.slidingWindow` enabled so sessions can run for hours (only the ~10 min socket is swapped under the hood).
- Voice list context: richer `[APP_CONTEXT]` (up to 40 rows with labels) pushed alongside each user utterance; `10th blocker` / `blocker 10` ordinal parsing; spoken BLK-/RSK-/CNF- code normalization; `useVoiceListContext` on dependencies, drifts, approvals, incidents, alerts, leaves, maintenance, and flows (not only releases).
- Voice shorthand codes: `open release 75` / `rel 75` / `blocker 10` / `conflict 3` normalize to `REL-0075` / `BLK-0010` / `CNF-0003` then `search_entity` (tenant DB SoT); explicit ordinals stay on `first` / `10th`. Regression suite: `npm run test:voice`.
- Voice **context agent** (retrieve-don't-dump): query plan + multi-term ranking, short TTL search cache, `[SESSION_MEMORY]` for pronouns (“that/the same”), APP_CONTEXT boost — all behind `search_entity` (no whole-DB prompt dump). Regression: `npm run test:voice`.
- ⌘K **GlobalSearch** + `GET /api/search` use the same strengthen layer (`release 75` → `REL-0075`, multi-term DB keys, ranked hits) so dashboard search matches voice quality across releases/blockers/risks/bookings/etc.
- Voice guided walkthrough: in-app pointer/highlight on sidebar (`data-voice-nav`) and list rows (`data-voice-row`) before navigate; status chip for agent intent; screen-share CTA only for explain/on-screen asks (never auto-start; no whole-app data dump).

### Added

- Second-config regression suite: compact 4-status lifecycle (`Draft` / `In Review` / `Approved` / `Live`) exercises validate/normalize against a non–Enterprise-Default graph.
- Tracked backlog: effective-dating / config versioning is mandatory before live enforcement or hard Required gates (`docs/lifecycle-backlog.md`).
- Per-user Release lifecycle configuration foundation: Clerk-user-scoped statuses, transitions, and fixed-catalog gate attachments with the locked 15-status defaults. `organizationId` is reserved for a later org cutover. Deploying → Deployed and Deployed → Closed intentionally seed as Flexible until their underlying facts are trustworthy.
- Voice **manager tools**: `get_release_bundle`, `get_attention_brief`, `get_calendar_window`, `compare_releases`, `open_entity`, `copy_visible_codes`, `undo_filters`. Propose/confirm writes extended with `update_blocker` and `update_conflict` (same Zod PATCH schemas as the UI).
- Voice **page-context agent**: `get_page_context` returns exact on-screen/filtered table rows (codes + names) from APP_CONTEXT; Live receives silent `[PAGE_UPDATE]` when the list refreshes after filters. Filtered list asks no longer require screen share. Identity: built by the **Release Desk Team** (never Google).
- Voice **table view + scroll**: `configure_table_view` (Manage Columns / Manage Filters visibility via the same `/api/table-preferences` contract) and `scroll_page` (scroll main content while explaining). Sort uses existing `apply_list_filters` with `sort` + `dir` (same URL contract as the UI sort button). Clear filters preserves sort/dir like the UI.
- Voice **list filters**: `apply_list_filters` tool applies/clears URL filters on every filterable list page (same query contract as the UI tables — blockers, releases, calendar, risks, booking, conflicts, approvals, etc.). Omit `page` to filter the current list. Accepts flattened top-level args (Gemini habit) and resolves spoken dept/app names to ids.
- Voice **release manager**: persona + `explain_page` (page brief without screen share) + `run_walkthrough` tours (critical blockers, release readiness, pending approvals, env conflicts, morning check). Release `get_summary` returns READY/BLOCKED/AT RISK verdict with explicit why (blockers, conflicts, approvals, sign-offs, readiness %).

- Voice screen-share OCR: `MEDIA_RESOLUTION_HIGH` in ephemeral-token constraints + Live `generationConfig` (280 tokens/frame for table text); wider JPEG capture (1280px / 0.92 quality); prompts require digit-by-digit ID reading so the model does not invent codes like REL-8983.
- Voice opt-in **tab screen share** (default off): `getDisplayMedia` with `preferCurrentTab`, on-demand ≤1 fps JPEG frames only for screen-related questions, `MEDIA_RESOLUTION_HIGH` for text/table legibility, untrusted-screen gate blocking `propose_action`/`confirm_action` without spoken write intent, and explicit ~100s A+V proactive remint/resume (keeps mic + display tracks; video frames re-attached after resume) before the ~2 min Live A+V limit.
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

- **Per-organization business-code prefixes (REL/BLK/CNF are not universal)** — Companies may use different prefixes (e.g. `RC`/`BLOCK`/`CF` instead of `REL`/`BLK`/`CNF`). Today `ENTITY_CODE_PREFIX` + spoken-query padding use product defaults only. Planned Phase 1: store org-scoped prefix map in DB (defaults = current REL/BLK/CNF/…); load on voice session mint + `/api/search`; inject into `padSpokenDigitsToCode` / context-agent / Live brief / ⌘K strengthen. Spoken words (“blocker”, “release”) stay stable; prefix letters become tenant config. Do not hardcode per-company IDs. Align config with how codes are already stored in that org’s DB. Settings UI + optional auto-detect from existing codes = follow-on. See `lib/voice/context-agent/CONTEXT_AGENT.md` § Deferred.
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
