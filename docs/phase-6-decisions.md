# Phase 6 — Operational Reliability: Decisions & Deliberate Deviations

This document records the architectural decisions made during Phase 6
implementation and the deliberate deviations from the original design
document. Each deviation is documented with its rationale so reviewers
can verify the choices were made intentionally, not omitted by accident.

---

## 1. Scope Recap

The design (Section 9) describes the mandatory V1 worker scope:

- Pending-booking expiration
- Booking reminders
- Idempotent worker processing
- Retries with exponential backoff
- Redis AOF persistence
- Worker startup dependency validation
- Operational logs and failure visibility

All of the above are implemented. The deviations below are about
**how** the scheduling is done, not **whether** the features exist.

---

## 2. Deviation 1 — Repeatable Polling Jobs Instead of Per-Booking Delayed Jobs

### Design Reference

Section 9 §4 and §6 of the design describe the following flow:

---

## 9. Deviation 5 — Redis Availability Cache TTL: 60s vs 90s

### Problem

The design document contained two conflicting TTL values for the
availability slot cache:

- **Section 5 §8** stated: `TTL: 60 seconds`
- **Section 8 §4** stated: `TTL — 90 Seconds` with a detailed
  justification table (10s too aggressive, 90s chosen, 1h unacceptable)

The two sections were inconsistent.

### Resolution

**Chosen value: 90 seconds**, as specified in Section 8 — the section
that is explicitly dedicated to the Redis caching strategy.

The implementation now uses `TTL_SECONDS = 90` in
`apps/api/src/modules/availability/repositories/availability-cache.ts`.

### Rationale

- Section 8 is the canonical section for Redis behavior and already
  contained a written justification for 90s.
- The 90s TTL provides a safety net against missed invalidations while
  keeping the staleness window small enough that a stale "available"
  slot surfaces as a 409 BOOKING_SLOT_CONFLICT and the customer retries.
- A 60s TTL would be tighter but would also lower the cache hit ratio
  without a corresponding correctness benefit — invalidation is still
  the primary freshness mechanism, and the TTL only bounds the damage
  when invalidation fails.

---

## 10. Deviation 6 — `protectedSlot` as Inline Expression, Not a Generated Column

### Design Reference

Section 4 §Model A of the design specifies:

> A generated `protectedSlot` column materializes
> `[startAt, endAt + bufferMinutes)`, and the PostgreSQL
> `EXCLUDE USING gist` constraint enforces non-overlap on the
> protected interval.

### What Was Actually Implemented

The `EXCLUDE` constraint uses an **inline `tstzrange(...)` expression**
instead of a separately stored generated column:

```sql
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_active"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange(
      "startAt",
      date_add("endAt", make_interval(mins => "bufferMinutes"), 'UTC'),
      '[)'
    ) WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'no_show'));
```

See `packages/database/prisma/migrations/20261006184446_/migration.sql`.

### Why This Deviation Was Chosen

Prisma 5.22 does not reflect PostgreSQL generated columns in
`schema.prisma`. Introducing `protectedSlot` as
`GENERATED ALWAYS AS ... STORED` via raw SQL would cause
`prisma migrate dev` to detect a "column not in the schema" on the
next schema change, and to attempt to drop it — causing migrate drift.

There are three possible paths to introduce a generated column under
Prisma 5.22:

1. Use a Prisma `previewFeatures` flag that supports generated columns
   (not available in 5.22).
2. Mark the column as `Unsupported("tstzrange")` in `schema.prisma` and
   accept that Prisma will not manage it — but the column would then
   not be part of the migration graph, which is worse for auditability.
3. Keep the expression inline inside the constraint and document the
   deviation (chosen).

### Correctness Under This Model

The protection is identical in every observable way:

- The exclusion constraint is enforced by the storage engine, not by
  application code. No code path, script, or psql session can insert a
  conflicting row.
- The expression is `IMMUTABLE` (verified via `date_add(..., 'UTC')`),
  so it is accepted inside a GiST index expression — PostgreSQL
  otherwise rejects it.
- The interval is the same `[startAt, endAt + bufferMinutes)`, half-open.
- The statuses filtered by the constraint are the same
  (`pending`, `confirmed`, `no_show`).

The only structural difference is that the range is computed on demand
by the index rather than stored as a separate column. For this dataset
and workload there is no observable performance impact.

### What Would Change Under Prisma 6+

When upgrading Prisma to a version that reflects generated columns in
`schema.prisma`, the constraint can be migrated to:

```prisma
protectedSlot tstzrange @generated(...)  // hypothetical syntax
```

without changing the constraint semantics. The migration would be
mechanical: add the column, drop the constraint, recreate it on the
column, drop the old inline expression.

This is deferred to Post-V1.
