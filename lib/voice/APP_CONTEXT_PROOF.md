# Application context layer — proof notes

## Phase 1 (entity brief + canonical ordinals)

- [ ] Connect voice off Releases page; say “first release” → opens REL-0001 (or lowest REL code).
- [ ] Say “release 75” / “rel 75” → REL-0075 (shorthand → DB code).
- [ ] Say “release 0001” / “REL-0001” → REL-0001.
- [ ] Say “blocker 10” → BLK-0010; “10th blocker” still uses on-screen ordinal.
- [ ] Say “first conflict” → lowest CNF-#### by code (not random API order).
- [ ] Transcript / tools never invent codes when search is empty.

## Phase 2 (visible table)

- [ ] On `/releases` with a filter that hides REL-0001, say “open the first one” / “first release” → first **visible** row.
- [ ] Same for Conflicts / Risks / Blockers / Env Booking tables.
- [ ] Leave the list page → ordinals fall back to canonical global order.

## Regression

- [ ] “Open calendar tab” / “env booking page” still work (sidebar catalog).
- [ ] Screen share still optional and off by default.
