# Phase 4 — Availability Engine: Technical Decisions

This document records the architectural decisions made during Phase 4 (Availability Engine) and the rationale behind each one.

---

## 1. Separation of Domain Logic

### Decision
The core logic for generating available time slots (`SlotEngine`) is implemented as pure TypeScript functions (`domain/slot-engine.ts`) with zero dependencies on Prisma, Redis, or Fastify.

### Rationale
- **Testability:** Pure functions are exceptionally easy to test. We achieved high confidence (hundreds of test cases) covering complex edge cases (breaks, buffers, timezone math) without needing a database connection.
- **Maintainability:** The math of time calculation is completely isolated from data fetching (Repositories) and HTTP logic (Routes).

## 2. Granular Availability Rules & Exceptions

### Decision
Availability is driven by base weekly rules (`AvailabilityRule`) and overridden by specific date exceptions (`AvailabilityException`).
- **Rule Types:** `OPEN`, `BREAK`.
- **Exception Types:** `CLOSED`, `CUSTOM_HOURS`, `BREAK`.

### Rationale
- Provides maximum flexibility for businesses. They can set standard 9-5 hours, block out specific holidays (`CLOSED`), or add temporary extended hours (`CUSTOM_HOURS`), without touching the base rules.

## 3. High-Performance Caching Strategy

### Decision
Calculated availability slots are heavily cached in Redis using a compound key (`resourceId:date`).
- **Cache Invalidation:** Any mutation (Create/Update/Delete) to Rules, Exceptions, or Resource details (like `bufferMinutes`) automatically invalidates the specific resource's cache.

### Rationale
- Calculating availability requires merging rules, exceptions, active bookings, and buffers using complex time math. Doing this on-the-fly for every customer viewing a calendar would crush the CPU.
- Caching the final computed slots guarantees instant responses for end-users browsing availability.
