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
  f = await buildFixtures(app, 'res');
});

afterAll(async () => {
  await cleanupFixtures(f);
  await app.close();
});

// ─────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────

describe('Resource — POST', () => {
  it('creates a resource as the owning admin (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'Res New' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { bufferMinutes: number | null } };
    expect(body.data.bufferMinutes).toBeNull();
  });

  it('accepts explicit bufferMinutes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'Res Buf', bufferMinutes: 15 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { bufferMinutes: number | null } };
    expect(body.data.bufferMinutes).toBe(15);
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.customer),
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminB),
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a duplicate name in the same location (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'Res A1' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects an empty name (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects negative bufferMinutes (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'Bad Buf', bufferMinutes: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown properties (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'Hack', hack: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      payload: { name: 'Anon' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// GET list
// ─────────────────────────────────────────────────────────────

describe('Resource — GET list', () => {
  it('returns resources owned by the caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.customer),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('supports limit=1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources?limit=1`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  it('rejects limit=0 (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources?limit=0`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects limit=101 (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources?limit=101`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid cursor (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources?cursor=invalid`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('supports cursor pagination', async () => {
    // Create an extra resource to ensure we have at least 2
    await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'Pagination Res' },
    });

    const res1 = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources?limit=1`,
      headers: authHeader(f.adminA),
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { data: Array<{ id: string }>, meta: { nextCursor: string | null } };
    expect(body1.data.length).toBe(1);
    expect(body1.meta.nextCursor).toBeDefined();

    if (body1.meta.nextCursor) {
      const res2 = await app.inject({
        method: 'GET',
        url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources?limit=1&cursor=${body1.meta.nextCursor}`,
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

describe('Resource — GET one', () => {
  it('returns the resource for the owning admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { id: string } };
    expect(body.data.id).toBe(f.resourceA1.id);
  });

  it('rejects a resource from another business (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceB1.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown resource id (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an invalid UUID (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/not-a-uuid`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────
// PATCH
// ─────────────────────────────────────────────────────────────

describe('Resource — PATCH', () => {
  it('updates name', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Res 1' },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${id}`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Res 1 Updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { name: string } };
    expect(body.data.name).toBe('PATCH Res 1 Updated');
  });

  it('sets bufferMinutes', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Res 2' },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${id}`,
      headers: authHeader(f.adminA),
      payload: { bufferMinutes: 20 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { bufferMinutes: number | null } };
    expect(body.data.bufferMinutes).toBe(20);
  });

  it('clears bufferMinutes with null', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Res 3', bufferMinutes: 30 },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${id}`,
      headers: authHeader(f.adminA),
      payload: { bufferMinutes: null },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { bufferMinutes: number | null } };
    expect(body.data.bufferMinutes).toBeNull();
  });

  it('updates isActive to false', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources`,
      headers: authHeader(f.adminA),
      payload: { name: 'PATCH Res 4' },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${id}`,
      headers: authHeader(f.adminA),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { isActive: boolean } };
    expect(body.data.isActive).toBe(false);
  });

  it('rejects negative bufferMinutes (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.adminA),
      payload: { bufferMinutes: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty update body (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.adminA),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a cross-owner update (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.adminB),
      payload: { name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer update (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.customer),
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects unknown properties (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${f.resourceA1.id}`,
      headers: authHeader(f.adminA),
      payload: { name: 'Valid', hack: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects updating an unknown resource id (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(f.adminA),
      payload: { name: 'Does Not Exist' },
    });
    expect(res.statusCode).toBe(404);
  });
});