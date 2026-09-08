# Release Desk — Product capabilities

**Audience:** Client / stakeholder  
**As of:** 5 September 2026  
**Purpose:** A complete, plain-language account of what the platform can do today, including the StaffLess AI engine.

How to read status notes:

- **Fully working today** — teams can use this in daily work.
- **In progress** — a useful slice works now; wider coverage is still being finished.
- **On the roadmap** — intended, not available yet.

Nothing below is described as live if it is only a placeholder screen.

---

## 1. What Release Desk is

Release Desk is the operational home for planning, governing, and shipping software releases. Teams see what is in flight, what is blocked, who must sign off, which environments are reserved, and whether it is safe to go live.

People work through a daily inbox, a portfolio dashboard, detailed registers (releases, blockers, risks, and the rest), and two AI surfaces: **Ask** (questions about work already synced from tools such as Jira) and a **voice assistant** (hands-free navigation and briefings across the desk).

Access is role-based: some people can only view, some can edit, and administrators can configure workflows and master data.

---

## 2. Daily command: Inbox, Dashboard, and Calendar

### Morning Inbox — Fully working today

The usual starting point after sign-in. It surfaces what needs attention now: blocked or at-risk releases, serious incidents, mapping or booking clashes, upcoming go/no-go decisions, and items you own. A short priority list and an AI briefing help you choose the first three actions. Filters narrow the queue (for example blocked items, P1s, or “my releases”).

### Dashboard — Fully working today

A portfolio snapshot for the department, application, or environment you have selected, and for the month, quarter, or year. It shows release counts by status, open serious incidents, items that need attention, and an AI summary. You can open a stuck release from here.

### Release Calendar — Fully working today

One calendar for release dates, CAB meetings, change freezes, and other governance events. Month, timeline, and table views share the same filters and period, so planning around a freeze does not lose context. Clicking a release event opens that release.

---

## 3. Releases — the centre of the desk

### Fully working today

Releases are the master register of everything in flight. Teams can create, edit, filter, and sort releases (including by readiness and open blockers), and open a full command centre for each one.

A release typically moves through a path such as:

**Draft → Planning → Testing → UAT → Pending CAB → CAB Approved → Ready to deploy → Deploying → Deployed → Closed**

There are also paths for real-world interruptions: **Blocked**, **Rolled Back**, **Deferred**, **Rejected**, and **Cancelled**.

What the platform enforces today (defaults; administrators can tailor this):

- You cannot skip ahead if required checks are not met — for example incomplete sign-offs, no environment booked for UAT or deploy, open blockers, unmet hard dependencies, open environment conflicts, unmitigated high risks, or a change freeze.
- **Cancelled** locks the release. Related work cannot be added against it.
- **Closed** keeps the historical record stable.
- **Field locks** can freeze specific fields at chosen stages (for example after CAB), so late edits are controlled.
- When a release is cancelled, related pending approvals can be withdrawn automatically.
- When a release deploys, linked dependencies can be marked resolved; a rollback can put those dependencies back at risk.

Release detail also brings together readiness, blockers, drift, dependencies, approvals, sign-offs, bookings, stakeholder communications, go/no-go, and an activity trail for that release.

**Playbooks and cloning** help editors start a new release from a known pattern.

### In progress

Some older releases still follow the latest organisation-wide workflow rather than a frozen copy of the workflow they started under. Tighter pinning of “this release used this rulebook” is being completed.

---

## 4. Work that sits around a release

Each of the following is a first-class register with its own list, filters, detail page, and (unless noted) a configurable workflow.

### Blockers — Fully working today

Track what is stopping a release: type, severity, owners, age, escalation, root cause, and impact. Statuses include Open, Assigned, In Progress, Pending, Escalated, Resolved, Closed, Cancelled, and Reopened.

- New blockers can be refused once a release is already deploying.
- Resolving a blocker can clear a blocked parent release.
- Stale blockers can raise a monitoring alert.
- **Field locks** are available here as well as on releases — certain fields can be frozen by stage.
- Moving status can require an assignee, a reason, a root cause, or resolution notes.

### Approvals — Fully working today

A single queue for CAB and other gate decisions: Pending, Approved, Approved with Conditions, Rejected, Deferred, Expired, Withdrawn.

- Approvers work their queue; conditions are required when approving with conditions.
- Approved items can expire after a set period if not used.
- Cancelling a release can withdraw open approvals.
- Rejecting an approval can send the linked release back to a defined earlier stage.

**In progress:** automatically routing the *right* approver from risk band (the queue and decisions work; smarter routing is still being expanded). **Field-by-field locks** for approval records are on the roadmap (stage rules already limit what can be edited).

### Sign-offs — Fully working today

The Dev / Test / UAT / Security / Business / Ops checklist (plus dress rehearsal and training when enabled). These live on the release, with a dedicated Sign-offs queue so teams do not hunt through each release.

Statuses: Pending, Approved, Rejected, Approved with Conditions, Withdrawn, Expired. Pending items can expire after a waiting period (training is treated separately). Required types feed CAB and Ready checks; optional types do not block by default.

Approvals (CAB / change-manager requests) and sign-offs (team checklist) are kept distinct on purpose.

### Risk — Fully working today

Qualitative risks per release, scored as likelihood × impact (1–25), with a heat map and bands (Low / Medium / High / Critical). Workflow includes Open, In Progress, Mitigating, Monitoring, Accepted, Closed, and Escalated.

- High and critical open risks can block the path to “Ready to deploy.”
- Risks that sit too long can escalate automatically.
- Moving status can require a score, a mitigation plan for high risk, or documented acceptance.

This is separate from **Risk Factors** (the weighted scoring model used on the release — see Administration).

**In progress:** using that score to automatically choose the approval path.

### Incidents — Fully working today

Production and pre-production incidents (P1–P3) tied to applications and environments. Open serious incidents appear on the Dashboard and Morning Inbox and can block deploy to the affected environments.

Statuses include Active, Acknowledged, Investigating, Escalated, Resolving, Resolved, Closed, and Reopened. Acknowledging typically requires a confirmed responder.

**On the roadmap:** automatic response and resolution clocks (the register and release gates work without them).

### Dependencies — Fully working today

Upstream / downstream links between releases: who is waiting on whom, type, impact, and status (Identified through to Resolved, Removed, or Closed).

- Hard dependencies must be satisfied before certain release moves.
- Adding or removing dependencies can be refused once a release is Ready or later.
- When the upstream release deploys, the dependency can resolve; a rollback can put it at risk again.
- Confirming work in progress can require both sides to have acknowledged.

**In progress:** a richer two-party acknowledgement experience (the rule exists; the day-to-day handshake is still being strengthened).

### Conflicts — Fully working today

Triage for clashes: shared environments, competing slots, resources, maintenance windows, or freeze periods. Statuses include Open, In Progress, Pending Review, Escalated, Resolved, Closed, and Dismissed.

- Date changes on a release can raise a conflict automatically.
- Open environment conflicts can block a release moving forward.
- Dismissing a conflict requires a written justification.
- Review can require an assessment or a higher-authority decision.

### Drift — Fully working today (manual and review workflow)

Records of environment or configuration differences found while validating a release (version gaps, stale data, timeouts, and similar). Teams triage by type and severity and work a path from Open through Investigating, Scheduled, Escalated, Resolved, Closed, or Reverted.

Security-related drift can escalate and raise an alert. Types are governed lookups so reporting stays consistent.

**On the roadmap:** a continuous, automatic scan that finds drift without someone logging it. Today, people (or related events) create the records; the review workflow is live.

### Monitoring alerts — Fully working today

Open signals across applications and environments (threshold breaches, integration failures, reminders, warnings, escalations). Teams acknowledge, investigate, escalate, resolve, suppress, or close them. Stale blockers and certain drift events can create alerts automatically.

**On the roadmap:** automatic time-to-live so old alerts close themselves; tighter default rules for “do not raise the same alert again.”

### Environment booking — Fully working today

Reserve TEST and UAT (and related) windows on shared infrastructure. Overlaps on the same environment are flagged and can become conflicts. Bookings are locked if the parent release is cancelled or already deploying. Release gates can require a booking for UAT or deploy and can reject expired windows.

Booking is a schedule, not a separate status workflow — that is intentional.

---

## 5. How workflows are customised

### Fully working today

**Lifecycle Settings** lets administrators tailor, for each of the ten record types above (except environment booking):

- Which statuses exist and what they are called
- Which moves from one status to another are allowed
- What each status *means* for the rest of the desk (for example: this stage is intake; this stage blocks Ready; this stage withdraws approvals)
- For most types: extra checks that must pass before a move (gates)

**Field locks** (which fields become read-only at which stage) are **fully working today for Releases and Blockers**.

### In progress / on the roadmap

The same field-lock control for approvals, risks, incidents, and the other registers is **on the roadmap**. Those records already follow stage rules (for example, you cannot freely edit a closed item); the detailed per-field matrix is what is still expanding.

---

## 6. Planning the estate: mapping, versions, leave, maintenance

### System Mapping — Fully working today

A workspace for how systems relate: ownership, integration reach, a visual map (focus one system or see all), an editable department-to-department matrix, shared environments, and critical paths. Release-manager notes stay in view. Date-range checks show whether planned bookings collide with mapped dependencies.

### Key Integration Flows — Fully working today

A catalogue of system-to-system flows (source → target), with type, frequency, and purpose — so a release that touches either end does not miss coordinated testing.

**In progress:** linking those system names to the official application catalogue (names are usable today; tighter linking is still being finished).

### Versions & Config — Fully working today

Answers “what is deployed where?” across production, test, and UAT. Teams spot version drift between tiers, see related bookings, and use a topology view of service relationships before CAB.

### Leave and resource availability — Fully working today

Who is away during the planning horizon, which releases lose coverage, and a simple High / Medium / Low coverage risk so CAB is not surprised.

### Planned maintenance — Fully working today

Vendor patches and infrastructure windows that may collide with go-live. Teams filter by type, approval, application, environment, and impact, and treat an approved window in go-live week as a reschedule-or-exemption decision.

### Application status — Fully working today

Point-in-time health per application and environment: Healthy, Degraded, or Down, plus uptime and last-check freshness. Used with incidents and alerts to answer “can we deploy here right now?”

---

## 7. Connectors — bringing work in from other tools

### Fully working today

**Jira**, **GitHub**, **Microsoft Teams**, and **Email (IMAP)** can be connected. Release Desk stores credentials on the server only. Teams set how often to refresh, run **Sync now**, and see connection status (connected, pending, error, or disabled). Email is IMAP, not a native Outlook/Graph connector — many Microsoft 365 tenants block basic IMAP login.

What flows in is the indexed work from those tools — tickets, issues, and related documents (keys, titles, status, assignee, type, priority, parent, due date, and similar). A **Synced work items** list shows what is already in the index. **Ask** answers only from that index.

### In progress / on the roadmap

- **Jenkins, ServiceNow, and SonarQube** appear as future connector types; they are **not live for syncing today**.
- Near-real-time webhook ingest (as opposed to scheduled refresh plus Sync now) is **on the roadmap**.
- A detailed per-connector activity log in the Connectors screen is **in progress**; Sync now and status already tell you whether a run was queued and whether the connection is healthy.

---

## 8. StaffLess AI — the search and facts engine

StaffLess AI is the engine underneath connectors and Ask. It holds a searchable index of work already synced. It does **not** invent tickets, people, or releases that are not in the index.

### Fully working today

| What you can ask for | How it behaves |
|----------------------|----------------|
| Natural-language search | Finds relevant indexed documents and summarises from that sample. Useful for “what do we know about…?” — not for official headcounts. |
| Exact counts | “How many tickets are in To Do?” returns a true count from the index, not a guess from a search snippet. |
| Breakdowns | “Break down tickets by status” (or assignee, type, and other allowed fields). |
| Distinct values | “What statuses exist in the index?” so filters use real stored wording. |
| Ticket lookup | “What is RD-83 about?” returns the stored fields for that exact key. RD-9 is never confused with RD-90. |
| Lists | “Which bugs are assigned to this person and still To Do?” can combine several filters and return ticket IDs. |
| Parent and children | A ticket’s parent is a stored field. Children are other tickets that name that parent. Subtasks are children of a given type. |
| Due date and other dates | The stored due date, created date, and updated date on a ticket can be looked up. |

**What makes answers trustworthy**

- Counts, breakdowns, lists, and key lookups read the index directly. They do not “estimate” from a few search hits.
- Only a published set of fields can be queried (status, assignee, type, priority, parent, dates, and so on). Personal email addresses are never available to Ask.
- If the index has not been synced, the product says so instead of fabricating an answer.
- Combined filters are supported (for example type **and** assignee **and** status).
- Date-range questions (“created in August”, “due before today”) use indexed dates. Open/unresolved means every stored status except Done (until the published resolved list changes).

### On the roadmap

- Automatically recognising that the same person in Jira and GitHub is one person.
- A graph of relationships *across* the search index (the desk already has a visual map of *Release Desk* records; that is a different feature).
- Writing back to Jira or GitHub from Ask.

---

## 9. Ask — the chat for indexed work

### Fully working today

Ask sits near the top of the navigation, under Morning Inbox. It is a professional chat for questions about work already synced.

People can:

- Type a question, or click an example (“How many tickets are in To Do?”, “What is RD-3 about?”, “Break down tickets by status”).
- See a clear **Verified** mark when the answer came from an exact lookup or count, or **Based on search** when it came from a relevance search.
- Read ticket details as a clean field-and-value table, and lists or breakdowns in the same tidy style as the rest of the desk.
- Copy an answer, see quiet timestamps, and start a new conversation.
- Follow a link through to the ticket in the source tool when one is stored.
- Get a plain explanation if a lookup cannot be completed — never an internal error dump.

Ask is available to signed-in viewers as well as editors. It does not use the voice assistant (voice is a separate control on every page).

### On the roadmap

Spoken questions *inside* Ask (today, speak to the voice assistant to move around the desk; type in Ask for index facts).

---

## 10. Voice assistant

### Fully working today

A microphone control is available across the application. People can speak or type a short command and hear a spoken reply.

It can:

- Open any main area of the desk (“open blockers”, “go to the calendar”).
- Run a **morning check** and other short guided tours (readiness, pending approvals, environment conflicts, critical blockers, or “explain this page”).
- Give a briefing: what needs attention, a release bundle, a calendar window, or a comparison of releases.
- Filter and work with lists on the main registers (releases, blockers, risks, and similar).
- Optionally share the screen when asking the assistant to explain what is on the page.

Usage can be limited (for example a daily minutes allowance). An administrator can grant more time, set unlimited use, or turn voice off for someone.

### In progress

Confirming a **change** by voice is available today for a focused set of actions: recording an approval decision, acknowledging an alert, and updating a blocker or a conflict. Each of those still goes through a confirm step. Voice actions for other record types (for example changing a release status) are still being added.

Ask itself is typed, not spoken, as noted above.

---

## 11. In-app assistant (text, about the desk)

### Fully working today

A separate floating chat answers questions about **Release Desk records** — the releases, blockers, and inbox in the product — not the Jira/GitHub search index. Use Ask for indexed tickets; use this assistant for the desk itself.

---

## 12. Administration and settings

### Fully working today

- **Sign-in and roles** — view-only, editor, and administrator. People without a mapped role stay view-only.
- **Lifecycle Settings** — workflows for the ten record types (see §5).
- **Appearance** — light/dark and colour theme.
- **Risk engine** — how risk bands and score cut-offs are calculated.
- **Departments, applications, environments, users** — the catalogues that drive filters, ownership, and bookings. Applications can own environment instances.
- **Risk factors** — the weighted factors behind the release risk score (the model used on release detail).
- **Reference data** — controlled lists (for example drift types) so dropdowns stay consistent.
- **Voice administration** — minutes, bans, and extra-time requests (restricted to designated administrators).
- **Integrations (settings)** — visibility of voice usage against agreed ceilings.

### On the roadmap / not offered as live yet

Workspace-wide notification preferences, a standalone security-settings console, and an in-product “invite team members” roster are **not** presented as finished capabilities. Access today is through sign-in roles and the Users directory.

---

## 13. Portfolio and insight views

### Fully working today for day-to-day operations

Dashboard, Morning Inbox, the Releases register, and each release’s own command centre are the operational source of truth.

### In progress

**Executive**, **Compare**, and **Insights** are available as portfolio and storytelling views (heatmaps, side-by-side releases, trend-style readouts). They are suitable for walkthroughs and planning conversations. Teams should treat Inbox, Dashboard, and live registers as the system of record for daily decisions while these views continue to be aligned to the same live desk.

**Agents control room** shows the family of assistants used in briefings and on release detail (risk, communications, and others). Individual agents already contribute on Inbox and release pages. A full “control room” for pausing and inspecting every assistant as a live operations console is **in progress**.

**Knowledge Graph** is an interactive map of how Release Desk records relate (releases, services, people). It is useful for exploration. It is not the StaffLess ticket index, and it is not required for Ask.

A standalone **History / audit** page for the whole portfolio is **on the roadmap**. Each live release already keeps its own activity trail on the release page.

---

## 14. What the platform deliberately will not do (yet)

Stated so expectations stay clear:

- Ask will not invent work that has not been synced.
- Ask will not guess a count from a few search results when an exact count is available — and it will say so if a lookup cannot be completed.
- Ask will not invent a “closed” status that is not on the published resolved list (today: Done only).
- Ask will not change Jira or GitHub tickets.
- Cancelled releases stay locked.
- Personal email addresses from source tools are not exposed in Ask.

---

## 15. Typical day on the desk (how the pieces fit)

1. Open **Morning Inbox** — act on blocked releases, serious incidents, and your owned work.  
2. Check the **Calendar** and **Environment bookings** before committing a date.  
3. Use **System Mapping** and **Integration Flows** if the change crosses systems.  
4. Clear **Blockers**, **Conflicts**, **Risks**, and **Sign-offs** before CAB.  
5. Record **Approvals**; confirm **Application status** and open **Incidents**.  
6. Ask **Ask** for facts from Jira/GitHub that are already synced (“how many in To Do?”, “what is RD-83?”, “break down by status”).  
7. Use **voice** to move around the desk or take a morning briefing without taking hands off a standup.

---

*This list describes capabilities that exist in the product as of 5 September 2026. Items marked in progress or on the roadmap are included so the picture stays complete and honest.*
