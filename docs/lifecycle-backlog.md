# Release Lifecycle — Tracked Backlog

Requirements that are **agreed and mandatory**, but intentionally deferred.

## Effective-dating / config versioning (BLOCKING for live enforcement)

**Status:** Not started. Required before we ever turn on live transition
enforcement or hard "no override" (Required) gates.

**Why:** Today `saveReleaseLifecycleConfig` fully replaces the caller's
graph. `Release.status` is a free string with no pin to a config version.
If rules change while a release is mid-flow, later enforcement would
evaluate against the *current* graph and can strand or re-route in-flight
work.

**Must ship before:**

- Evaluating gates at transition time
- Promoting any transition/gate from Flexible to Required with hard block
- Any "no override" CAB/go-live gate behaviour

**Out of scope until then:** Soft/Flexible warnings that only read the
latest config remain acceptable for previews.

**Rough shape (when we build it):**

- Version or effective-date the lifecycle graph (or snapshot on change)
- Pin each in-flight release to the config version it entered under
- Enforcement reads the pinned snapshot; new releases use latest
- Migration path for existing rows

Do not treat this as optional polish — it is a release gate for Wave 1
enforcement.
