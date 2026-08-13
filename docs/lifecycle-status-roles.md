# Lifecycle status roles (Wave 0 contract)

Runtime enforcement must not compare a stored status to a hardcoded name or
default key (`"open"`, `"resolved"`, `"deploying"`). Meaning lives on **flags
on the live (or pinned) status object** and on **gates attached to transitions**.

This file is the contract. Settings labels are in `lib/lifecycle-status-roles.ts`
(`STATUS_ROLE_FIELDS`) — do not show raw flag ids as the only explanation.

## Rules

1. Read flags from the caller’s / release’s lifecycle config, not `createDefault*`.
2. Prisma `in` / `notIn` lists are **labels derived from flags**, via
   `enabledStatusLabelsWhere`.
3. One-of roles (`uniqueness: "one"`) must have exactly one enabled status.
   Crons and cascades **fail loudly** (`LIFECYCLE_ROLE_MISSING` /
   `LIFECYCLE_ROLE_AMBIGUOUS`) instead of skipping.
4. New automations add a flag here first. Do not add `fromKey === "…"`.

## Flags

| Flag | Settings label | Uniqueness | Entities |
|---|---|---|---|
| `isIntake` | Starting status | one | All lifecycle entities |
| `blocksReleaseReady` | Blocks the release from going Ready | many | Blockers |
| `blocksLinkedRelease` | Blocks the linked release from deploying | many | Incidents |
| `satisfiesHardGate` | Counts as a met hard dependency | many | Dependencies |
| `escalateTarget` | Auto-escalate lands here | one | Risks, Drifts |
| `unblocksParent` | Unblocks the release when entered | one | Blockers |
| `withdrawApprovalsOnEnter` | Withdraw open approvals when entered | one | Releases |
| `readyMilestone` | Ready-to-deploy milestone | one | Releases |
| `deployingMilestone` | Deploying milestone | one | Releases |
| `deployedMilestone` | Deployed milestone | one | Releases |
| `staleAlertDays` | Stale after (days) | many | Blockers |
| `escalateAfterDays` | Escalate after (days) | many | Risks |
| `isWithdrawn` | Withdrawn when the parent release is cancelled | one | Approvals |
| `writesCabScopeSnapshot` | Write CAB scope snapshot when entered | one | Releases |
| `clearsCabScopeSnapshot` | Clear CAB scope snapshot when entered | one | Releases |
| `requiresConditions` | Requires conditions text when entered | many | Approvals |
| `revertsLinkedReleaseOnEnter` | Revert the linked release when entered | one | Approvals |
| `approvalRejectLanding` | Landing status after an approval rejection | one | Releases |

Already on the status object and still valid: `terminal`, `editMode`,
Release `kind`, Sign-off `countsAsComplete`, Approval/Sign-off `expiryDays`.

## Default graph (enterprise)

- Release: Draft = starting; Ready to deploy / Deploying / Deployed = milestones;
  Cancelled = withdraw approvals; CAB Approved writes the scope snapshot;
  Pending CAB clears it; Planning = landing after an approval rejection.
- Blocker: Open = starting; Open–Reopened (non-resolved terminals) keep
  `blocksReleaseReady` as today; In Progress `staleAlertDays = 5`; Resolved =
  unblocks parent.
- Incident: Open = starting; Open, Investigating, Escalated, Resolving, Reopened
  = block linked release.
- Dependency: Pending = starting; Met / Waived / Removed = hard-gate satisfied.
- Risk: Identified = starting; Identified/Assessing escalate after 3 days;
  Escalated = auto-escalate target.
- Drift: Detected = starting; Escalated = auto-escalate target (AV-14).
- Conflict / Alert / Sign-off: first working status = starting.
- Approval: Pending = starting; Withdrawn = CASC-13 landing; Approved with
  Conditions requires conditions text; Rejected reverts the linked release.

## Persistence

JSON-snapshot entities store flags on the status object in the version blob.
Release head tables do not have role columns; flags are merged from the latest
`UserReleaseLifecycleConfigVersion` snapshot on load (that snapshot is the
validated graph written on every save).

## Wave map

- Wave 0: this contract + Settings editors (shipped).
- Wave 1: fact builders + VR-13 using `isIntake` / `blocksLinkedRelease` / etc. (shipped).
- Wave 2: cascades + crons using exclusive roles; loud missing-role errors (shipped).
- Wave 3: guards + UI graphs; CAB snapshot via `writesCabScopeSnapshot` /
  `clearsCabScopeSnapshot` (shipped).
- Wave 4: persist `statusKey` (Approval: `decisionKey`) on create/status-change;
  aliases resolve at the import/create/PATCH boundary then we store key + label.
