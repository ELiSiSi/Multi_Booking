# Phase 3 — Business & Catalog: Technical Decisions

This document records the architectural decisions made during Phase 3 (Business & Catalog) and the rationale behind each one.

---

## 1. Multi-Tenant Data Model

### Decision
The system uses a strict hierarchy: `User (Owner)` -> `Business` -> `Location` -> `Service` & `Resource`.
- Every entity strictly belongs to its parent.

### Rationale
- Provides natural boundaries for authorization. A user can only access resources belonging to a business they own.
- Makes it easier to shard or partition the database by `businessId` in the future if scale demands it.

## 2. Authorization (Security by Obscurity)

### Decision
When an authenticated user attempts to access or modify a Business, Location, Service, or Resource they do not own, the system returns a `404 Not Found` instead of a `403 Forbidden`.

### Rationale
- Prevents ID enumeration attacks. Attackers cannot verify the existence of a competitor's resource ID by probing and receiving a `403`.

## 3. Cursor-Based Pagination

### Decision
All list endpoints (e.g., `GET /businesses/:id/locations`) use cursor-based pagination instead of offset-based pagination (`limit`/`offset`).

### Rationale
- Scales significantly better on large datasets because it avoids the `OFFSET` penalty in PostgreSQL.
- Provides stable data frames even if new items are inserted during pagination.

## 4. Currency Normalization

### Decision
All currency codes are strictly normalized to uppercase (e.g., `egp` -> `EGP`) at the Use Case layer before saving to the database.

### Rationale
- Prevents inconsistencies in reporting and frontend display. Standardizing early avoids expensive data cleanup migrations later.
