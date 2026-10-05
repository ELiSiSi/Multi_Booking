import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import {
  authHeader,
  buildFixtures,
  cleanupFixtures,
  type CatalogFixtures,
} from './_catalog-helpers.js';

let app: FastifyInstance;
let f: CatalogFixtures;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  f = await buildFixtures(app, 'svc');
});

afterAll(async () => {
  await cleanupFixtures(f);
  await app.close();
});

// ─────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────

describe('Service — POST', () => {
  it('creates a service as the owning admin (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'Svc New', durationMinutes: 45, priceCents: 20000 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { durationMinutes: number; priceCents: number; currency: string } };
    expect(body.data.durationMinutes).toBe(45);
    expect(body.data.priceCents).toBe(20000);
    expect(body.data.currency).toBe('USD');
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.customer),
      payload: { name: 'X', durationMinutes: 30, priceCents: 1000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminB),
      payload: { name: 'X', durationMinutes: 30, priceCents: 1000 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a duplicate name in the same location (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'Svc A1', durationMinutes: 30, priceCents: 1000 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects an empty name (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: '   ', durationMinutes: 30, priceCents: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects duration = 0 (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'Bad Duration', durationMinutes: 0, priceCents: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects negative price (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'Bad Price', durationMinutes: 30, priceCents: -1 },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────
// POST — currency normalization
// ─────────────────────────────────────────────────────────────

describe('Service — POST — currency', () => {
  it('normalizes lowercase currency to uppercase', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: {
        name: 'Lower Currency',
        durationMinutes: 30,
        priceCents: 1000,
        currency: 'egp',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { currency: string } };
    expect(body.data.currency).toBe('EGP');
  });

  it('normalizes mixed-case currency', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: {
        name: 'Mixed Currency',
        durationMinutes: 30,
        priceCents: 1000,
        currency: 'EgP',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { currency: string } };
    expect(body.data.currency).toBe('EGP');
  });

  it('rejects currency with digits (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: {
        name: 'Digit Currency',
        durationMinutes: 30,
        priceCents: 1000,
        currency: 'US1',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects currency with symbols (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: {
        name: 'Symbol Currency',
        durationMinutes: 30,
        priceCents: 1000,
        currency: 'US$',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects currency shorter than 3 (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: {
        name: 'Short Currency',
        durationMinutes: 30,
        priceCents: 1000,
        currency: 'US',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────
// GET list
// ─────────────────────────────────────────────────────────────

describe('Service — GET list', () => {
  it('returns services owned by the caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.customer),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('supports limit=1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services?limit=1`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  it('rejects limit=0 (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services?limit=0`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects limit=101 (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services?limit=101`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid cursor (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services?cursor=invalid`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('supports cursor pagination', async () => {
    // Create an extra service to ensure we have at least 2
    await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'Pagination Svc', durationMinutes: 30, priceCents: 1000 },
    });

    const res1 = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services?limit=1`,
      headers: authHeader(f.adminA),
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { data: Array<{ id: string }>, meta: { nextCursor: string | null } };
    expect(body1.data.length).toBe(1);
    expect(body1.meta.nextCursor).toBeDefined();

    if (body1.meta.nextCursor) {
      const res2 = await app.inject({
        method: 'GET',
        url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services?limit=1&cursor=${body1.meta.nextCursor}`,
        headers: authHeader(f.adminA),
      });
      expect(res2.statusCode).toBe(200);
      const body2 = res2.json() as { data: Array<{ id: string }> };
      expect(body2.data.length).toBeLessThanOrEqual(1);
      if (body2.data.length === 1) {
        expect(body2.data[0].id).not.toBe(body1.data[0].id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// GET one
// ─────────────────────────────────────────────────────────────

describe('Service — GET one', () => {
  it('returns the service for the owning admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { id: string } };
    expect(body.data.id).toBe(f.serviceA1.id);
  });

  it('rejects a service from another business (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceB1.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown service id (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.adminB),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// PATCH
// ─────────────────────────────────────────────────────────────

describe('Service — PATCH', () => {
  it('updates name', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Svc 1', durationMinutes: 30, priceCents: 1000 },
    });
    const svcId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svcId}`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Svc 1 Updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { name: string } };
    expect(body.data.name).toBe('PATCH Svc 1 Updated');
  });

  it('updates duration and price', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Svc 2', durationMinutes: 30, priceCents: 1000 },
    });
    const svcId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svcId}`,
      headers: authHeader(f.adminA),
      payload: { durationMinutes: 90, priceCents: 50000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { durationMinutes: number; priceCents: number } };
    expect(body.data.durationMinutes).toBe(90);
    expect(body.data.priceCents).toBe(50000);
  });

  it('updates isActive to false', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Svc 3', durationMinutes: 30, priceCents: 1000 },
    });
    const svcId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svcId}`,
      headers: authHeader(f.adminA),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { isActive: boolean } };
    expect(body.data.isActive).toBe(false);
  });

  it('normalizes currency on update', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Svc 4', durationMinutes: 30, priceCents: 1000 },
    });
    const svcId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svcId}`,
      headers: authHeader(f.adminA),
      payload: { currency: 'eur' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { currency: string } };
    expect(body.data.currency).toBe('EUR');
  });

  it('rejects an empty update body (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.adminA),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a duplicate name (409)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Svc 1 Updated' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a cross-owner update (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.adminB),
      payload: { name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer update (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.customer),
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects unknown properties (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}`,
      headers: authHeader(f.adminA),
      payload: { name: 'Valid', hack: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects updating an unknown service id (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(f.adminA),
      payload: { name: 'Does Not Exist' },
    });
    expect(res.statusCode).toBe(404);
  });
});