# Environment Desk

Enterprise release calendar, environment booking, system topology, version matrix, and application configuration — unified in a single portfolio view for release managers.

**Route:** `/environments`  
**Navigation:** Portfolio → Environment Desk

---

## Purpose

Environment Desk answers four questions release managers ask daily:

1. **When** are releases scheduled, and how big is the blast radius?
2. **Who** has shared environments booked (SAP, FIN, Oracle, CRM)?
3. **What version** is running in DEV vs TEST vs PROD — and is anything drifting?
4. **What must pause** (queues, DB, apps) during an enterprise release window?

All views are **derived from the same synthetic release train** used elsewhere in ReleaseDesk Everywhere (`lib/dummy-data.ts`), so timeline, bookings, versions, and impact stay consistent with `/releases`, `/calendar`, and `/executive`.

---

## Panels

| Panel | Description | Primary data source |
|-------|-------------|---------------------|
| **Metrics strip** | Timeline count, booked envs, version drift, promotion gaps, active impacts | `buildEnvironmentDeskStats()` |
| **Briefing** | Auto-generated status paragraph for standups / CAB | Stats + drift apps |
| **Release timeline** | Gantt-style calendar with Dept / Size / Impact filters and Today marker | Non-shipped releases (120-day horizon) |
| **System mapping** | React Flow topology (TEST SAP → UAT / DEV Oracle → apps) | `services` + release dependencies |
| **Environment booking** | Monthly slots per system (IDLE / BOOKED / MAINTENANCE) | Releases mapped by team → system |
| **Current version** | Application × DEV / TEST / PROD with promotion % | `buildEnvironmentPromotions()` |
| **Application env config** | Cluster, pipeline, namespace, firewall, network zone | `Release.deployment` |
| **Application config** | Base URL, API URL, feature flags | Release build state + LaunchDarkly connector |
| **Enterprise release impact** | Prerequisites and operational conditions | Change records, freeze windows, risk tier |

---

## Synthetic data mapping

Data is built at runtime by `buildEnvironmentDesk()` in `lib/enterprise-env-data.ts`.

### Team → enterprise mappings

| Release team | Department | Booking system | Application |
|--------------|------------|----------------|-------------|
| Billing, Payments | FIN | FIN | FIN |
| Platform, Core | Platform | SAP | SAP |
| Search, Mobile | CRM | CRM | CRM |
| Identity | Security | Security Core | Security Core |
| Data | Operations | Oracle | Oracle |

### Timeline rules

- Includes releases with `status !== "Shipped"` within a 14-day lookback and 120-day forward window (max 12 entries).
- **Size:** `high` if files changed > 800 or Blocked; `medium` if > 250; else `low`.
- **Impact:** derived from critical service dependencies, change-record risk tier, and release status.
- **Window:** start = target date minus duration (14 / 7 / 4 days by size); end = target date + 2 days.

### Environment booking rules

- Five rolling months × four systems (SAP, FIN, Oracle, CRM).
- **BOOKED** when a non-shipped release from the mapped team falls in that calendar month.
- **MAINTENANCE** — synthetic Oracle slot in month +2.
- Contact and purpose come from the matched release owner and name/version.

### System mapping rules

- Maps microservices to enterprise environment labels (e.g. `api-gateway` → TEST SAP, `billing-worker` → FIN Application).
- **Health:** `critical` if unstable or Sev-1 incident; `warning` if Critical + recent incidents; else `healthy`.
- Animated edges indicate environment links or non-healthy nodes.

### Version matrix rules

- One row per application (latest release per team group).
- DEV / TEST / PROD from `buildEnvironmentPromotions()` for region `ap-southeast-2`.
- **Drift** when DEV or TEST ≠ PROD; **promotion %** = 33 / 66 / 100.

### Impact rules

- Built from releases with change records or At Risk / Blocked status (up to 6).
- **Conditions** scale with change risk tier (Critical → all five conditions; Medium → queues + events).
- **Active** when scheduled start is within ±48 hours of now.

---

## Cross-panel interaction

Selecting an item in one panel updates related panels:

| Action | Effect |
|--------|--------|
| Click timeline bar | Highlights bar; sets app filter (FIN / CRM / SAP); links to `/releases/[id]` |
| Click system map node | Shows service detail footer; sets app filter |
| Click version matrix row | Selects app; highlights booking + config tabs |
| Timeline / matrix links | Open release command center |

---

## File structure

```
app/(main)/environments/page.tsx     # Page shell, briefing, cross-panel state
components/environments/
  EnvironmentDeskMetrics.tsx         # Top metric cards
  ReleaseTimeline.tsx
  SystemMappingView.tsx
  EnvBookingTable.tsx
  VersionMatrix.tsx
  AppEnvConfigTable.tsx
  AppConfigTable.tsx
  EnterpriseReleaseImpactPanel.tsx
lib/enterprise-env-data.ts           # Synthetic builders + re-exports
lib/types.ts                         # EnvironmentDeskSnapshot, stats, entry types
```

### Public API

```typescript
import { buildEnvironmentDesk } from "@/lib/enterprise-env-data";
import { releases, services } from "@/lib/dummy-data";

const desk = buildEnvironmentDesk(releases, services);
// desk.timeline, desk.bookings, desk.systemNodes, desk.versions,
// desk.envConfigs, desk.appConfigs, desk.impacts, desk.stats
```

Individual builders are also exported: `buildReleaseTimeline`, `buildEnvBookings`, `buildSystemMapping`, `buildApplicationVersions`, etc.

---

## Demo scenarios

1. **Portfolio scan** — Open `/environments`, read metrics + briefing, filter timeline by FIN + high impact.
2. **Booking check** — Select SAP tab; see FIN SIT/UAT months BOOKED with owner contact; click version link.
3. **Drift hunt** — Version matrix shows promotion bar < 100%; open linked release to inspect promotion strip on detail page.
4. **Topology risk** — Click payments / FIN nodes; red or pulsing ring = unstable or incident history.
5. **CAB prep** — Enterprise impact panel lists CR numbers, pending gates, and pause conditions.

Quick Start template: **Environment desk** (`/templates` → Planning).

---

## Limitations (demo prototype)

- No live SAP, ServiceNow, or real env-booking API — all data is synthetic.
- Bookings are inferred from release target dates, not a separate reservation system.
- Feature flags reflect release/build state + connector status, not a live flag store.
- `buildEnvironmentDesk()` is called once on page load; live `localStorage` release-store changes are not yet merged into the desk snapshot.

---

## Future integration points

| Source | Would feed |
|--------|------------|
| CMDB / env booking tool | `EnvBooking` rows |
| Deployment pipeline | Version matrix live promotions |
| Config / secrets store | App env config + feature flags |
| Change management (ServiceNow) | Impact prerequisites |
| Service mesh / APM | System map health |

---

## Related routes

- `/releases/[id]` — Release command center (Go/No-Go, deployment, CAB)
- `/calendar` — Month grid with freeze windows
- `/releases/[id]/dependencies` — Per-release service dependency map
- `/executive` — Portfolio risk and ML forecasts
