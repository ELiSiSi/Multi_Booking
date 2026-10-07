# Phase 1 — Infrastructure Shell: Technical Decisions

This document records the architectural decisions made during Phase 1 (Infrastructure) and the rationale behind each one.

---

## 1. Monorepo Architecture

### Decision
The project uses a **pnpm workspaces** monorepo structure, separating the system into applications (`apps/`) and reusable libraries (`packages/`).
- `apps/api`: Fastify-based HTTP server.
- `apps/worker`: BullMQ background job processor.
- `packages/config`, `packages/database`, `packages/redis`, `packages/queue`, `packages/shared`.

### Rationale
- Allows sharing database schemas, types, and logic seamlessly without publishing internal packages.
- pnpm's strict hoisting prevents phantom dependencies, ensuring robust builds.

## 2. Framework Choices

### Decision
- **API:** Fastify instead of Express or NestJS.
- **Database:** Prisma ORM with PostgreSQL.
- **Cache/Queue:** Redis + BullMQ.
- **Tests:** Vitest.

### Rationale
- **Fastify:** High performance, built-in JSON schema validation, and excellent plugin ecosystem.
- **Prisma:** Type-safe database queries and automated schema migrations.
- **BullMQ:** Robust job queueing, retries, and scheduled jobs out of the box using Redis.
- **Vitest:** Fast, modern, and zero-configuration testing that natively understands TypeScript.

## 3. Environment & Configuration

### Decision
Use a centralized `packages/config` module using `zod` for environment variable validation at startup.

### Rationale
- Ensures the application fails fast if required environment variables (like `DATABASE_URL` or `JWT_SECRET`) are missing or invalid, preventing unexpected runtime errors.
