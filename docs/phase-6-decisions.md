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
