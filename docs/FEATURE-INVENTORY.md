# Release Desk + StaffLess AI — Feature inventory

**As of 5 September 2026.** Built from the current Sentinel (`d:\Sentinal-old\Sentinel`) and StaffLess (`d:\Sentinal-old\onyx-foss`) trees — not from conversation memory.

Status words used below:

- **Working** — implemented and wired end-to-end in code
- **Partial** — real code, but incomplete, demo-mixed, or gated
- **UI-only** — screen exists; buttons/data do not persist or call a live API
- **Not built** — discussed or stubbed; no working path

Known limitation of this snapshot: tenant Settings graphs can override default statuses. Defaults below are what ships in code (`DEFAULT_*_LIFECYCLE_STATUSES`). Live org graphs may differ.

---

## 1. Core lifecycle entities

Cross-cutting:

- Status-role contract: `lib/lifecycle-status-roles.ts`
- One-click DECIDE suggestions: `lib/entity-workflow.ts` (API still validates)
- Crons: `lib/lifecycle-automations/checks.ts` (daily Hobby schedule)
- Cascades: `lib/lifecycle-event-hooks.ts`
- Settings hub: `/lifecycle` — tabs for all ten lifecycle entities (not Env Booking)
- Auth on mutations: Clerk `requireRole` (`readonly` / `editor` / `admin`)

### 1.1 Releases — **Working** (most complete entity)

**Statuses (defaults):** Draft, Planning, Testing, UAT, Pending CAB, CAB Approved, Ready to deploy, Deploying, Deployed, Closed, Cancelled, plus interrupt/branch: Blocked, Rolled Back, Deferred, Rejected.

**What moves status:** user PATCH (`/api/releases/[id]` → `enforceReleaseStatusChange`); legal next list from `GET /api/releases/[id]/lifecycle`; cascades after commit (e.g. withdraw approvals on Cancelled, dependency resolve on Deployed, At Risk on rollback).

**Cancelled vs Closed:** Cancelled fully locks the release (no PATCH, including status). Closed is immutable on fields but status / override can still move. Related-entity creates are blocked when the parent is Cancelled.

**Field locks:** **Working** — dedicated Release field-lock engine + Settings Field Locks panel (`release-field-lock-engine.ts`). Separate from the generic EntityFieldLock table.

**Gates (defaults, examples):** sign-off completeness, booked UAT/deploy env, no open blockers, hard dependencies met, no open env conflicts, high risks mitigated, change freeze, PIR / post-deploy checks. Create also validates name, applications, date order.

**Reconcile pass:** **Yes** — `release-lifecycle-spec-reconcile.ts`.

**Limitations:** many older releases are not pinned to a config version; some tenants still store display labels rather than only `statusKey`; role-flag “owner hints” are display, not Clerk-enforced.

### 1.2 Blockers — **Working**

**Statuses:** Open, Assigned, In Progress, Pending, Escalated, Resolved, Closed, Cancelled, Reopened.

**Moves:** PATCH + one-click workflow; cron AV-03 can raise a monitoring alert when stale; resolving can unblock a parent release (CASC-02). Several default transitions are **disabled** until enabled in Settings.

**Field locks:** **Working** — the only type in `ENTITY_FIELD_LOCK_TYPES = ["blocker"]`. Enforced on blocker PATCH/create.

**Gates:** assignee set, pending reason, root cause, resolution notes (on configured edges). New blockers blocked when parent release is at/after Deploying (VR-35).

**Reconcile pass:** **Yes**.

**Limitations:** optional edges off by default; status-owner hints not Clerk-enforced.

### 1.3 Approvals — **Working** (weaker than Release/Blocker)

**Statuses (on `decision`):** Pending, Approved, Approved with Conditions, Rejected, Deferred, Expired, Withdrawn.

**Moves:** PATCH; one-click excludes **required** edges (Approved → Expired is cron AV-22 only); Cancelled parent release withdraws pending/deferred (CASC-13); Rejected can land the linked release on the configured reject status.

**Field locks:** **Not built** (edit-policy only).

**Gates:** none on default edges. `approved_with_conditions` requires a conditions field.

**Reconcile pass:** **No** dedicated spec-reconcile (normalize + inject missing defaults only).

**Limitations:** no field-lock matrix; risk-band routing to the right approver is descriptive, not enforced.

### 1.4 Sign-offs — **Working** (not a standalone table)

**Statuses:** Pending, Approved, Rejected, Approved with Conditions, Withdrawn, Expired.

**What it is:** eight types (dev, test, uat, security, business, ops, dress rehearsal, training) stored as columns on **Release**. Detail `/signoffs/[id]` PATCHes the release. Cron SIGNOFF-SLA expires Pending (training excluded from SLA).

**Field locks:** no EntityFieldLock; Release field-lock catalog includes Sign-off rows.

**Gates:** none on the sign-off graph itself. Release transitions attach `signoffs_complete`, test/ops/business sign-off gates.

**Reconcile pass:** **Yes**.

**Limitations:** no one-click module in `entity-workflow.ts`; not a first-class row with its own id in the same way as Blocker.

### 1.5 Risk — **Working**

**Statuses:** Open (`identified`), In Progress (`assessing`), Mitigating, Monitoring (`mitigated`), Accepted, Closed, Escalated.

**Moves:** PATCH + one-click; cron AV-02 auto-escalates after `escalateAfterDays`. Release gate `high_risks_mitigated` on the path to Ready.

**Field locks:** **Not built**.

**Gates:** likelihood/impact set, score calculated, mitigation for high, acceptance documented, residual documented, reversal reason.

**Reconcile pass:** **Yes**.

**Limitations:** key vs label mismatch (key `identified`, label Open); approval routing by score not enforced.

### 1.6 Incidents — **Working**

**Statuses:** Active (`open`), Acknowledged, Investigating, Escalated, Resolving, Resolved, Closed, Reopened. Resolving/Reopened paths **disabled** by default.

**Moves:** PATCH + one-click. Release gates: no blocking incidents into Deploying; no open incidents into Closed.

**Field locks:** **Not built**.

**Gates:** responder confirmation on Open → Acknowledged (default). SLA timers **not built**.

**Reconcile pass:** **Yes**.

### 1.7 Dependencies — **Working**

**Statuses:** Identified, Pending, Confirmed, In Progress, At Risk, Blocked, Escalated, Resolved, Removed, Closed. Hard-gate “satisfied” counts: Resolved, Removed, Closed.

**Moves:** PATCH + one-click; create is **intake-only**; AV-04 can mark resolved when upstream is Deployed; AV-26 can move to At Risk on rollback; VR-36 blocks add/remove at/after Ready.

**Field locks:** **Not built**.

**Gates:** `both_parties_acknowledged` (Confirmed → In Progress), notes on remove. Two-party ack is a gate type — treat dual-party UX as **partial** (backlog still calls out real two-party ack).

**Reconcile pass:** **Yes**.

### 1.8 Conflicts — **Working**

**Statuses:** Open (`detected`), In Progress, Pending Review, Escalated, Resolved, Closed, Dismissed.

**Types:** schedule, resource, application, environment booking, maintenance window, freeze period.

**Moves:** PATCH + one-click; detectors can **create** records on release date changes (`conflict-detectors.ts`); review/dismiss is still user-driven. Release gate `no_open_environment_conflicts`.

**Field locks:** **Not built**.

**Gates:** RM assessment, higher-authority decision, dismissal justification (dismiss edges are `required`).

**Reconcile pass:** **Yes**.

### 1.9 Drift — **Partial**

**Statuses:** Open (`detected`), In Progress, Scheduled, Escalated, Resolved (`approved` key), Closed, Reverted.

**Moves:** PATCH + one-click; AV-14 can escalate security drift and raise an alert.

**Field locks:** **Not built**.

**Gates:** manual review, ETA, new baseline (on configured edges).

**Reconcile pass:** **Yes**.

**Limitation:** automated daily baseline scan (AV-13) is **not built**. Records are manual / hook-created, not a live config-diff engine.

### 1.10 Monitoring Alerts — **Working** (defaults are loose)

**Statuses:** Active, Acknowledged, Investigating, Escalated, Resolved, Suppressed, Closed. (Expired is retired — not a destination.)

**Types:** reminder, warning, escalation, notification.

**Moves:** PATCH + one-click; system create from stale-blocker / drift hooks. TTL expiry cron is a **no-op stub**. Default graph is **ungated** (gate catalog exists in Settings).

**Field locks:** **Not built**.

**Reconcile pass:** **Yes**.

**Limitation:** `suppressesRepeatAlerts` exists as a role flag but is not defaulted on Acknowledged.

### 1.11 Environment Booking — **Working CRUD, not a lifecycle entity**

No statuses, no Settings tab, no spec-reconcile, no field-lock matrix.

**What exists:** booking CRUD + validation; phase helpers; locked when parent release is Cancelled or on the Deploying milestone. Release gates require UAT/deploy bookings and reject expired windows. Overlaps can become Conflict type `environment_booking`.

### 1.12 Field-lock and reconcile coverage (honest)

| Entity | Field-lock matrix | Spec-reconcile |
|--------|-------------------|----------------|
| Release | Yes (own engine) | Yes |
| Blocker | Yes (generic EntityFieldLock) | Yes |
| Approval | No | **No** |
| Sign-off | Via Release rows only | Yes |
| Risk, Incident, Dependency, Conflict, Drift, Alert | No (edit-policy only) | Yes |
| Env Booking | Release guards only | N/A |

Comment in `entity-field-lock.ts`: remaining entity types are still to be added.

---

## 2. Connectors

### 2.1 Two stacks

| Stack | What it does | Status |
|-------|----------------|--------|
| **StaffLess AI** (live Connectors tab) | List is `GET /admin/connector/status` joined to indexing-status by `cc_pair_id`. Create, pause, sync, edit, prune, delete, and index history call StaffLess from the Next.js server. Work items from `POST /api/admin/search`. | **Working** for Jira, GitHub, Teams, Email (IMAP) |
| **connector-engine** (webhooks) | Near-real-time webhook ingest | **UI-only / orphaned** — `WebhookConnectorsSection` is not mounted; API + client still exist |

PAT and URL stay on the Next.js server (`STAFFLESS_AI_URL`, `STAFFLESS_AI_PAT` / `ONYX_API_KEY`). Never `NEXT_PUBLIC_*`. Credential JSON from StaffLess is never sent to the browser.

### 2.2 Wizard catalog vs actually creatable

| Type | In wizard | StaffLess create |
|------|-----------|------------------|
| Jira | Yes | **Yes** (live project picker from Jira Cloud; one StaffLess connector for one or many projects via `project_key` or `jql_query`; optional `indexing_start`) |
| GitHub | Yes | **Yes** (live repo picker; one StaffLess connector per owner; PRs/Issues/Documents; create-only `indexing_start`) |
| Microsoft Teams | Yes | **Yes** (poll, Azure AD client id/secret/tenant, optional team names) |
| Email (IMAP) | Yes | **Yes** (live folder picker; folders required; optional/required From allow-list; create-only `indexing_start`; not Outlook/Graph) |
| Jenkins / ServiceNow / SonarQube / Outlook | **No** | **No** |

GitHub wizard types are Pull Requests, Issues, and Documents (`include_files`). Jira/Teams/IMAP index a fixed document set.

### 2.3 Sync and other actions

- **Polling:** StaffLess `refresh_freq` from the wizard interval.
- **Sync Now:** `POST /api/manage/admin/connector/run-once` (`from_beginning: false`), 60s rate limit.
- **Re-index from beginning:** same endpoint with `from_beginning: true` (sync logs drawer).
- **Pause / Resume:** `PUT /admin/cc-pair/{id}/status` `PAUSED` / `ACTIVE`.
- **Edit:** `PATCH /admin/connector/{id}` plus `PUT /admin/cc-pair/{id}/name`. New secrets use `PUT /admin/credential/{id}`.
- **Delete:** `POST /admin/deletion-attempt` with `connector_id` + `credential_id`. Async. Indexed copies are removed; the source system is not. Requires exactly one credential — refuse if missing or ambiguous.
- **Index history / sync logs:** History (clock) opens live StaffLess data: indexing-status (`docs_indexed`, `latest_index_attempt_docs_indexed`, `in_progress`, `last_status`, `last_success`), `GET /admin/cc-pair/{id}/index-attempts` (no stack traces), and unresolved `GET /admin/cc-pair/{id}/errors`. Auto-refreshes while queued or in progress. Lookup is StaffLess connector id or `cc_pair_id` (not Prisma). StaffLess does not expose separate “records found” vs “fetched” counts.
- **Prune:** `POST /admin/cc-pair/{id}/prune`.
- **Check fields:** local wizard validation only. StaffLess has no connection-test API.
- **Synced Work Items:** StaffLess search. Copy that mentions webhooks is overstated.

Dashboard “connector issues” still use dummy connector data (`lib/dummy-data.ts`), not StaffLess.

---

## 3. StaffLess AI engine

**What it is:** MIT Onyx fork, product name StaffLess AI. Internal `ONYX_*` names kept. Host overlay in `onyx-foss/deployment/releasedesk-overlay/` (also documented as `ReleasedeskAU/Stafless-ai`). Typical deploy: Azure VM, Docker (api_server, background, nginx, Postgres, Redis, OpenSearch). Nginx strips `/api` and proxies to `api_server`.

**Auth:** Community PAT (`POST /user/pats`). Catalog + admin search require StaffLess `FULL_ADMIN_PANEL_ACCESS`. Sentinel calls with Bearer PAT from the server.

### 3.1 Working capabilities

| Capability | API | Notes |
|------------|-----|--------|
| Ranked search | `POST /api/admin/search` | Sample, not a census. Ask caps at 25 docs. |
| Exact count | `POST /api/admin/document-count` | Unique indexed documents; AND filters + date ranges |
| Breakdown | `POST /api/admin/document-breakdown` | Group-and-count, cap 50; `date_bucket=month` on date fields |
| Distinct values | `POST /api/admin/document-distinct` | Stored values for one field |
| Lookup by key | `POST /api/admin/document-by-key` | Exact `key` (RD-9 ≠ RD-90) |
| List matching | `POST /api/admin/document-list` | AND filters and/or date ranges; keys + assignee/status/status_category/created/updated/duedate; `sort_by` |
| Published schema | `POST /api/admin/document-fields` | Allow-list + `resolved_status_category` + `status_category_values` + date-range params — not raw columns |

**Queryable fields:** assignee, status, status_category, priority, project, project_name, labels, issuetype, reporter, key, parent, duedate, created, updated, resolution, resolution_date, issuelink, issuelink_type, last_updater, status_was, repo, object_type, num_files_changed, num_commits.

**Match modes:** contains (substring) for assignee, reporter, labels, last_updater; exact (case-insensitive) for the rest (including `key`, `parent`, and `status_category`). AND up to 5 filter pairs. Date ranges compare the YYYY-MM-DD prefix (`created_from`/`to`, `resolved_from`/`to`, `updated_from`/`to`, `due_from`/`due_to`/`due_before`).

**GitHub:** source=github document count is PRs/issues/files, not repositories. Repository count = distinct `repo` values. PRs vs issues = `object_type`. `num_files_changed` and `num_commits` are PR tags (Ask context only — not Weighted Risk).

**Resolved / open:** `status_category=done` vs `new` + `indeterminate` (Jira `statusCategory.key`). Missing `status_category` is not classified. Display names such as Done/Closed are not the rule.

**Semantic layer (as implemented):** the model maps user language onto **stored** field names and values. Code does not synonym-match “todo” → “To Do”. Children = other docs with `parent=<key>`. Subtasks = `parent` + `issuetype=Subtask`. No invented `epic` / `subtasks` columns.

### 3.2 Security decisions (working)

- PAT never sent to the browser
- Explicit allow-list — no `SELECT DISTINCT tag_key`
- **Never queryable:** `assignee_email`, `reporter_email` (enforced in StaffLess parse + Sentinel `sanitizeFields`)
- Tool failures become structured `{ error }` for the model; users see a generic capability message, not stacks or vendor names

### 3.3 Not built

- Neo4j / knowledge graph over indexed docs (overlay checklist: later phase)
- Cross-source person matching (Jira assignee ↔ GitHub user)
- Write-back to Jira/GitHub from Ask
- StaffLess chat `send-chat-message` as the Ask path — **unused**. Current Ask is OpenAI tools + catalog APIs. `docs/STAFFLESS-AI.md` still describes the old stream (stale).

**Ops note:** nginx caches Docker DNS. Recreating `api_server` without restarting nginx yields 502 on all catalog routes (observed 4 Sep 2026).

---

## 4. Ask tab (`/ask`)

**Working** text chat over indexed connector documents. Sidebar: directly under Morning Inbox.

### What it does

- Native chat: user/assistant bubbles, timestamps, hover/focus Copy, `AISkeleton` while looking up
- Empty state with three examples: To Do count, “What is RD-3 about?”, breakdown by status
- `POST /api/ask` (Clerk `readonly+`): OpenAI gpt-4o, up to 8 tool rounds, temperature 0.2
- Tools: the seven catalog/search tools in §3.1
- **Verified** badge when catalog tools ran; **Based on search** when `search_indexed_documents` ran; both if mixed; none on failure. Verified is not a correctness guarantee (open/overdue/related rules can still be applied wrong).
- Markdown: DataTable-styled tables, bordered lists, safe links only (no `javascript:`)
- First-turn single-ticket lookups formatted in **code** as Field \| Value; follow-up group/filter/summarize answers stay model prose
- New chat resets session; history of prior turns is sent (capped)
- Errors: generic “couldn’t complete that lookup…” — no internals

### Limitations

- Answers only what Connectors have already indexed
- Date ranges supported via catalog params (not free-form SQL)
- Ask has **no voice** (the Text/Voice pill on screen is global VoiceMic, not Ask)
- Requires `OPENAI_API_KEY` + StaffLess PAT; missing OpenAI → public unavailable message
- Production and local both depend on the VM being reachable (nginx 502 looks like a “couldn’t retrieve” ticket miss)

---

## 5. Admin / settings

### 5.1 `/lifecycle` — **Working**

Ten entity editors: statuses, transitions, role flags. Gates panels on Release, Blocker, Risk, Incident, Dependency, Conflict, Drift (Approval/Sign-off/Alert weaker). Field Locks only on **Release** and **Blocker**. Config is Clerk-user-scoped. Exclusive-role warnings are display-only (not Clerk-enforced).

### 5.2 `/settings`

| Tab | Status |
|-----|--------|
| Appearance | **Working** (theme) |
| Risk Engine | **Working** (bands/cutoffs) |
| Departments / Applications / Environments / Users | **Working** ingest |
| Integrations | **Working** — Voice usage panel |
| General, Notifications, Security | **UI-only** placeholders |
| Team Members | **UI-only** — dummy `teamMembers`, Invite does not persist |

`?tab=release-lifecycle` redirects to `/lifecycle`.

### 5.3 Master data — **Working**

`/departments`, `/applications`, `/users`, `/risk-factors` — browse + APIs. `/admin/reference-data` — generic category/value CRUD used by dropdowns.

**Users vs Clerk:** `/users` is the operational directory (name, email, department, `accessLevel`). Login identity is Clerk. Role resolution: Clerk `publicMetadata.sentinelRole` → DB `accessLevel` → `SENTINEL_DEFAULT_AUTH_ROLE` → fail closed to **readonly**.

### 5.4 `/admin-voice` — **Working** (super-admin)

Daily minute limits, unlimited, ban, extra-minute approvals. Gated (super-admin email). Policy table may be missing until migration — API warns.

---

## 6. UI / UX

### 6.1 Sidebar (from `lib/nav-data.ts`)

1. Morning Inbox, **Ask**, Dashboard  
2. **Release Desk:** Releases, Calendar, Env Booking, Dependencies, Conflicts, Blockers, System Mapping, Integration Flows, Versions & Config  
3. **Governance:** Risk, Drift Dashboard, Approval Queue, Sign-offs, Leave Calendar  
4. **Monitoring:** Monitoring Alerts, Incidents, Application Status, Planned Maintenance  
5. **Portfolio:** Executive, Compare, Insights  
6. **Master Data:** Departments, Applications, Users, Risk Factors  
7. **Lifecycle:** Lifecycle Settings  
8. **Operations:** Knowledge Graph, Agents, History Log, Connectors, Reference Data, Voice Admin, Settings  

Shell: `AppShell` (sidebar, header/search, history trail) + global **ChatPanel** + **VoiceMic**.

### 6.2 Design system (reused)

`StatusBadge` + `statusTokens` (`lib/palette.ts`); `DataTable` / scrollport; `taBtnPrimary`, `taBtnSecondary`, `taInput` (`lib/styles.ts`); `TopBar`; `AISkeleton`; table toolbars/filters; light/dark + color themes.

Ask tables/lists and Verified chips reuse these — not one-off styles.

### 6.3 Other surfaces (honest)

| Surface | Status |
|---------|--------|
| Morning Inbox, Dashboard, Calendar, entity list/detail CRUD | **Working** (DB) |
| Knowledge Graph | **Working UI** — in-app graph of Release Desk records, optional `?release=`; **not** StaffLess/Neo4j |
| Executive, Compare, Insights | **Partial** — dummy portfolio data + some agent calls |
| Agents control room | **Partial** — 13 agents from dummy cards; pause is client store |
| History / Audit Trail (`/history`) | **UI-only** — hardcoded timeline; Filter/Export do not query the DB |
| Floating ChatPanel | **Working** text assistant about Release Desk records (`POST /api/chat`) — separate from Ask |

---

## 7. Voice

**What it is:** Gemini Live (`gemini-3.1-flash-live-preview`) in global `VoiceMic` — mic up, model audio back (that is TTS). Ephemeral token from `/api/copilot/voice/session`. Keyboard **Text** fallback uses the same tools. Not attached to Ask.

### Working

- Connect, listen, spoken reply, reconnect, usage heartbeats
- Navigate every sidebar route + allow-listed detail URLs
- Walkthroughs: critical blockers, readiness, pending approvals, env conflicts, morning check, current page
- Manager reads: release bundle, attention brief, calendar window, compare
- List filters / page context on most entity list pages
- Opt-in screen share for explain-page
- Super-admin Voice Admin + default 10 min/day policy
- Branding strip of “Gemini/Google” in user-visible strings

### Partial

- Propose → confirm **writes** only: set approval decision, acknowledge alert, update blocker, update conflict
- List-row grounding is weak on Dashboard, Executive, Compare, Insights, Knowledge Graph, Agents, History, **Ask**

### Not built / not voice

- Ask tab voice
- ChatPanel voice
- Voice writes for releases, risks, incidents, bookings, etc.

The Text / Voice chrome on `/ask` is the **global** mic, not an Ask input mode.

---

## Snapshot of gaps (do not paper over)

1. Field locks shipped for **Release + Blocker only**.
2. Approvals have **no** spec-reconcile pass.
3. Env Booking has **no** lifecycle graph.
4. Drift **scan** (AV-13) and Alert **TTL** cron are not implemented.
5. Connectors: Jira (live project picker + optional `indexing_start`), GitHub, Teams, and Email (IMAP: folder picker + sender allow-list) create in StaffLess; Jenkins/ServiceNow/SonarQube are not in the wizard; webhook UI unmounted.
6. Ask cannot do graph joins or person identity across sources. Date ranges use catalog params.
7. History page, Settings General/Team/Notifications/Security, and several Portfolio/Agents views are demo or placeholders.
8. `docs/STAFFLESS-AI.md` still says Ask streams StaffLess `send-chat-message` — **false** in current code.

---

## Primary code pointers

| Area | Paths |
|------|--------|
| Sidebar | `lib/nav-data.ts` |
| Release graph | `lib/release-lifecycle-config.ts`, `release-lifecycle-gates.ts`, `release-lifecycle-edit-policy.ts` |
| Field locks | `lib/release-field-lock-engine.ts`, `lib/entity-field-lock.ts` |
| Connectors UI | `app/(main)/connectors/ConnectorsPageContent.tsx`, `lib/connectors/types.ts` |
| StaffLess client | `lib/staffless/client.ts`, `lib/staffless/api.ts` |
| Catalog backend | `onyx-foss/backend/onyx/db/document_count.py`, `document_catalog.py`, `query_backend.py` |
| Ask | `components/ask/AskPageContent.tsx`, `lib/staffless/ask-agent.ts`, `ask-tools.ts`, `ask-format.ts` |
| Voice | `components/voice/VoiceMic.tsx`, `lib/voice/tool-manifest.ts`, `lib/voice/action-types.ts` |
| Auth | `lib/auth/session.ts`, `lib/auth/api.ts` |
