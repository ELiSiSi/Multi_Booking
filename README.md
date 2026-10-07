# Reservio — Multi-Business Booking Platform

> **Status:** Phase 6 (Operational Reliability) complete · **599 tests** passing · **164 smoke assertions** green  
> Next milestone: Phase 7 — Frontend

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

Customers will eventually be able to browse services and book available slots (Phase 5).

---

## Tech Stack

| Layer                 | Technology                                           |
| --------------------- | ---------------------------------------------------- |
| Runtime               | Node.js >= 24                                        |
| Language              | TypeScript 5.6 (strict, ESNext/NodeNext)             |
| Monorepo              | pnpm 9 workspaces                                    |
| HTTP Framework        | Fastify 5                                            |
| ORM                   | Prisma 6 + PostgreSQL 16                             |
| Cache / Queue backend | Redis 7 (ioredis)                                    |
| Job queue             | BullMQ                                               |
| Testing               | Vitest (unit + integration, real DB/Redis)            |
| E2E Smoke Tests       | PowerShell scripts (`scripts/smoke/`)                |
| API docs              | OpenAPI 3 via @fastify/swagger + Swagger UI at /docs |
| CI                    | GitHub Actions (lint, typecheck, test on every push) |
| Containerization      | Docker Compose (Postgres, Redis, API)                |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Fastify API                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ Identity │  │ Catalog  │  │    Availability      │   │
│  │ Module   │  │ Module   │  │    Module             │   │
│  │ (Auth)   │  │ (CRUD)   │  │ (Rules, Exceptions,  │   │
│  │          │  │          │  │  Engine, Cache)       │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────────────────┘   │
│       │             │             │                      │
│  ┌────┴─────────────┴─────────────┴─────────────────┐   │
│  │              Repositories (Data Access)           │   │
│  └──────────┬──────────────────────┬────────────────┘   │
│             │                      │                     │
└─────────────┼──────────────────────┼─────────────────────┘
              │                      │
        ┌─────┴─────┐         ┌──────┴──────┐
        │PostgreSQL │         │   Redis     │
        │  (Source   │         │  (Cache +   │
        │  of Truth) │         │   Queue)    │
        └───────────┘         └─────────────┘
```

**Key design decisions:**

- **Clean Architecture per module:** Route → Use Case → Repository → Database.
- **PostgreSQL is the single source of truth.** Redis is a cache only — never authoritative.
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
│   │   │   │   └── integration/      # Cross-module wiring (cache invalidation on catalog changes)
│   │   │   ├── app.ts                # buildApp() — wires all plugins and modules
│   │   │   └── server.ts             # main() — binds port, graceful shutdown
│   │   └── tests/                    # 20 integration test files
│   │
│   └── worker/                       # Background job processor (BullMQ)
│       ├── src/
│       │   ├── jobs/                 # Job handlers (reminders, expirations)
│       │   └── worker.ts             # Worker initialization
│       └── tests/                    # Worker tests
│
├── packages/                         # Shared internal libraries
│   ├── config/                       # Environment variable validation (Zod)
│   ├── database/                     # Prisma schema, migrations, generated client
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
├── infrastructure/docker/            # Dockerfiles for API, Worker, Tools
├── .github/workflows/ci.yml          # CI pipeline
├── docker-compose.yml                # Postgres + Redis + API containers
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

---

## Availability Engine — How It Works

The engine answers: **"What time slots can a customer book for Resource X performing Service Y on Date Z?"**

```
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

## Quick Start

### 1. Prerequisites

- Node.js >= 24, pnpm 9, Docker Desktop

### 2. Environment

```bash
cp .env.example .env
# Fill in ACCESS_TOKEN_PRIVATE_KEY and ACCESS_TOKEN_PUBLIC_KEY (Ed25519 PEM)
# For local dev, update URLs to use localhost ports:
#   DATABASE_URL=postgresql://reservio:reservio@localhost:5433/reservio
#   REDIS_URL=redis://localhost:6380
```

Generate Ed25519 key pair (development only):

```bash
node -e "
const c = require('crypto');
const { privateKey, publicKey } = c.generateKeyPairSync('ed25519');
console.log('PRIVATE:', privateKey.export({ type:'pkcs8', format:'pem' }));
console.log('PUBLIC:', publicKey.export({ type:'spki', format:'pem' }));
"
```

### 3. Dependencies

```bash
pnpm install
```

### 4. Start infrastructure

```bash
docker-compose up -d
# Postgres -> localhost:5433
# Redis    -> localhost:6380
```

### 5. Database migration

```bash
pnpm db:migrate       # dev (creates migration files)
pnpm db:generate      # regenerate Prisma client after schema changes
```

### 6. Run API

```bash
pnpm dev:api          # tsx watch with .env loaded automatically
# Swagger UI -> http://localhost:3000/docs
```

### 7. Run full API inside Docker

```bash
docker compose up -d --build api
# API -> http://localhost:3000 (uses internal Docker network for DB/Redis)
```

---

## Available Scripts

| Script                   | What it does                                   |
| ------------------------ | ---------------------------------------------- |
| `pnpm dev:api`           | Run API in watch mode                          |
| `pnpm test`              | Run all 571 tests (Unit + Integration)         |
| `pnpm test:unit`         | Only packages/*/tests (no DB/Redis needed)     |
| `pnpm test:config`       | Config package tests only                      |
| `pnpm test:shared`       | Shared package tests only                      |
| `pnpm test:database`     | Prisma integration tests (needs DB)            |
| `pnpm test:watch`        | Vitest in interactive watch mode               |
| `pnpm typecheck`         | tsc --noEmit across all packages               |
| `pnpm build`             | Build all packages                             |
| `pnpm db:migrate`        | prisma migrate dev                             |
| `pnpm db:migrate:deploy` | prisma migrate deploy (prod/CI)                |
| `pnpm db:migrate:reset`  | Reset + re-apply all migrations                |
| `pnpm db:seed`           | Run seed script                                |
| `pnpm db:generate`       | Regenerate Prisma client                       |
| `pnpm clean`             | Remove all dist/ and node_modules/             |

### Smoke Tests (E2E)

```powershell
# Requires API running locally (pnpm dev:api or docker compose up)
powershell -ExecutionPolicy Bypass -File scripts/smoke/run-all.ps1

# Against Docker API on different port:
powershell -ExecutionPolicy Bypass -File scripts/smoke/run-all.ps1 -BaseUrl "http://localhost:3000"
```

---

## Architecture Notes

### Module Structure (Clean Architecture)

Every feature module follows the same structure:

```
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
`cors` → `cookie` → `auth` → `swagger` → `error-handler` → `health` → `identity` → `catalog` → `availability`

### Docker Port Mapping

| Service    | Host Port | Container Port |
| ---------- | --------- | -------------- |
| PostgreSQL | **5433**  | 5432           |
| Redis      | **6380**  | 6379           |
| API        | **3000**  | 3000           |

Use `localhost:5433` / `localhost:6380` in `.env` when running API outside Docker.
Use `postgres:5432` / `redis:6379` when everything runs inside Docker.

---

## Test Coverage (Phase 6 — 599 tests, 100% pass)

| File                                              | Type        | Count |
| ------------------------------------------------- | ----------- | ----- |
| `packages/config/tests/env-schema.test.ts`        | Unit        | 7     |
| `packages/shared/tests/errors.test.ts`            | Unit        | 54    |
| `packages/shared/tests/result.test.ts`            | Unit        | 29    |
| `packages/shared/tests/time.test.ts`              | Unit        | 52    |
| `packages/redis/tests/client.test.ts`             | Integration | 12    |
| `packages/database/tests/client.test.ts`          | Integration | 11    |
| `packages/queue/tests/booking-queue.test.ts`      | Integration | 22    |
| `apps/worker/tests/jobs.test.ts`                  | Integration | 32    |
| `apps/api/tests/health.test.ts`                   | Integration | 13    |
| `apps/api/tests/identity.test.ts`                 | Integration | 67    |
| `apps/api/tests/business.test.ts`                 | Integration | 16    |
| `apps/api/tests/catalog.test.ts`                  | Integration | 69    |
| `apps/api/tests/catalog-resource.test.ts`         | Integration | 33    |
| `apps/api/tests/catalog-service.test.ts`          | Integration | 35    |
| `apps/api/tests/catalog-service-resource.test.ts` | Integration | 26    |
| `apps/api/tests/availability.test.ts`             | Integration | 9     |
| `apps/api/tests/availability-rules.test.ts`       | Integration | 29    |
| `apps/api/tests/availability-exceptions.test.ts`  | Integration | 27    |
| `apps/api/tests/availability-cache.test.ts`       | Integration | 3     |
| `apps/api/tests/slot-engine.test.ts`              | Integration | 25    |
| `apps/api/tests/booking.test.ts`                  | Integration | 17    |
| `apps/api/tests/booking-idempotency.test.ts`      | Integration | 11    |
| **Total Vitest**                                  |             | **599** |
| `scripts/smoke/run-all.ps1`                       | E2E (Smoke) | **164 assertions** |

---

## Phase Roadmap

| Phase | Module                     | Status                    |
| ----- | -------------------------- | ------------------------- |
| 1     | Infrastructure Shell       | ✅ Complete (187 tests)   |
| 2     | Identity & Access          | ✅ Complete (304 tests)   |
| 3     | Business & Catalog (CRUD)  | ✅ Complete (471 tests)   |
| 4     | Availability Engine        | ✅ Complete (571 tests)   |
| 5     | Booking Engine             | ✅ Complete               |
| 6     | V1 Operational Reliability | ✅ Complete               |
| 7     | Frontend                   | 🔜 Next                  |

---

## Environment Variables Reference

| Variable                   | Required | Default        | Description                     |
| -------------------------- | -------- | -------------- | ------------------------------- |
| `NODE_ENV`                 | No       | `development`  | development / test / production |
| `API_PORT`                 | No       | `3000`         | HTTP port                       |
| `API_HOST`                 | No       | `0.0.0.0`      | Bind address                    |
| `DATABASE_URL`             | **Yes**  | —              | PostgreSQL connection string    |
| `REDIS_URL`                | **Yes**  | —              | Redis connection string         |
| `ACCESS_TOKEN_PRIVATE_KEY` | **Yes**  | —              | Ed25519 private key (PEM)       |
| `ACCESS_TOKEN_PUBLIC_KEY`  | **Yes**  | —              | Ed25519 public key (PEM)        |
| `JWT_ISSUER`               | No       | `reservio`     | JWT iss claim                   |
| `JWT_AUDIENCE`             | No       | `reservio-api` | JWT aud claim                   |
| `WORKER_CONCURRENCY`       | No       | `5`            | BullMQ worker concurrency       |
