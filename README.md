# Reservio — Multi-Business Booking Platform

> **Status:** Phase 2 (Identity & Access) complete. Feature modules (catalog, availability, bookings) are Phase 3+.

---

## Stack

| Layer                 | Technology                                           |
| --------------------- | ---------------------------------------------------- |
| Runtime               | Node.js >= 24                                        |
| Language              | TypeScript 5.6 (strict, ESNext/NodeNext)             |
| Monorepo              | pnpm 9 workspaces                                    |
| HTTP Framework        | Fastify 5                                            |
| ORM                   | Prisma 6 + PostgreSQL 16                             |
| Cache / Queue backend | Redis 7 (ioredis)                                    |
| Job queue             | BullMQ                                               |
| Testing               | Vitest (unit + integration, real DB/Redis)           |
| API docs              | OpenAPI 3 via @fastify/swagger + Swagger UI at /docs |

---

## Repository Layout (Source Code Map)

```text
Multi_Booking/
├── apps/
│   ├── api/                   # Fastify HTTP server (Entry point)
│   │   ├── src/
│   │   │   ├── plugins/       # Fastify plugins (cors, cookie, swagger, health, etc.)
│   │   │   ├── modules/       # Domain Feature Modules (The core business logic)
│   │   │   │   └── identity/  # Phase 2: Identity & Access Module
│   │   │   │       ├── domain/          # Entities, Policies (Actor, Role, AuthPolicy)
│   │   │   │       ├── repositories/    # DB Access (User, RefreshToken)
│   │   │   │       ├── use-cases/       # App Logic (Login, Register, Refresh)
│   │   │   │       └── routes/          # Fastify route handlers (auth, users)
│   │   │   ├── app.ts         # buildApp() — wires all plugins and modules
│   │   │   └── server.ts      # main() — binds port, graceful shutdown
│   │   └── tests/             # API Integration tests
│   │
│   └── worker/                # Background job processor (BullMQ)
│       ├── src/
│       │   ├── jobs/          # Job handlers (reminders, expirations)
│       │   └── worker.ts      # Worker initialization
│       └── tests/             # Worker tests
│
├── packages/                  # Shared internal libraries (Monorepo)
│   ├── config/                # Environment variable validation (Zod)
│   ├── database/              # Prisma schema, migrations, and generated client
│   │   └── prisma/
│   │       ├── schema.prisma  # PostgreSQL Schema (User, Business, Token, etc.)
│   │       └── migrations/    # Database migration history
│   ├── queue/                 # BullMQ connection & Job type definitions
│   ├── redis/                 # Shared ioredis client singleton
│   └── shared/                # Cross-package utilities
│       ├── src/
│       │   ├── errors/        # Base Error classes (AppError, DomainError)
│       │   ├── result/        # Monadic error handling (Result<T, E>)
│       │   └── utils/         # Helpers (e.g., luxon time manipulation)
│       └── tests/             # Shared logic tests
│
└── tests/                     # Global/E2E test setup
```

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

---

## Available Scripts

| Script                   | What it does                                |
| ------------------------ | ------------------------------------------- |
| `pnpm dev:api`           | Run API in watch mode                       |
| `pnpm test`              | Run all tests                               |
| `pnpm test:unit`         | Only packages/\*/tests (no DB/Redis needed) |
| `pnpm test:config`       | Config package tests only                   |
| `pnpm test:shared`       | Shared package tests only                   |
| `pnpm test:database`     | Prisma integration tests (needs DB)         |
| `pnpm test:watch`        | Vitest in interactive watch mode            |
| `pnpm db:migrate`        | prisma migrate dev                          |
| `pnpm db:migrate:deploy` | prisma migrate deploy (prod/CI)             |
| `pnpm db:migrate:reset`  | Reset + re-apply all migrations             |
| `pnpm db:seed`           | Run seed script                             |
| `pnpm db:generate`       | Regenerate Prisma client                    |
| `pnpm typecheck`         | tsc --noEmit across all packages            |
| `pnpm build`             | Build all packages                          |
| `pnpm clean`             | Remove all dist/ and node_modules/          |

---

## Architecture Notes

### Error Handling Contract

Every intentional error thrown by business logic **must** extend `AppError` from `@reservio/shared`.

- `DomainError` -> business rule violation -> HTTP 422 by default
- `InfraError` -> dependency failure -> HTTP 503 by default
- `error-handler.ts` catches AppError subclasses and formats them as `{ error: { code, message, details? } }`.
- Do **not** throw raw `Error` in domain/service layers.

### Result Type

Use `ok(value)` / `err(error)` from `@reservio/shared` for functions that can fail predictably without throwing. Prefer this over try/catch chains in service logic.

### Singleton Clients

`prisma`, `redis`, and `bookingQueue` are singletons stored on `globalThis` to survive hot-reloads without leaking connections. Never instantiate them directly — always import from their package index.

### Time Utilities

All time math must go through `@reservio/shared/utils/time`. The `localToUtc()` function uses Luxon and **rejects non-existent local times** (DST spring-forward gaps) by design — a booking cannot exist at a wall-clock time that does not exist.

### Fastify Plugin Registration Order

In `app.ts`, plugin order matters:
`cors` -> `swagger` -> `error-handler` -> `health` -> (feature modules)
Adding `/docs/json` as a manual route causes `FST_ERR_DUPLICATED_ROUTE` — `@fastify/swagger` already registers it.

### Docker Port Mapping

| Service    | Host Port | Container Port |
| ---------- | --------- | -------------- |
| PostgreSQL | **5433**  | 5432           |
| Redis      | **6380**  | 6379           |

Use `localhost:5433` / `localhost:6380` in `.env` when running API outside Docker.
Use `postgres:5432` / `redis:6379` when everything runs inside Docker.

---

## Test Coverage (Phase 2 — 304 tests, 100% pass)

| File                                         | Type        | Count |
| -------------------------------------------- | ----------- | ----- |
| `packages/config/tests/env-schema.test.ts`   | Unit        | 7     |
| `packages/shared/tests/errors.test.ts`       | Unit        | 54    |
| `packages/shared/tests/result.test.ts`       | Unit        | 29    |
| `packages/shared/tests/time.test.ts`         | Unit        | 52    |
| `packages/redis/tests/client.test.ts`        | Integration | 12    |
| `packages/database/tests/client.test.ts`     | Integration | 11    |
| `packages/queue/tests/booking-queue.test.ts` | Integration | 22    |
| `apps/worker/tests/jobs.test.ts`             | Integration | 32    |
| `apps/api/tests/health.test.ts`              | Integration | 13    |
| `apps/api/modules/tests/identity.test.ts`    | Integration | 67    |
| `apps/api/modules/tests/integration/refresh-rotation.test.ts` | Int | 5 |

---

## What Is Not Built Yet (Phase 3+)

- `catalogModule` — services, resources
- `availabilityModule` — slot generation, conflict detection
- `bookingsModule` — booking lifecycle, state machine
- Frontend (`apps/web`)

Feature module stubs are commented out in `app.ts` with their expected route prefixes.

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
