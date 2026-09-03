# ReleaseDesk Everywhere — MVP Deck Builder Brief

**Audience:** Release managers  
**Data as of:** Seeded PostgreSQL (Neon), verified 2026-06-27  
**Demo login:** `priya@company.com` (admin) — use **Year** period filter on Dashboard / Morning Inbox for full portfolio counts

---

## 1. One-line pitch

**ReleaseDesk Everywhere is a release command center that gives release managers one place to track every production change, spot environment conflicts before they block a window, and get AI-assisted briefings on risk, approvals, and stakeholder comms — instead of chasing spreadsheets, calendars, and Slack threads.**

---

## 2. The problem it solves

| Pain today (manual) | With ReleaseDesk Everywhere (before → after) |
|---|---|
| **Release tracking** — status scattered across Jira, ServiceNow, email, and team trackers; no single view of “what’s shipping when.” | **Before:** 80 releases tracked in 6+ tools. **After:** One Releases list with status, readiness %, blockers, department, and linked applications — filterable by dept/app/env and period. |
| **Environment booking** — double-bookings discovered days before prod when two teams need the same Test/UAT slot. | **Before:** Email chains and shared Excel grids. **After:** 80 env bookings across 504 environments; **26 auto-flagged conflicts** (release + booking level) surfaced in a dedicated Conflicts queue. |
| **Conflict detection** — manual calendar comparison across Finance, CRM, Logistics teams. | **Before:** “We didn’t know until standup.” **After:** System flags overlapping env windows (e.g. REL-0001 Kyriba vs REL-0003 Zendesk both need FIN-TEST-01 / FIN-UAT-01). |
| **Dependencies** — upstream/downstream release chains tracked in Confluence or not at all. | **Before:** Blockers discovered at CAB. **After:** **26 mapped dependencies** with type (Hard/Soft/Technical), status (Clear / Blocked / At Risk), and impact if blocked. |
| **Risk management** — risk registers in PowerPoint; scoring inconsistent. | **Before:** Subjective “gut feel” before go-live. **After:** **31 scored risks** on a 5×5 heat map (likelihood × impact); **13 high/critical** (score ≥ 12). |
| **Drift detection** — env parity (UAT vs Prod DB version, config, test data) checked ad hoc. | **Before:** Production surprises after “green” UAT. **After:** **7 tracked drifts** with severity, remediation, and ETA (e.g. Oracle 18c UAT vs 19c Prod on AVEVA release). |
| **Approvals / CAB** — chasing sign-offs via email; no queue view. | **Before:** “Who’s still pending Security?” **After:** **27 approval records** across Tech / Security / Business gates, linked to releases and CAB meetings. |
| **Calendar / portfolio view** — release dates in Outlook + team calendars. | **Before:** No cross-team visibility. **After:** **166 calendar events** tied to releases, bookings, CAB dates, and leave — unified Calendar view. |
| **Morning triage** — RM starts day reading 10 dashboards. | **Before:** 30–60 min manual scan. **After:** Morning Inbox prioritizes blocked releases, P1 issues, approaching undecided releases, mapping gaps, and pending approvals — with optional AI briefing. |

---

## 3. Core features — with real numbers

### Release Tracking
- **What it does:** Master list of all production changes with status lifecycle (Draft → Planning → Testing → Pending CAB → Approved → Blocked), readiness %, blockers, priority, impact, and department/application scope. Drill into a release command center for lifecycle strip, blockers, linked work items, and next-best actions.
- **Data point:** **80 releases** tracked across **8 departments** and **84 applications** (release dates span **2026-06-29 → 2027-06-08**).
- **Status breakdown:** Draft 63 · Planning 8 · Testing 3 · Approved 4 · Pending CAB 1 · Blocked 1.
- **Dashboard (Year filter):** 34 planned · 8 in progress · 1 blocked (43 releases in current year window).
- **Example record:** **REL-0001 — Kyriba UI Tweak v4.5** (Finance / Kyriba) — Status: **Blocked**, Readiness **75%**, Blockers: *"Environment conflict with REL-0003; awaiting conflict resolution meeting"*, Change Freeze: Quarter-End Freeze.

### Environment Booking
- **What it does:** Schedules Test, UAT, and Pre-Prod windows per release and application; flags overlapping bookings on shared env codes.
- **Data point:** **80 env bookings** across **504 environments** (6 env types × 84 apps).
- **Example record:** **ENV-0001** — REL-0001 / Kyriba — Test **FIN-TEST-01** (Jun 23–25), UAT **FIN-UAT-01** (Jun 26–27), Pre-Prod **FIN-PREPROD-01** (Jun 28) — **⚠ CONFLICT** flagged.

### Conflict Detection
- **What it does:** Surfaces releases and bookings where the same environment codes overlap in time — the #1 cause of last-minute release slips.
- **Data point:** **26 conflict-flagged releases** + **26 conflict-flagged bookings** (52 total conflict signals in seed data).
- **Example pair:** **REL-0001 Kyriba UI Tweak v4.5** vs **REL-0003 Zendesk Minor Update v4.3** — both require **FIN-TEST-01** and **FIN-UAT-01**; REL-0001 is Blocked, REL-0003 blocker text: *"Shared UAT env with REL-0001; QA sign-off pending"*.

### Risk Management
- **What it does:** Risk register with 5×5 heat map, scored risks (likelihood × impact), mitigation owners, and status tracking (Open / Monitoring / Mitigating / Escalated / Accepted).
- **Data point:** **31 risks** scored; **13 at high/critical** (score ≥ 12).
- **Example record:** **RSK-001** — REL-0001 Kyriba — Category: Resource — *"QA Lead (Sam Anderson) on leave during release window"* — Likelihood 4 × Impact 3 = **Score 12** — Status: Monitoring — linked to Leave Calendar LV-001.

### Drift Detection
- **What it does:** Tracks environment parity gaps (infra, config, data) that can invalidate test results before production.
- **Data point:** **7 drifts** logged across Test / UAT / Pre-Prod.
- **Example record:** **DFT-001** — REL-0004 AVEVA Dashboard Upgrade v5.5 — UAT running **Oracle 18c** while Prod is **Oracle 19c** — Severity **High** — *"Dashboard queries will fail in Prod if not addressed"* — Status: In Progress, ETA Jul 7.

### Approvals / CAB Workflow
- **What it does:** Approval queue by gate type (Tech Review, Security Review, Business Review) with approver, decision, comments, and CAB meeting linkage.
- **Data point:** **27 approval records** across releases.
- **Example record:** **APR-0002** — REL-0001 Kyriba — **Security Review** — Approver: Kendall Kim (Security Analyst) — Decision: **Pending** — CAB Meeting **CAB-1**.

### Dependency Mapping
- **What it does:** Directed release-to-release dependencies with type, status, and impact-if-blocked narrative.
- **Data point:** **26 release dependencies**.
- **Example record:** **DEP-002** — **REL-0013 Dynatrace UI Tweak v3.1** depends on **REL-0012 Plex Report Fix v2.5** — Type: Soft — Status: **Blocked** — Impact: Partial Functionality — Notes: *"Shared database schema changes"*.

### System Mapping
- **What it does:** Interactive department/application integration graph (React Flow) built from the enterprise integration matrix — shows primary app per department and cross-dept data flows.
- **Data point:** **1 mapping group**, **56 integration edges** (8 departments: Finance, Logistics, CRM, Manufacturing, IT, HR, Legal, Security).
- **Example:** Finance (Kyriba) ↔ CRM (Salesforce) integration edge on Test environment — visible on the System Mapping graph with department nodes and directional flows.

### AI Agents
- **What it does:** 13 specialized LLM agents that analyze release context and produce plain-English briefings, risk flags, comms drafts, and Q&A — grounded in live database context where wired.
- **Data point:** **13 agents** available; core `/api/agent` endpoint tested against all roles when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set.
- **Example:** On **REL-0001** release detail → **Risk Agent** analyzes real DB context (readiness, blockers, bookings, dependencies) and returns structured risk flags with citations.

---

## 4. AI / Agent capabilities

All 13 agents share the `/api/agent` endpoint (OpenAI GPT-4o primary, Anthropic Claude fallback). **Demo-readiness** reflects where the product UI actually calls live AI with meaningful context — not just the Agents gallery page.

| # | Agent | One-line purpose | Demo-ready? |
|---|---|---|---|
| 1 | **Ticket Agent** | Summarizes open linked tickets/stories blocking release progress. | **API yes** — UI on `/agents` only; uses **synthetic** demo release context, not DB releases. |
| 2 | **Build Agent** | Explains CI/CD build failures in plain English. | **API yes** — UI wired on **synthetic** release detail only (`rel-v2140` etc.), not DB releases. |
| 3 | **Approval Agent** | Drafts nudge messages for overdue approval gates. | **API yes** — UI on **synthetic** release detail only. |
| 4 | **Dependency Agent** | Warns about cross-service blast radius from dependency graph. | **API yes** — structured JSON mode; UI on `/agents` with synthetic org context. |
| 5 | **Risk Agent** | Scores and explains release risk from readiness, blockers, bookings, dependencies. | **✅ Demo-ready** — live on **DB release detail** (`DbAIRiskPanel`) with real `/api/releases/{id}/ai-context`; also on dashboard risk hover. |
| 6 | **Summary Agent** | Writes executive digest paragraph across portfolio. | **API yes** — **no live UI trigger** on operational pages; `/agents` page shows static sample findings only (`liveAi: false`). |
| 7 | **Conversation Agent** | Free-text Q&A over full release portfolio with citations. | **✅ Demo-ready** — global **Chat panel** (`/api/chat`) loads **full PostgreSQL context** + optional web search; also powers **Morning Inbox AI briefing** (Conversation Agent via `/api/agent` with real inbox context). |
| 8 | **Comms Agent** | Drafts stakeholder update emails/posts for a release. | **✅ Demo-ready** — live on **DB release detail** (`StakeholderCommsPanel`) using real release + command-center + impact data. |
| 9 | **CAB Agent** | Produces CAB briefing narrative (CR numbers, risk tier, backout). | **API yes** — `/agents` gallery only; synthetic sample findings. |
| 10 | **Deploy Agent** | Summarizes deployment readiness and rollout status. | **API yes** — `/agents` gallery + synthetic release deployment monitor only. |
| 11 | **Security Agent** | Summarizes open security gates and vuln scan status. | **API yes** — `/agents` gallery only; synthetic context. |
| 12 | **SLO Agent** | Comments on error budgets, latency, monitoring health. | **API yes** — `/agents` gallery only; synthetic context. |
| 13 | **Runbook Agent** | Flags missing/outdated runbooks before ship. | **API yes** — `/agents` gallery only; synthetic context. |

**Safe demo script (live AI + real data):**
1. Morning Inbox → expand AI briefing (Conversation Agent, DB-backed).
2. Open **REL-0001** → Command Center → **Run Risk Analysis** (Risk Agent).
3. Same page → **Generate comms draft** (Comms Agent).
4. Global chat → *"What releases are blocked and why?"* (Conversation Agent, full DB).

**Do not demo as live:** Agents gallery sample findings (v2.14.0 / PLAT-4418 narrative), Executive/Insights ML forecasts, Go/No-Go buttons on synthetic releases, connector sync activity.

---

## 5. Tech stack slide

Logos/names for a non-technical exec slide:

| Layer | Technology |
|---|---|
| **Application** | Next.js (React) — modern web app |
| **Database** | PostgreSQL (Neon cloud) |
| **ORM / data** | Prisma |
| **Cache** | Redis (Upstash) — dashboard & inbox performance |
| **AI** | OpenAI (GPT-4o) · Anthropic Claude (fallback) |
| **UI** | Tailwind CSS · Material UI · Lucide icons |
| **Graphs / viz** | React Flow (system map) · Recharts (charts) |
| **Hosting** | Vercel |

---

## 6. Architecture in plain English

**Paragraph:**  
ReleaseDesk Everywhere stores all release, booking, risk, approval, and calendar data in a central PostgreSQL database (seeded from your release workbook). When a release manager opens the app, Next.js pages fetch that data through secure API routes, apply filters (department, application, time period), and render dashboards, queues, and detail views. Optional Redis caching keeps the Morning Inbox and Dashboard fast under load. When AI is invoked — chat, inbox briefing, risk analysis, or comms drafts — the app first assembles a JSON snapshot of the relevant database records (releases, blockers, bookings, conflicts, risks) and sends it to OpenAI with strict instructions to ground answers only in that data. The response flows back to the UI as plain-English text, structured risk flags, or draft communications. No AI agent writes back to the database autonomously in this MVP; humans remain in the loop for decisions.

**Diagram-able structure (left → right):**

```
[Release Workbook / Seed Data]
        ↓
[PostgreSQL (Neon)] ←—— CRUD via Prisma ——→ [Next.js API Routes]
        ↓                                              ↓
[Redis Cache] (optional, 60s TTL)              [React UI Pages]
        ↓                                              ↓
   Dashboard / Inbox                           Release Manager
                                                      ↓
                                              [AI Layer: OpenAI]
                                         (context built from DB)
                                                      ↓
                                    Briefings · Risk flags · Comms drafts · Chat
```

---

## 7. What's real today vs. what's roadmap

### ✅ Real — running on seeded PostgreSQL data

| Area | Route | Notes |
|---|---|---|
| Morning Inbox | `/inbox` | DB-backed items, sections, counts; AI briefing uses live inbox context |
| Dashboard | `/dashboard` | DB release counts by status; use **Year** period |
| Releases list | `/releases` | **80 DB releases only** (demo releases removed from list) |
| Release detail | `/releases/{db-uuid}` | Command center, blockers, readiness, Comms + Risk AI panels |
| Calendar | `/calendar` | 166 events from DB |
| Env Booking | `/booking` | 80 bookings from DB |
| Dependencies | `/dependencies` | 26 dependencies from DB |
| Conflicts | `/conflicts` | 26+26 conflict-flagged releases/bookings |
| System Mapping | `/system-mapping` | 56 edges from seed matrix (graph is real DB edges; node badges use decorative mock metadata) |
| Versions & Config | `/environments` | 180 environment version records |
| Risk Register | `/risks` | 31 risks + heat map |
| Drift Dashboard | `/drifts` | 7 drifts |
| Approval Queue | `/approvals` | 27 approvals |
| Leave Calendar | `/leaves` | 30 leave records |
| Admin — Reference Data | `/admin/reference-data` | Live CRUD on departments, apps, envs |
| Admin — Users | `/admin/users` | 100 seeded users |
| Global Chat | Chat panel (all pages) | Full DB context via `/api/chat` |
| Search | Header search | Merges DB + demo results (demo hits are synthetic) |

### ⚠️ Partially real

| Area | Route | Honest description |
|---|---|---|
| Unified overview API | `/api/unified/overview` | Merges DB + demo counts — **avoid citing merged totals in deck**; use DB-only counts above |
| System Mapping node tooltips | `/system-mapping` | Graph edges are real; per-node env codes/status strings are **generated mock decoration** |
| Release detail (synthetic IDs) | `/releases/rel-v2140` etc. | Separate **demo release** with Build Agent, Approval Agent, Go/No-Go — **not in seeded DB** |
| History / Audit Trail | `/history` | **Static UI mockup** — light theme, hardcoded timeline, not wired to DB |
| Connectors | `/connectors` | **Static UI mockup** — Jira/ServiceNow/Harness cards are visual only; dashboard reads `connectorSync` table but connectors page itself is not live |
| Settings | `/settings` | Team list from dummy data |

### 🚧 Roadmap / synthetic — say "in development" or "vision demo"

| Area | Route | Notes |
|---|---|---|
| Executive Dashboard | `/executive` | 100% dummy-data portfolio narrative |
| Compare Releases | `/compare` | Synthetic release comparison |
| Insights / Analytics | `/insights` | Dummy historical trends + ML predictions |
| Knowledge Graph | `/knowledge-graph` | Dummy services/teams graph |
| Agents Gallery | `/agents` | Agent **metadata + sample findings** from dummy-data; expand-to-analyze uses synthetic org context for most agents |
| Go/No-Go / Deployment AI | synthetic release routes | `/api/releases-ai/*` — dummy releases only |
| Real connector integrations | — | No live Jira/ServiceNow/Argo sync in MVP |
| Autonomous agent actions | — | Agents advise only; no auto-booking, auto-approval, or auto-deployment |

---

## 8. Screenshots needed

Capture in this order (log in as `priya@company.com`, set period to **Year** where applicable, dark theme recommended):

| # | Page | URL | What to frame | Why |
|---|---|---|---|---|
| 1 | **Morning Inbox** | `/inbox` | Top CRM widgets + inbox table with "Blocked & at risk" section; expand AI briefing if key is set | Shows daily RM workflow + AI |
| 2 | **Releases** | `/releases` | Full table showing REL-0001 (Blocked) and status mix | Core portfolio view — 80 releases |
| 3 | **Conflicts** | `/conflicts` | REL-0001 vs REL-0003 conflict rows with FIN-TEST-01 / FIN-UAT-01 | Highest-impact "aha" for RMs |
| 4 | **System Mapping** | `/system-mapping` | Full graph with 8 department nodes and integration edges | Visual wow — enterprise breadth |
| 5 | **Risk Register** | `/risks` | 5×5 heat map + RSK-001 row (score 12) | Governance / scoring story |
| 6 | **Release Command Center** | `/releases/{REL-0001-uuid}` | Lifecycle strip, readiness gauge 75%, blockers, Risk Agent panel | Tie AI to a real blocked release |

**Optional 7th:** `/booking` — ENV-0001 row with CONFLICT flag, or `/dependencies` showing DEP-002 (Blocked).

**Tip:** REL-0001 UUID — navigate from Releases list click-through (don't hardcode UUID in deck).

---

## 9. Metrics / numbers summary box

Copy-paste headline box for a "By the Numbers" slide:

```
┌─────────────────────────────────────────────────────────┐
│  SENTINEL MVP — BY THE NUMBERS (seeded portfolio)       │
├─────────────────────────────────────────────────────────┤
│  80 releases tracked     │  84 applications             │
│  100 users               │  8 departments               │
│  504 environments        │  80 env bookings             │
│  52 conflict signals     │  31 risks scored (13 high+)  │
│  26 dependencies mapped  │  7 environment drifts        │
│  27 approval gates       │  166 calendar events         │
│  13 AI agents            │  56 system integration edges │
└─────────────────────────────────────────────────────────┘
```

**Sub-bullets for speaker notes:**
- 1 release currently **Blocked** (REL-0001 Kyriba)
- 43 releases in the **2026 calendar year** view (34 planned · 8 in progress)
- Release date horizon: Jun 2026 → Jun 2027
- 3 live AI touchpoints on real data: **Chat**, **Risk Agent**, **Comms Agent** (+ Inbox briefing)

---

*Document generated from codebase audit + live DB verification (`prisma/verify-counts.ts`, `prisma/audit-status.ts`).*
