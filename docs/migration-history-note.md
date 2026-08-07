# Migration history note — baseline reconciliation (2026-08-07)

## What happened

Three migrations were applied directly to production Neon on **2026-07-02**,
outside of what this repository tracks:

| migration_name (as stored in `_prisma_migrations`) | Applied (UTC) |
|----------------------------------------------------|---------------|
| `0_init` | 2026-07-02 |
| `20260702162759_align_legacy_tenancy` | 2026-07-02 |
| `20260702133852_onboarding_and_clone_provenance` | 2026-07-02 |

Their original SQL could **not** be recovered. Checked:

- Git history (this monorepo / vendor package)
- GitHub remote history
- Neon point-in-time recovery — project retention is **6 hours**, far short of July 2

The person believed to have run them (Mohd Kabir) no longer has the files or
reliable detail of the contents.

## Decision (2026-08-07)

We are **not** reconstructing the missing SQL. We treat the **current live
database** as the trusted physical starting point, and resume trustworthy
migration history from:

`20260807120000_baseline_post_reconciliation`

That migration records the live `Organization` table in Prisma (idempotent
`CREATE IF NOT EXISTS`). It does **not** invent the lost July 2 SQL.

Neon undo snapshot taken before this work:

- Branch: `backup-pre-baseline-2026-08-07` (`br-long-pond-ah467rdj`)

## Organization vs the other 25 tenancy-era tables

Live Neon still contains **26** tables that are absent from the pre-baseline
`schema.prisma`. They match the abandoned multi-tenant models removed from
connector-engine in the July tenancy rollback, plus three `_orphaned_v2_*`
renames.

| Set | Action in this baseline |
|-----|-------------------------|
| **`Organization` only** | Pulled into `schema.prisma` as a real model. Still required at runtime: create-paths stamp its id into NOT NULL `organizationId` columns via `lib/org-compat.ts`. This is **not** product multi-tenancy (no org-scoped reads / tenant switcher). |
| **Other 25** (22 definition tables + 3 `_orphaned_v2_*`) | **Left untouched** — not in schema, not dropped. Confirmed unused by app/CE source at audit time, but cleanup is a separate reviewed ticket. |

Follow-up (do not bundle into baseline):  
`docs/tickets/cleanup-25-dead-tenancy-tables.md`

## Duplicate `0_baseline` row

`_prisma_migrations` had two `0_baseline` entries (one `ROLLED_BACK` / open,
one finished). The rolled-back duplicate was removed during reconciliation so
history has a single finished `0_baseline`.

## Rule going forward

Anyone applying schema changes to production **outside** a committed migration
file in this repository must document it in this note (or a dated addendum)
**immediately** — not weeks later. Silent production DDL is how we lost July 2.

## Note on `prisma migrate dev` vs `migrate deploy` (2026-08-07)

`prisma migrate dev` still cannot run cleanly against this Neon database: the
shadow-DB drift check sees the three July 2 migrations that exist in
`_prisma_migrations` but have no SQL in the repo, and prompts for
`migrate reset` (which we must never do on production data).

For additive schema work (e.g. `20260807164500_lifecycle_config_version_pin`):

1. Update `schema.prisma`
2. Author the migration SQL under `prisma/migrations/<timestamp>_<name>/`
3. Apply with `prisma migrate deploy`
4. Confirm `prisma migrate status` is up to date
5. Commit schema + migration SQL together

That is the standard path for this project until the July 2 history gap is
fully reconciled (it is not reconstructable — see above).
