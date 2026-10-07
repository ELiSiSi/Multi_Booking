# Phase 5 — Booking Core: Technical Decisions

This document records the architectural decisions made during Phase 5
(Booking Core) and the rationale behind each one, with explicit notes on
what was deferred to Post-V1.

---

## 1. Concurrency Model — PostgreSQL as the Source of Truth

### Decision

Double-booking prevention is enforced at the database level using a
PostgreSQL `EXCLUDE` constraint on a **GiST** index.

```sql
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_active"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tsrange(
      "startAt",
      "endAt" + ("bufferMinutes" * interval '1 minute')
    ) WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'no_show'));
```

### Rationale
- **Absolute Guarantee:** No matter how many instances of the API or Worker are running, PostgreSQL will flat-out reject any overlapping bookings for the same resource.
- **Buffer Support:** The exclusion constraint inherently respects `bufferMinutes` dynamically by injecting it into the `tsrange`.
- **Simplicity:** Removes the need for complex distributed locking in Redis or application-level time-overlap logic.

---

## 2. Idempotency Strategy

### Decision
All state-mutating requests (e.g., `POST /bookings`) can optionally accept an `Idempotency-Key` header.
- Handled at the database level via a dedicated `IdempotencyKey` table with a composite unique constraint `(actorId, key)`.
- Replays identical responses for previously successful identical requests.

### Rationale
- Prevents duplicate bookings and double charges if the client experiences a network timeout and safely retries the request.
- Using `pg_advisory_xact_lock` based on the hash of the idempotency key prevents race conditions when a client fires exactly identical requests concurrently.

---

## 3. Transaction Boundary & Cache Invalidation

### Decision
- **After-Commit Invalidation:** Redis cache invalidation (`availabilityCache.invalidateForResource()`) is strictly executed **after** the PostgreSQL transaction successfully commits.
- **Clean Architecture:** `CreateBookingUseCase` and other core use-cases have been completely decoupled from Redis. They only return the `booking` object and manage the DB transaction.

### Rationale
- Redis operations do not participate in PostgreSQL transactions and cannot be "rolled back". Thus, clearing cache inside a pending transaction could result in stale cache reads if the transaction subsequently fails.
- Moving cache invalidation to the Orchestration Layer (Routes / API handlers) cleanly separates core booking logic (Source of Truth) from ephemeral performance infrastructure (Cache).

---

## 4. Connection Pool & Advisory Locks

### Decision
During idempotency checks and overlapping booking prevention, we utilize transaction-scoped advisory locks (`pg_advisory_xact_lock`). 
- We explicitly increased the `$transaction` timeout (to `15000ms`) for operations utilizing these locks.

### Rationale
- When multiple requests attempt to acquire a lock on the same resource or idempotency key concurrently, they wait in a queue. 
- In constrained CI environments or under heavy load, default transaction timeouts (5s) might trigger `PrismaClientKnownRequestError` before the lock is acquired, throwing 500 instead of allowing a graceful failure. Increasing the timeout allows the system to correctly identify conflicts (`409`) under stress rather than crashing.

---

## 5. Centralized State Machine & Audit Trail

### Decision
Booking state transitions (e.g., `pending` -> `confirmed`, `pending` -> `cancelled`) are strictly governed by a single `transition-booking.use-case.ts` with defined transition rules (`canTransition`), and every change generates an `AuditEvent`.

### Rationale
- Prevents invalid state jumps (e.g., cancelling an already completed booking).
- Guarantees an immutable, chronological history of what happened to a booking and who authorized it (Customer vs. Admin).

---

## 6. Post-V1 Deferred Decisions

### 6.1 Transactional Outbox Pattern for Invalidation
- **Current (V1):** Rely on simple After-Commit cache invalidation. If the Node.js process crashes immediately after DB Commit but before Redis invalidation, the cache becomes slightly stale until TTL expires.
- **Deferred to Advanced/Post-V1:** Implementing the Transactional Outbox Pattern where `OutboxEvent` is saved in the DB transaction and a background worker reliably applies it to Redis.

### 6.2 Redis-based Optimistic Locking / Slot Holding
- **Current (V1):** Rely exclusively on PostgreSQL GiST EXCLUDE constraints for double-booking prevention.
- **Deferred to Advanced/Post-V1:** Using Redis to temporarily "hold" slots for 10-15 minutes while the user navigates checkout (to improve user experience and reduce DB load during high-traffic bursts).

---

## 7. Known Deviations

### 7.1 PostgreSQL `EXCLUDE` Constraint & `protectedSlot` Generated Column
- **Deviation:** We do not define `protectedSlot` as a Prisma-generated column for the exclusion constraint logic.
- **Rationale:** Prisma (as of version 5.22) lacks native support for database-level `EXCLUDE` constraints that utilize range types (like `tstzrange` or `tsrange`) directly in the schema definition. If we attempt to create it via Prisma natively or via complex computed columns, Prisma's shadow database processes may fail on non-immutable index requirements, or fail to manage the types correctly on subsequent migrations.
- **Solution:** We explicitly apply the `EXCLUDE` constraint on `Booking` using a custom SQL migration script (e.g., `20261006184446_`). This operates seamlessly at the database level and ensures double-booking protection is enforced by PostgreSQL while bypassing Prisma's limitations.