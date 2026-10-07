# Reservio — Multi-Business Booking Platform

> **Status:** Phase 6 (Operational Reliability) complete · **599 tests** passing · **164 smoke assertions** green  
> Next milestone: Phase 7 — Quality & Handover

---

## What Is Reservio?

Reservio is a **multi-tenant booking platform** where each business owner (admin) can:

1. Create one or more **Businesses** (e.g. a barber shop, a clinic).
2. Add **Locations** (branches) to each business.
3. Add **Services** (what the customer books — "Haircut 30 min, 150 EGP").
4. Add **Resources** (who performs the service — staff members).
5. Assign resources to services (many-to-many).
6. Define **Availability Rules** (weekly working hours) and **Exceptions** (holidays, custom hours, breaks).
7. The platform's **Availability Engine** computes open slots in real-time, respecting timezone, breaks, buffers, existing bookings, and caching.

Customers can create bookings against those services, and the platform enforces
double-booking prevention through the PostgreSQL exclusion constraint, snapshotted
buffers, and a shared booking core consumed by both the API and the Worker.

---

## Tech Stack

| Layer                 | Technology                                           |
| --------------------- | ---------------------------------------------------- |
| Runtime               | Node.js >= 24                                        |
| Language              | TypeScript 5.6 (strict, ESNext/NodeNext)             |
| Monorepo              | pnpm workspaces                                      |
| HTTP Framework        | Fastify 5                                            |
| ORM                   | Prisma 5.22 + PostgreSQL 16                          |
| Cache / Queue backend | Redis 7 (ioredis)                                    |
| Job queue             | BullMQ 5                                             |
| Testing               | Vitest (unit + integration, real DB/Redis)            |
| E2E Smoke Tests       | PowerShell scripts (`scripts/smoke/`)                |
| API docs              | OpenAPI 3 via @fastify/swagger + Swagger UI at /docs |
| CI                    | GitHub Actions (lint, typecheck, test on every push) |
| Containerization      | Docker Compose (Postgres, Redis, API, Worker, db-tools) |

---

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────┐
│                      Fastify API (apps/api)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐    │
│  │ Identity │  │ Catalog  │  │    Availability      │    │
│  │ Module   │  │ Module   │  │    Module            │    │
│  │ (Auth)   │  │ (CRUD)   │  │ (Rules, Exceptions,  │    │
│  │          │  │          │  │  Engine, Cache)      │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────────────────┘    │
│       │             │             │                      │
│  ┌────┴─────────────┴─────────────┴─────────────────┐    │
│  │   Bookings Module (routes only — thin adapters)  │    │
│  └──────────────────────────┬───────────────────────┘    │
└─────────────────────────────┼────────────────────────────┘
                              │
                    ┌─────────┴────────┐
                    │    @reservio/    │
                    │   booking-core   │ ← Single authoritative
                    │    (domain +     │   booking domain
                    │    use cases)    │
                    └─────────┬────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
    ┌─────────┴──────────┐           ┌─────────┴──────────┐
    │     apps/worker    │           │  packages/database │
    │   (BullMQ jobs)    │           │ (Prisma adapters)  │
    └─────────┬──────────┘           └─────────┬──────────┘
              │                                │
              │                      ┌─────────┴──────────┐
              │                      │    PostgreSQL      │
              │                      │ (Source of Truth)  │
              │                      └────────────────────┘
              │
    ┌─────────┴──────────┐
    │       Redis        │
    │  (Cache + BullMQ)  │
    └────────────────────┘
```

**Key design decisions:**

- **Single authoritative booking core:** `packages/booking-core` owns the
  booking state machine, lifecycle policies, and transition use case. Both the
  API and the Worker consume the same `TransitionBookingUseCase` — no duplicate
  state-machine logic across processes (design review correction C5).
- **Clean Architecture per module:** Route → Use Case → Repository → Database.
- **PostgreSQL is the single source of truth.** Redis is a cache only — never authoritative.
- **Double-booking prevention is enforced by the database.** The `Booking`
  table has an `EXCLUDE USING gist` constraint on the protected interval
  `[startAt, endAt + bufferMinutes)` for active statuses
  (`pending`, `confirmed`, `no_show`). A resource-level advisory lock serializes
  concurrent transitions on the same resource.
- **Security by obscurity:** If Admin A tries to access Admin B's resources, the API returns `404` (not `403`) to avoid leaking existence.
- **Tenant isolation:** Every write operation verifies ownership through the business → location → resource chain.
- **Cursor-based pagination:** All list endpoints use cursor pagination (not offset) for stable results.

---

## Repository Layout

```text
Multi_Booking/
├── apps/
│   ├── api/                          # Fastify HTTP server
│   │   ├── src/
│   │   │   ├── plugins/              # Fastify plugins (cors, cookie, auth, swagger, health, error-handler)
│   │   │   ├── modules/
│   │   │   │   ├── identity/         # Phase 2: Auth, JWT, Refresh Tokens, Roles
│   │   │   │   │   ├── repositories/ # UserRepository, RefreshTokenRepository
│   │   │   │   │   ├── use-cases/    # Register, Login, Logout, Refresh, errors
│   │   │   │   │   └── routes/       # /api/v1/auth/*, /api/v1/users/*
│   │   │   │   ├── catalog/          # Phase 3: Business entities CRUD
│   │   │   │   │   ├── repositories/ # Business, Location, Service, Resource, ServiceResource repos
│   │   │   │   │   ├── use-cases/    # Create/Update/List/Get for each entity, assign/unassign
│   │   │   │   │   └── routes/       # /businesses/*, /locations/*, /services/*, /resources/*
│   │   │   │   ├── availability/     # Phase 4: Scheduling engine
│   │   │   │   │   ├── domain/       # Slot engine, interval math, timezone, weekday logic
│   │   │   │   │   ├── repositories/ # Rule/Exception CRUD repos, availability read repo, Redis cache
│   │   │   │   │   ├── use-cases/    # CRUD rules/exceptions, get-availability, cache invalidation
│   │   │   │   │   └── routes/       # /availability-rules/*, /availability-exceptions/*, /availability
│   │   │   │   ├── bookings/         # Phase 5: Booking API presentation only
│   │   │   │   │   ├── repositories/ # BookingRepository, IdempotencyRepository
│   │   │   │   │   ├── use-cases/    # Create (idempotent), Get, List (thin wrappers over booking-core)
│   │   │   │   │   └── routes/       # /bookings/*, /businesses/:bid/bookings
│   │   │   │   └── integration/      # Cross-module wiring (cache invalidation on catalog changes)
│   │   │   ├── app.ts                # buildApp() — wires all plugins and modules
│   │   │   └── server.ts             # main() — binds port, graceful shutdown
│   │   └── tests/                    # Integration + concurrency test files
│   │
│   └── worker/                       # Background job processor (BullMQ)
│       ├── src/
│       │   ├── jobs/                 # pending-booking-expiration, booking-reminder
│       │   ├── scheduler.ts          # Registers repeatable jobs at startup
│       │   └── worker.ts             # Worker initialization + graceful shutdown
│       └── tests/                    # Worker job tests
│
├── packages/                         # Shared internal libraries
│   ├── booking-core/                 # Phase 5: Single authoritative Booking Domain
│   │   ├── src/
│   │   │   ├── domain/               # State machine, policies, errors, status types
│   │   │   ├── application/
│   │   │   │   ├── ports/            # BookingRepositoryPort, AuditRepositoryPort,
│   │   │   │   │                     # BusinessRepositoryPort, ResourceLockPort, UnitOfWorkPort
│   │   │   │   └── transition-booking.use-case.ts   # The single transition entry point
│   │   │   └── index.ts
│   │   └── package.json
│   ├── config/                       # Environment variable validation (Zod)
│   ├── database/                     # Prisma schema, migrations, generated client
│   │   ├── prisma/                   # schema.prisma, migrations/, seed.ts
│   │   └── src/
│   │       ├── repositories/         # Prisma adapters implementing booking-core ports
│   │       ├── locks.ts              # Advisory lock helpers
│   │       └── unit-of-work.ts       # Prisma UnitOfWork implementing UnitOfWorkPort
│   ├── queue/                        # BullMQ connection & job type definitions
│   ├── redis/                        # Shared ioredis client singleton
│   └── shared/                       # Cross-package utilities (errors, result, time)
│
├── scripts/
│   └── smoke/                        # E2E smoke test suite (PowerShell)
│       ├── _helpers.ps1              # Shared test utilities (Invoke-Api, Assert-Status, etc.)
│       ├── 01-auth.ps1               # Auth endpoints smoke
│       ├── 02-business.ps1           # Business CRUD smoke
│       ├── 03-location.ps1           # Location CRUD smoke
│       ├── 04-service.ps1            # Service CRUD smoke
│       ├── 05-resource.ps1           # Resource CRUD smoke
│       ├── 06-service-resource.ps1   # Assignment smoke
│       ├── 07-availability-rules.ps1 # Availability Rules CRUD smoke
│       ├── 08-availability-exceptions.ps1 # Availability Exceptions CRUD smoke
│       ├── 09-availability.ps1       # GET /availability + cleanup
│       └── run-all.ps1               # Orchestrator — runs all sections sequentially
│
├── docs/                             # Phase decision logs + reference PDFs
│   ├── phase-1-decisions.md
│   ├── phase-2-decisions.md
│   ├── phase-3-decisions.md
│   ├── phase-4-decisions.md
│   ├── phase-5-decisions.md
│   ├── phase-6-decisions.md          # Deliberate deviations documented (polling vs delayed jobs)
│   └── Pdf/                          # Assessment + corrections reference PDFs
│
├── infrastructure/docker/            # Dockerfiles for API, Worker, Tools
├── .github/workflows/ci.yml          # CI pipeline
├── docker-compose.yml                # Postgres + Redis + API + Worker + db-tools
└── tests/setup-env.ts                # Loads .env before Vitest runs
```

---

## API Endpoints (Complete)

### Identity (`/api/v1/auth`)

| Method | Path              | Auth     | Description                         |
| ------ | ----------------- | -------- | ----------------------------------- |
| POST   | `/auth/register`  | Public   | Register new user → 201             |
| POST   | `/auth/login`     | Public   | Login → 200 + access token + cookie |
| POST   | `/auth/refresh`   | Cookie   | Rotate refresh token → new access   |
| POST   | `/auth/logout`    | Bearer   | Revoke refresh token → 204          |
| GET    | `/auth/me`        | Bearer   | Current user info → 200             |

### Catalog — Business (`/businesses`)

| Method | Path                 | Auth  | Role  | Description                     |
| ------ | -------------------- | ----- | ----- | ------------------------------- |
| POST   | `/businesses`        | Yes   | Admin | Create business → 201           |
| GET    | `/businesses/mine`   | Yes   | Any   | List own businesses (paginated) |
| PATCH  | `/businesses/:id`    | Yes   | Admin | Update business settings        |

### Catalog — Location (`/businesses/:bid/locations`)

| Method | Path           | Auth | Role  | Description               |
| ------ | -------------- | ---- | ----- | ------------------------- |
| POST   | `/`            | Yes  | Admin | Create location → 201     |
| GET    | `/`            | Yes  | Admin | List locations (paginated) |
| GET    | `/:id`         | Yes  | Admin | Get single location       |
| PATCH  | `/:id`         | Yes  | Admin | Update location           |

### Catalog — Service (`/businesses/:bid/locations/:lid/services`)

| Method | Path    | Auth | Role  | Description             |
| ------ | ------- | ---- | ----- | ----------------------- |
| POST   | `/`     | Yes  | Admin | Create service → 201    |
| GET    | `/`     | Yes  | Admin | List services           |
| GET    | `/:id`  | Yes  | Admin | Get single service      |
| PATCH  | `/:id`  | Yes  | Admin | Update service          |

### Catalog — Resource (`/businesses/:bid/locations/:lid/resources`)

| Method | Path    | Auth | Role  | Description             |
| ------ | ------- | ---- | ----- | ----------------------- |
| POST   | `/`     | Yes  | Admin | Create resource → 201   |
| GET    | `/`     | Yes  | Admin | List resources          |
| GET    | `/:id`  | Yes  | Admin | Get single resource     |
| PATCH  | `/:id`  | Yes  | Admin | Update resource         |

### Catalog — Service ↔ Resource Assignment

| Method | Path                                              | Auth | Role  | Description              |
| ------ | ------------------------------------------------- | ---- | ----- | ------------------------ |
| POST   | `/services/:sid/resources/:rid`                   | Yes  | Admin | Assign resource → 201    |
| DELETE | `/services/:sid/resources/:rid`                   | Yes  | Admin | Unassign resource → 204  |
| GET    | `/services/:sid/resources`                        | Yes  | Admin | List assignments         |

### Availability — Rules (`/businesses/:bid/locations/:lid/resources/:rid/availability-rules`)

| Method | Path    | Auth | Role  | Description                     |
| ------ | ------- | ---- | ----- | ------------------------------- |
| POST   | `/`     | Yes  | Admin | Create rule (OPEN/BREAK) → 201  |
| GET    | `/`     | Yes  | Admin | List rules for resource         |
| PATCH  | `/:id`  | Yes  | Admin | Update rule                     |
| DELETE | `/:id`  | Yes  | Admin | Delete rule → 204               |

### Availability — Exceptions (`/businesses/:bid/locations/:lid/resources/:rid/availability-exceptions`)

| Method | Path    | Auth | Role  | Description                                |
| ------ | ------- | ---- | ----- | ------------------------------------------ |
| POST   | `/`     | Yes  | Admin | Create exception (CLOSED/CUSTOM/BREAK) → 201 |
| GET    | `/`     | Yes  | Admin | List exceptions for resource               |
| PATCH  | `/:id`  | Yes  | Admin | Update exception                           |
| DELETE | `/:id`  | Yes  | Admin | Delete exception → 204                     |

### Availability — Slot Query

| Method | Path                                                                                  | Auth   | Description                          |
| ------ | ------------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| GET    | `/.../resources/:rid/services/:sid/availability?date=YYYY-MM-DD`                      | Public | Returns available booking slots      |

### Bookings (`/bookings`)

| Method | Path                       | Auth        | Description                                       |
| ------ | -------------------------- | ----------- | ------------------------------------------------- |
| POST   | `/bookings`                | Auth        | Create booking (requires Idempotency-Key header) → 201 |
| GET    | `/bookings/mine`           | Customer    | List own bookings (paginated)                     |
| GET    | `/bookings/:id`            | Owner/Admin | Get single booking                                |
| GET    | `/businesses/:bid/bookings`| Admin       | List business bookings                            |
| POST   | `/bookings/:id/confirm`    | Admin       | pending → confirmed                               |
| POST   | `/bookings/:id/cancel`     | Owner/Admin | pending\|confirmed → cancelled                    |
| POST   | `/bookings/:id/complete`   | Admin       | confirmed → completed (only after endAt + buffer) |
| POST   | `/bookings/:id/no-show`    | Admin       | confirmed → no_show (only after startAt)          |

---

## Availability Engine — How It Works

The engine answers: **"What time slots can a customer book for Resource X performing Service Y on Date Z?"**

```text
1. Parse requested date
       ↓
2. Resolve timezone (location → business → UTC)
       ↓
3. Load recurring rules for that weekday (OPEN / BREAK)
       ↓
4. Apply exceptions (CLOSED → no slots, CUSTOM_HOURS → replace, BREAK → subtract)
       ↓
5. Generate candidate time windows (after merging + subtracting)
       ↓
6. Convert windows to UTC instants
       ↓
7. Remove ranges occupied by existing active bookings
       ↓
8. Apply service duration + buffer rules
       ↓
9. Align slots to granularity (e.g., every 15 min)
       ↓
10. Return valid slots (cached in Redis for next call)
```

**Key behaviors:**

- **Exception precedence:** CLOSED overrides everything. CUSTOM_HOURS replaces the day's rules. BREAK subtracts from whatever remains.
- **Buffer:** Resource-level buffer (if set) overrides business default. Buffer time is added after each booking to prevent back-to-back.
- **Dynamic anchoring:** After an existing booking, the next slot anchors from the end of that booking (+ buffer), not from a fixed grid.
- **Cache:** Results are cached per resource+service+date in Redis (TTL-based). Any rule/exception/booking write invalidates the relevant cache.

---

## Booking Core — How It Works

The `packages/booking-core` package is the single authoritative home for the booking domain. It owns:

- The booking state machine (pending, confirmed, cancelled, completed, no_show)
- Lifecycle timing policies (cancellation window, completion window, no-show guard)
- The `TransitionBookingUseCase` — the one place where a booking state transition is applied

Both the API and the Worker consume this package. Neither defines its own state machine or duplicates transition logic.

**Double-booking prevention — Defense in Depth:**

1. PostgreSQL `EXCLUDE` constraint on `tstzrange(startAt, date_add(endAt, bufferMinutes, 'UTC'))`
   for active statuses (pending, confirmed, no_show). This is the atomic
   guarantee — it is enforced by the storage engine and cannot be bypassed.
2. Resource-level advisory lock (`pg_advisory_xact_lock`) serializes competing
   transitions on the same resource.
3. Optimistic concurrency — the updateMany in the repository uses
   `WHERE id = ? AND status = expectedStatus` so a stale transition is rejected.
4. Snapshot semantics: Each booking stores its own `durationMinutes`, `bufferMinutes`,
   and `priceCents` at creation time. Later changes to the resource or business policy
   do not retroactively alter existing bookings.

---

## Quick Start

There are two supported ways to run the project locally:

- **(A) Host mode** — API and Worker run on your machine, only Postgres + Redis run in Docker.
  This is the default and the recommended way for day-to-day development.
- **(B) Full Docker mode** — everything runs inside Docker Compose.

The `.env.example` defaults to **Host mode (A)**. If you prefer Full Docker (B), there
are commented instructions in `.env.example` showing the two lines you need to change.

---

### 1. Prerequisites

- Node.js >= 24
- pnpm
- Docker Desktop (or any Docker-compatible runtime)

---

### 2. Environment

Copy the template and generate the required Ed25519 key pair:

```bash
cp .env.example .env
```

Then generate a development-only Ed25519 key pair and write it directly into `.env`:

```bash
node -e "
const fs = require('fs');
const c = require('crypto');
const { privateKey, publicKey } = c.generateKeyPairSync('ed25519');
const priv = privateKey.export({ type:'pkcs8', format:'pem' }).replace(/\n/g, '\\\\n');
const pub  = publicKey.export({ type:'spki',  format:'pem' }).replace(/\n/g, '\\\\n');
let env = fs.readFileSync('.env', 'utf8');
env = env.replace(/^ACCESS_TOKEN_PRIVATE_KEY=.*$/m, 'ACCESS_TOKEN_PRIVATE_KEY=\"' + priv + '\"');
env = env.replace(/^ACCESS_TOKEN_PUBLIC_KEY=.*$/m,  'ACCESS_TOKEN_PUBLIC_KEY=\"'  + pub  + '\"');
fs.writeFileSync('.env', env);
console.log('✓ Ed25519 keys written to .env');
"
```

**The API will NOT start without these keys.** The `.env.example` ships with empty
placeholders on purpose — real keys must never be committed to git.

If you are running the API from your host (the default), the `.env` already points to
`localhost:5433` for Postgres and `localhost:6380` for Redis. If you instead want to
run everything inside Docker, edit `.env` and switch those two lines to the
Docker-internal values (commented in `.env.example`).

### 3. Dependencies

```bash
pnpm install
```

### 4. Start infrastructure (Postgres + Redis)

```bash
docker compose up -d postgres redis
# Postgres -> localhost:5433
# Redis    -> localhost:6380
```

Wait until both containers report healthy:

```bash
docker ps
```

### 5. Database migration and seed

With the infra running, apply migrations and (optionally) seeds from the host:

```bash
pnpm --filter @reservio/database migrate:deploy
pnpm --filter @reservio/database seed
```

The seed creates three sample verticals (Salon, Clinic, Sports Center) and two users:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@reservio.local | AdminPassword!123 |
| Customer | customer@reservio.local | CustomerPassword!123 |

**Full Docker alternative:** if you prefer to run migrations through the containerised
tooling instead of from the host, use `docker compose run --rm db-tools pnpm db:migrate`
and `docker compose run --rm db-tools pnpm db:seed` instead. In that case your `.env`
must use the Docker-internal hostnames (`postgres:5432`, `redis:6379`).

### 6. Run API and Worker (host mode)

In one terminal:

```bash
pnpm dev:api
# API     -> http://localhost:3000
# Swagger -> http://localhost:3000/docs
```

In a second terminal:

```bash
pnpm --filter @reservio/worker dev
# BullMQ worker — processes pending-expiration and booking-reminder jobs
```

### 7. Run the full stack inside Docker (alternative)

If you prefer everything to run in Docker, first switch `.env` to the Docker-internal
hostnames (see `.env.example`), then:

```bash
docker compose up -d --build
# API    -> http://localhost:3000
# Worker -> processes the booking-jobs queue
# Postgres + Redis use the internal Docker network
```

Migrations and seeds must also use the Docker-internal hostnames — run them through
`db-tools` (see step 5).

### 8. Verify the API is alive

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

Try logging in with the seeded admin account:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@reservio.local","password":"AdminPassword!123"}'
# {"user":{...},"accessToken":"eyJ..."}
```

---

## Available Scripts

> **⚠️ The test suite requires Postgres and Redis to be running.**
> Start the infra first (`docker compose up -d postgres redis`) and wait
> until `docker ps` reports both as `(healthy)`. Without infra, integration
> tests will time out after 60 seconds each.
>
> Expected times with infra running:
>
> | Command | Time |
> |---|---|
> | `pnpm typecheck` | ~5s |
> | `pnpm test:quiet` | ~12s |
> | `pnpm build` | ~10s |

| Script | What it does |
| ------ | ------------ |
| `pnpm dev:api` | Run API in watch mode |
| `pnpm test` | Run all tests (Unit + Integration + Concurrency) |
| `pnpm test:quiet` | Same, with minimal output |
| `pnpm test:unit` | Only packages/*/tests (no DB/Redis needed) |
| `pnpm test:config` | Config package tests only |
| `pnpm test:shared` | Shared package tests only |
| `pnpm test:database` | Prisma integration tests (needs DB) |
| `pnpm test:watch` | Vitest in interactive watch mode |
| `pnpm typecheck` | tsc --noEmit across all packages |
| `pnpm build` | Build all packages |
| `pnpm db:migrate` | prisma migrate dev |
| `pnpm db:migrate:deploy` | prisma migrate deploy (prod/CI) |
| `pnpm db:migrate:reset` | Reset + re-apply all migrations |
| `pnpm db:seed` | Run seed script |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm clean` | Remove all dist/ and node_modules/ |

### Smoke Tests (E2E)

```powershell
# Requires API running locally (pnpm dev:api or docker compose up)
powershell -ExecutionPolicy Bypass -File scripts/smoke/run-all.ps1

# Against Docker API on different port:
powershell -ExecutionPolicy Bypass -File scripts/smoke/run-all.ps1 -BaseUrl "http://localhost:3000"
```

---

## Architecture Notes

### Booking Core (Single Authoritative Home)

The booking domain lives in `packages/booking-core`. It is infrastructure-free:

- `domain/` — state machine, timing policies, domain errors
- `application/ports/` — interfaces only (no Prisma, no Redis)
- `application/transition-booking.use-case.ts` — the one transition entry point

The API and the Worker reach this package through Prisma adapters in
`packages/database`, which implement the ports and open the transaction
(including the resource advisory lock).

### Module Structure (Clean Architecture)

Every feature module follows the same structure:

```text
module/
├── domain/         # Pure business logic (no framework, no DB)
├── repositories/   # Data access layer (Prisma, Redis)
├── use-cases/      # Application logic (orchestrates domain + repos)
├── routes/         # HTTP handlers (Fastify routes + JSON Schema validation)
└── index.ts        # Composition Root — wires everything together
```

### Error Handling Contract

Every intentional error thrown by business logic **must** extend `AppError` from `@reservio/shared`.

- `DomainError` → business rule violation → HTTP 422 by default
- `InfraError` → dependency failure → HTTP 503 by default
- `error-handler.ts` catches AppError subclasses and formats them as `{ error: { code, message, details? } }`.
- Do **not** throw raw `Error` in domain/service layers.

### Result Type

Use `ok(value)` / `err(error)` from `@reservio/shared` for functions that can fail predictably without throwing. Prefer this over try/catch chains in service logic.

### Singleton Clients

`prisma`, `redis`, and `bookingQueue` are singletons stored on `globalThis` to survive hot-reloads without leaking connections. Never instantiate them directly — always import from their package index.

### Time & Timezone

- All time math must go through `@reservio/shared/utils/time` (uses Luxon).
- `localToUtc()` **rejects non-existent local times** (DST spring-forward gaps).
- Timezone resolution chain: Location timezone → Business timezone → UTC.
- IANA timezone validation is enforced on create/update of Business and Location.

### Fastify Plugin Registration Order

In `app.ts`, plugin order matters:
`cors` → `cookie` → `auth` → `swagger` → `error-handler` → `health` → `identity` → `catalog` → `availability` → `bookings`

### Background Worker

The worker (`apps/worker`) is a BullMQ consumer on the `booking-jobs` queue. It
processes two repeatable jobs at a 60-second interval:

| Job | Purpose |
| --- | ------- |
| `pending-expiration` | Cancels pending bookings whose `pendingExpiresAt` has passed |
| `booking-reminder` | Writes a `booking.reminder_sent` audit event for confirmed bookings due |

Both jobs delegate state changes to the shared `TransitionBookingUseCase` in
`packages/booking-core`. A worker retry cannot create a duplicate transition —
the state machine and the optimistic concurrency check reject it.

See `docs/phase-6-decisions.md` for the deliberate decision to use repeatable
polling jobs instead of per-booking delayed jobs (and why `moveToDelayed` is
not applicable in this architecture).

### Docker Port Mapping

| Service | Host Port | Container Port |
| ------- | --------- | -------------- |
| PostgreSQL | **5433** | 5432 |
| Redis | **6380** | 6379 |
| API | **3000** | 3000 |

Use `localhost:5433` / `localhost:6380` in `.env` when running API outside Docker.
Use `postgres:5432` / `redis:6379` when everything runs inside Docker.

---

## Test Coverage (Phase 6 — 599 tests, 100% pass)

| File | Type | Count |
| ---- | ---- | ----- |
| `packages/config/tests/env-schema.test.ts` | Unit | 7 |
| `packages/shared/tests/errors.test.ts` | Unit | 54 |
| `packages/shared/tests/result.test.ts` | Unit | 29 |
| `packages/shared/tests/time.test.ts` | Unit | 52 |
| `packages/redis/tests/client.test.ts` | Integration | 12 |
| `packages/database/tests/client.test.ts` | Integration | 11 |
| `packages/queue/tests/booking-queue.test.ts` | Integration | 22 |
| `apps/worker/tests/jobs.test.ts` | Integration | 5 |
| `apps/worker/tests/booking-reminder.test.ts` | Integration | 10 |
| `apps/api/tests/health.test.ts` | Integration | 13 |
| `apps/api/tests/identity.test.ts` | Integration | 67 |
| `apps/api/tests/business.test.ts` | Integration | 16 |
| `apps/api/tests/catalog.test.ts` | Integration | 69 |
| `apps/api/tests/catalog-resource.test.ts` | Integration | 33 |
| `apps/api/tests/catalog-service.test.ts` | Integration | 35 |
| `apps/api/tests/catalog-service-resource.test.ts` | Integration | 26 |
| `apps/api/tests/availability.test.ts` | Integration | 9 |
| `apps/api/tests/availability-rules.test.ts` | Integration | 29 |
| `apps/api/tests/availability-exceptions.test.ts` | Integration | 27 |
| `apps/api/tests/availability-cache.test.ts` | Integration | 3 |
| `apps/api/tests/slot-engine.test.ts` | Integration | 25 |
| `apps/api/tests/booking.test.ts` | Integration | 17 |
| `apps/api/tests/booking-idempotency.test.ts` | Integration | 11 |
| `apps/api/tests/booking-concurrency.test.ts` | Concurrency | 9 |
| **Total Vitest** | | **599** |
| `scripts/smoke/run-all.ps1` | E2E (Smoke) | **164 assertions** |

---

## Phase Roadmap

| Phase | Module | Status |
| ----- | ------ | ------ |
| 0 | Architecture Risk Validation | ✅ Complete |
| 1 | Infrastructure Shell | ✅ Complete |
| 2 | Identity & Access | ✅ Complete |
| 3 | Business & Catalog (CRUD) | ✅ Complete |
| 4 | Availability Engine | ✅ Complete |
| 5 | Booking Engine | ✅ Complete |
| 6 | V1 Operational Reliability | ✅ Complete |
| 7 | Quality & Handover | ✅ Complete |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `NODE_ENV` | No | `development` | development / test / production |
| `API_PORT` | No | `3000` | HTTP port |
| `API_HOST` | No | `0.0.0.0` | Bind address |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `ACCESS_TOKEN_PRIVATE_KEY` | **Yes** | — | Ed25519 private key (PEM) |
| `ACCESS_TOKEN_PUBLIC_KEY` | **Yes** | — | Ed25519 public key (PEM) |
| `JWT_ISSUER` | No | `reservio` | JWT iss claim |
| `JWT_AUDIENCE` | No | `reservio-api` | JWT aud claim |
| `WORKER_CONCURRENCY` | No | `5` | BullMQ worker concurrency |
