# Voice context agent — design notes

## Goal
Experienced assistant that understands messy speech across entity types, using **this company's DB** as source of truth — without dumping the whole database into the model.

## Architecture (retrieve-don't-dump)

```
User speech → LLM (intent) → search_entity
                              └─ context agent
                                   ├─ plan (shorthand / pronouns / multi-term)
                                   ├─ session memory (recent codes)
                                   ├─ APP_CONTEXT boost (on-screen rows)
                                   ├─ searchAll + /api/search (tenant data)
                                   └─ short TTL cache
                         → navigate_to / get_summary
```

## What we do NOT do
- Load entire tables into Live systemInstruction
- Hardcode company-specific REL/BLK ids in source
- Treat model “memory” as truth after writes

## Manual checks
- [ ] “open release 75” → REL-0075 (when present in tenant data)
- [ ] “open blocker no 5” → BLK-0005 (not bare `"5"`)
- [ ] “payment release blocked” → ranked candidates; clarify if multiple
- [ ] After opening a release, “summarize that one” → same record via SESSION_MEMORY
- [ ] “first / 10th blocker” on list still uses APP_CONTEXT ordinals
- [ ] Mic stop/start clears session memory

## Deferred — per-org code prefixes (do later)

**Problem:** `REL` / `BLK` / `CNF` (and siblings) can differ company by company. Product defaults in `ENTITY_CODE_PREFIX` must not stay the only source of truth.

**Plan:**
1. DB: org-scoped prefix map (e.g. `OrganizationCodeConfig` or JSON on Organization); defaults = today’s REL/BLK/CNF/…
2. Load on voice session mint + `GET /api/search` from auth `organizationId`
3. Inject into spoken padding (`padSpokenDigitsToCode`), context-agent / search-strengthen, Live brief, ⌘K
4. Keep spoken entity words (“blocker”, “release”) stable; only prefix letters are tenant config
5. Settings UI later; optional auto-detect from existing codes
6. Prerequisite: prefixes must match how that org already stores codes in DB

**Do not:** hardcode per-company IDs; dump whole DB into the LLM.
