import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@reservio/database';

import { buildApp } from '../src/app.js';
import {
  authHeader,
  buildFixtures,
  cleanupFixtures,
  type CatalogFixtures,
  type TestLocation,
  type TestResource,
  type TestService,
} from './_catalog-helpers.js';

let app: FastifyInstance;
let f: CatalogFixtures;

// Second location inside business A, used for cross-location tests
let locationA2: TestLocation;
let serviceA2: TestService;
let resourceA2: TestResource;
let resourceA3: TestResource;

async function createLocation(
  businessId: string,
  name: string,
): Promise<TestLocation> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations`,
    headers: authHeader(f.adminA),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as TestLocation;
}

async function createService(
  businessId: string,
  locationId: string,
  name: string,
): Promise<TestService> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services`,
    headers: authHeader(f.adminA),
    payload: { name, durationMinutes: 30, priceCents: 10000 },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as TestService;
}

async function createResource(
  businessId: string,
  locationId: string,
  name: string,
): Promise<TestResource> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/resources`,
    headers: authHeader(f.adminA),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as TestResource;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  f = await buildFixtures(app, 'sr');

  locationA2 = await createLocation(f.businessA.id, 'SR Location A2');
  serviceA2 = await createService(f.businessA.id, locationA2.id, 'SR Svc A2');
  resourceA2 = await createResource(f.businessA.id, locationA2.id, 'SR Res A2');
  resourceA3 = await createResource(f.businessA.id, f.locationA.id, 'SR Res A3');
});

afterAll(async () => {
  await cleanupFixtures(f);
  await app.close();
});

// ─────────────────────────────────────────────────────────────
// POST (assign)
// ─────────────────────────────────────────────────────────────

describe('ServiceResource — POST (assign)', () => {
  it('assigns a resource to a service (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA3.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { serviceId: string; resourceId: string } };
    expect(body.data.serviceId).toBe(f.serviceA1.id);
    expect(body.data.resourceId).toBe(resourceA3.id);
  });

  it('rejects a duplicate assignment (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA3.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects cross-location assignment (404)', async () => {
    // serviceA1 is in locationA, resourceA2 is in locationA2
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA2.id}`,
      headers: authHeader(f.adminA),
    });
    // Resource not found in locationA
    expect(res.statusCode).toBe(404);
  });

  it('rejects a service from another business (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceB1.id}/resources/${resourceA3.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a resource from another business (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${f.resourceB1.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an inactive service (409)', async () => {
    const newSvc = await createService(f.businessA.id, f.locationA.id, 'Inactive Svc');
    const newRes = await createResource(f.businessA.id, f.locationA.id, 'Inactive Res');

    // Deactivate service
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${newSvc.id}`,
      headers: authHeader(f.adminA),
      payload: { isActive: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${newSvc.id}/resources/${newRes.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects an inactive resource (409)', async () => {
    const newSvc = await createService(f.businessA.id, f.locationA.id, 'Active Svc 2');
    const newRes = await createResource(f.businessA.id, f.locationA.id, 'Inactive Res 2');

    // Deactivate resource
    await app.inject({
      method: 'PATCH',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/resources/${newRes.id}`,
      headers: authHeader(f.adminA),
      payload: { isActive: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${newSvc.id}/resources/${newRes.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA2.id}`,
      headers: authHeader(f.adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA2.id}`,
      headers: authHeader(f.customer),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA2.id}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid service UUID (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/not-a-uuid/resources/${resourceA3.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid resource UUID (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/not-a-uuid`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects assigning an unknown service id (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/00000000-0000-0000-0000-000000000000/resources/${resourceA3.id}`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects assigning an unknown resource id (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// GET (list by service)
// ─────────────────────────────────────────────────────────────

describe('ServiceResource — GET (list by service)', () => {
  it('returns assignments for the owning admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ serviceId: string; resourceId: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    for (const a of body.data) {
      expect(a.serviceId).toBe(f.serviceA1.id);
    }
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources`,
      headers: authHeader(f.adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources`,
      headers: authHeader(f.customer),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a service from another business (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceB1.id}/resources`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown service id (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/00000000-0000-0000-0000-000000000000/resources`,
      headers: authHeader(f.adminA),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE (unassign)
// ─────────────────────────────────────────────────────────────

describe('ServiceResource — DELETE (unassign)', () => {
  it('unassigns an existing assignment (204)', async () => {
    const svc = await createService(f.businessA.id, f.locationA.id, 'Unassign Svc');
    const res = await createResource(f.businessA.id, f.locationA.id, 'Unassign Res');

    // assign
    const assignRes = await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svc.id}/resources/${res.id}`,
      headers: authHeader(f.adminA),
    });
    expect(assignRes.statusCode).toBe(201);

    // unassign
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svc.id}/resources/${res.id}`,
      headers: authHeader(f.adminA),
    });
    expect(delRes.statusCode).toBe(204);

    // confirm removed
    const check = await prisma.serviceResource.findUnique({
      where: { serviceId_resourceId: { serviceId: svc.id, resourceId: res.id } },
    });
    expect(check).toBeNull();
  });

  it('rejects unassigning a non-existent assignment (404)', async () => {
    const svc = await createService(f.businessA.id, f.locationA.id, 'Unassign Svc 2');
    const res = await createResource(f.businessA.id, f.locationA.id, 'Unassign Res 2');

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svc.id}/resources/${res.id}`,
      headers: authHeader(f.adminA),
    });
    expect(delRes.statusCode).toBe(404);
  });

  it('rejects unassigning twice (404 on second)', async () => {
    const svc = await createService(f.businessA.id, f.locationA.id, 'Unassign Svc 3');
    const res = await createResource(f.businessA.id, f.locationA.id, 'Unassign Res 3');

    await app.inject({
      method: 'POST',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svc.id}/resources/${res.id}`,
      headers: authHeader(f.adminA),
    });

    const first = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svc.id}/resources/${res.id}`,
      headers: authHeader(f.adminA),
    });
    expect(first.statusCode).toBe(204);

    const second = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${svc.id}/resources/${res.id}`,
      headers: authHeader(f.adminA),
    });
    expect(second.statusCode).toBe(404);
  });

  it('rejects a foreign admin (404)', async () => {
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA3.id}`,
      headers: authHeader(f.adminB),
    });
    expect(delRes.statusCode).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA3.id}`,
      headers: authHeader(f.customer),
    });
    expect(delRes.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/businesses/${f.businessA.id}/locations/${f.locationA.id}/services/${f.serviceA1.id}/resources/${resourceA3.id}`,
    });
    expect(delRes.statusCode).toBe(401);
  });
});