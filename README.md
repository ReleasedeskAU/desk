# Sentinel — Release Command Center

**Sentinel** (also referred to as **Release Desk**) is an AI-assisted release management platform for enterprise release managers. It helps teams plan releases, book test environments, track dependencies and conflicts, manage risk, and monitor portfolio health from a single workspace.

Built for release operations: morning triage → planning → environment readiness → governance → go-live.

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Roles & access](#roles--access)
- [Application routes](#application-routes)
- [Typical workflow](#typical-workflow)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Project structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Sentinel replaces fragmented spreadsheets and chat threads with a shared release desk:

| Capability | What you get |
|------------|----------------|
| **Plan** | Releases, calendar, CAB/prod milestones |
| **Prepare** | Environment booking (Test / UAT / Pre-Prod), conflicts, system mapping |
| **Govern** | Risks (heat map), approvals, drifts, leave calendar |
| **Operate** | Morning inbox, dashboard, monitoring alerts, incidents |
| **Integrate** | Connectors, integration flows, versions & config |

Core operational data (departments, applications, environments, releases, bookings, mappings, risks, and more) lives in **PostgreSQL** (Neon). Auth is handled by **Clerk**. Optional **Redis** (Upstash) caches hot dashboard/inbox reads.

---

## Features

### Release Desk

- **Releases** — Portfolio list with filters, sorting, column preferences, and deep links to release detail
- **Release detail** — Readiness, lifecycle, stakeholders, dependencies map (React Flow)
- **Calendar** — Month / Timeline / Table views for release and CAB events
- **Environment Booking** — Calendar / Timeline (Gantt) / Table views with per-phase bars (Test, UAT, Pre-Prod), CAB/Prod markers, conflict styling
- **Dependencies & Conflicts** — Cross-release and booking conflict queues
- **System Mapping** — Application/environment topology and booking risk analysis
- **Integration Flows** — Flow inventory for release impact
- **Versions & Config** — Environment version matrix (Environment Desk)

### Governance

- **Risk register** — Heat map (Matrix / Bubble / Density), score = Likelihood × Impact, filters into the risk table
- **Risk factors** — Factor catalog for scoring
- **Approvals** — Approval queue
- **Drifts** — Config/version drift tracking
- **Leave calendar** — Coverage against release windows

### Monitoring

- Monitoring alerts, incidents, application status, planned maintenance

### AI & demos

- LLM-backed summaries and agent flows (OpenAI and/or Anthropic)
- Quick Start templates for guided demo scenarios
- Agents control room, insights, knowledge graph, connectors

### UX standards

- Shared **table standard** (filters, manage columns, dual sort, sticky headers)
- Per-page **Help / Know more** documentation popups
- Light and dark themes

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js](https://nextjs.org/) 16 (App Router) |
| Language | TypeScript |
| UI | React 18, Tailwind CSS, Lucide, Framer Motion, MUI (selected surfaces) |
| Charts / graphs | Recharts, React Flow |
| Auth | [Clerk](https://clerk.com/) |
| Database | PostgreSQL via [Prisma](https://www.prisma.io/) + [Neon](https://neon.tech/) |
| Cache (optional) | [Upstash Redis](https://upstash.com/) |
| AI (optional) | OpenAI, Anthropic SDKs |
| Hosting | Vercel-ready |

---

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Next.js app    │────▶│  Clerk (auth)    │     │  Neon Postgres  │
│  (App Router)   │     └──────────────────┘     │  + Prisma       │
│                 │──────── API routes ─────────▶│                 │
│  React UI       │     ┌──────────────────┐     └─────────────────┘
│                 │────▶│  Upstash Redis   │  (optional cache)
└─────────────────┘     └──────────────────┘
         │
         ▼
   OpenAI / Anthropic (optional AI features)
```

- **UI** under `app/(main)/…` and `components/`
- **API** under `app/api/…`
- **Domain logic** under `lib/`
- **Schema & seeds** under `prisma/`

---

## Getting started

### Prerequisites

- Node.js 20+ (recommended)
- npm
- A [Clerk](https://dashboard.clerk.com) application
- A Neon (or other Postgres) database
- Optional: OpenAI / Anthropic keys, Upstash Redis

### Install

```bash
git clone https://github.com/releasedesk/releasedesk.git
cd releasedesk   # or Sentinel — your local folder name
npm install
```

`postinstall` runs `prisma generate`.

### Configure environment

```bash
cp .env.local.example .env.local
```

Fill in at least **Clerk** and **DATABASE_URL** (see [Environment variables](#environment-variables)).

### Database setup

```bash
npm run db:setup
```

This runs `prisma db push` and seeds demo data (`tsx prisma/seed.ts`).

### Run locally

```bash
npm run dev
# or faster Turbopack:
npm run dev:turbo
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Clerk.

---

## Environment variables

Copy from `.env.local.example`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | Default `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | Default `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Recommended | e.g. `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Recommended | e.g. `/dashboard` |
| `DATABASE_URL` | Yes | Neon/Postgres connection string (pooled OK) |
| `DIRECT_URL` | Often yes | Direct Postgres URL for Prisma migrations/`db push` |
| `OPENAI_API_KEY` | Optional | AI summaries / agents |
| `ANTHROPIC_API_KEY` | Optional | Fallback LLM provider |
| `UPSTASH_REDIS_REST_URL` | Optional | Dashboard/inbox cache |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Redis auth |
| `CONNECTOR_ENCRYPTION_KEY` | Optional | AES key for connector credentials |
| `CONNECTOR_ENGINE_URL` | Optional | External connector engine |
| `CONNECTOR_ENGINE_API_KEY` | Optional | Connector engine auth |
| `NEXT_PUBLIC_APP_URL` | Optional | Canonical app URL on Vercel |

Do **not** set `NEXT_PUBLIC_CLERK_JS_URL` unless you self-host Clerk’s browser bundle.

---

## Database

Prisma schema: `prisma/schema.prisma`.

Major models include:

- **Master data** — `Department`, `Application`, `Environment`, `EnvironmentVersion`, `User`
- **Releases** — `Release`, `ReleaseApplication`, `ReleaseDependency`, audit/decision/deployment state
- **Booking & mapping** — `EnvBooking`, `SystemMappingGroup`, `SystemMappingEdge`
- **Governance** — `Risk`, `RiskFactor`, `Approval`, `Drift`, `LeaveRecord`
- **Monitoring** — `MonitoringAlert`, `Incident`, `ApplicationStatus`, `PlannedMaintenance`
- **Integrations** — `Connector`, `ConnectorSyncLog`, `IntegrationFlow`
- **UX prefs** — `UserTablePreference`

### Useful commands

```bash
npm run db:push    # Push schema to the database
npm run db:seed    # Seed demo data only
npm run db:setup   # push + seed
npx prisma studio  # Browse data in the Prisma UI
```

---

## Roles & access

Application roles (enforced in app logic / APIs):

| Role | Capabilities |
|------|----------------|
| **Read only** | View dashboards, releases, calendar, bookings, mapping, risks |
| **Editor** | Create/edit releases, bookings, reference data; promote versions |
| **Admin** | Full editor access plus admin/reference configuration |

Exact Clerk → role mapping depends on your Clerk/org setup and `lib/auth` helpers.

---

## Application routes

### Core operations

| Route | Description |
|-------|-------------|
| `/inbox` | Morning Inbox — daily action queue |
| `/dashboard` | Executive / ops overview |
| `/releases` | Release portfolio |
| `/releases/[id]` | Release command center |
| `/releases/[id]/dependencies` | Dependency graph |
| `/calendar` | Release calendar (Calendar / Timeline / Table) |
| `/booking` | Environment booking (Calendar / Timeline / Table) |
| `/dependencies` | Dependency list |
| `/conflicts` | Conflict queue |
| `/system-mapping` | System mapping |
| `/integration-flows` | Integration flows |
| `/environments` | Versions & config / Environment Desk |

### Governance & monitoring

| Route | Description |
|-------|-------------|
| `/risks` | Risk register + heat map |
| `/risk-factors` | Risk factor catalog |
| `/approvals` | Approval queue |
| `/drifts` | Drift dashboard |
| `/leaves` | Leave calendar |
| `/monitoring-alerts` | Monitoring alerts |
| `/incidents` | Incidents |
| `/application-status` | Application status |
| `/planned-maintenance` | Planned maintenance |

### Master data & admin

| Route | Description |
|-------|-------------|
| `/departments` | Departments |
| `/applications` | Applications |
| `/users` | Users |
| `/admin/reference-data` | Reference data manager |
| `/admin/users` | Admin users |
| `/settings` | Settings |

### AI / demo / portfolio

| Route | Description |
|-------|-------------|
| `/templates` | Quick Start demo scenarios |
| `/agents` | Agent control room |
| `/insights` | AI insights |
| `/executive` | Executive portfolio view |
| `/knowledge-graph` | Knowledge graph |
| `/connectors` | Enterprise connectors |
| `/history` | Audit / history |
| `/compare` | Release comparison |

---

## Typical workflow

```text
Reference data → Releases → Calendar
                    ↓
              Env booking → System mapping → Versions & config
                    ↓
                 Dashboard / Inbox / Risks
```

1. Seed **departments, applications, environments** (Reference Data).
2. Create or import **releases** with dates and stakeholders.
3. **Book** Test / UAT / Pre-Prod windows; resolve **conflicts**.
4. Review **system mapping** and **integration flows**.
5. Track **versions**, **risks**, and **approvals**.
6. Use **Morning Inbox** and **Dashboard** for daily standups.

Step-by-step narrative: **[WORKFLOW.md](./WORKFLOW.md)** (Word: **[WORKFLOW.docx](./WORKFLOW.docx)**).

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server (webpack) |
| `npm run dev:turbo` | Next.js dev with Turbopack |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | ESLint |
| `npm run db:push` | Prisma schema push |
| `npm run db:seed` | Seed database |
| `npm run db:setup` | Push + seed |

---

## Deployment

### Vercel

1. Import the GitHub repository (`releasedesk/releasedesk` or your fork).
2. Framework: **Next.js**.
3. Set environment variables (Clerk, `DATABASE_URL`, `DIRECT_URL`, optional AI/Redis).
4. Deploy.

Ensure Neon allows connections from Vercel and that Clerk allowed origins include your production URL.

### Notes

- Prefer Neon (or similar) for durable production data — do not rely on local SQLite for prod.
- Without LLM keys, AI-heavy pages degrade to static/fallback copy where implemented.

---

## Documentation

| Document | Contents |
|----------|----------|
| [WORKFLOW.md](./WORKFLOW.md) | End-to-end Release Desk workflow |
| [WORKFLOW.docx](./WORKFLOW.docx) | Same workflow for sharing |
| [docs/ENVIRONMENT-DESK.md](./docs/ENVIRONMENT-DESK.md) | Environment Desk deep dive |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |
| [design.md](./design.md) | Design notes |

In-app help: use **Help** / **Know more** on each desk page for page-specific documentation.

---

## Project structure

```text
app/                 # Next.js App Router (pages + API)
  (main)/            # Authenticated product pages
  api/               # REST handlers
components/          # UI components (layout, filters, booking, calendar, …)
context/             # React contexts (e.g. page documentation)
hooks/               # Client hooks (filters, table prefs, …)
lib/                 # Domain logic, auth, filters, scoring, timeline helpers
prisma/              # schema.prisma + seed scripts
docs/                # Extra product docs
public/              # Static assets
```

---

## Contributing

1. Create a feature branch from `main`.
2. Keep UI changes consistent with existing table/filter patterns and dark mode.
3. Run `npm run lint` and smoke-test affected routes locally.
4. Open a PR with a short summary and test notes.

---

## License

See the repository [LICENSE](./LICENSE) file (MIT for the `releasedesk/releasedesk` GitHub project unless otherwise noted).

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
