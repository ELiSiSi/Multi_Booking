import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@reservio/database';

import { buildApp } from '../src/app.js';

// ─────────────────────────────────────────────────────────────
// Types + helpers
// ─────────────────────────────────────────────────────────────

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface TestBusiness {
  id: string;
}

interface TestLocation {
  id: string;
}

interface TestService {
  id: string;
}

interface TestResource {
  id: string;
}

const TEST_PASSWORD = 'TestPassword!123';

let app: FastifyInstance;

let adminA: TestUser;
let adminB: TestUser;
let customer: TestUser;

let businessA: TestBusiness;
let businessB: TestBusiness;

let locationA: TestLocation;
let locationB: TestLocation;
let locationA2: TestLocation;

let serviceA1: TestService;
let serviceB1: TestService;

let resourceA1: TestResource;
let resourceB1: TestResource;

async function registerAndLogin(
  email: string,
  role: 'admin' | 'customer',
): Promise<TestUser> {
  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: TEST_PASSWORD,
      fullName: role === 'admin' ? 'Admin User' : 'Customer User',
    },
  });

  expect(registerRes.statusCode).toBe(201);

  const registerBody = registerRes.json() as {
    user: { id: string };
  };

  const userId = registerBody.user.id;

  if (role === 'admin') {
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });
  }

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: TEST_PASSWORD },
  });

  expect(loginRes.statusCode).toBe(200);

  const loginBody = loginRes.json() as {
    accessToken: string;
  };

  return {
    id: userId,
    email,
    accessToken: loginBody.accessToken,
  };
}

function authHeader(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.accessToken}` };
}

async function createBusiness(
  owner: TestUser,
  name: string,
): Promise<TestBusiness> {
  const res = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(owner),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as TestBusiness;
}

async function createLocation(
  owner: TestUser,
  businessId: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: { data?: TestLocation } }> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations`,
    headers: authHeader(owner),
    payload: { name, ...extra },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function createService(
  owner: TestUser,
  businessId: string,
  locationId: string,
  name: string,
  durationMinutes = 30,
  priceCents = 10000,
): Promise<TestService> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services`,
    headers: authHeader(owner),
    payload: { name, durationMinutes, priceCents },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as TestService;
}

async function createResource(
  owner: TestUser,
  businessId: string,
  locationId: string,
  name: string,
  bufferMinutes?: number,
): Promise<TestResource> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/resources`,
    headers: authHeader(owner),
    payload: {
      name,
      ...(bufferMinutes !== undefined && { bufferMinutes }),
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as TestResource;
}

// ─────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  adminA = await registerAndLogin(`cat-a-${stamp}@test.local`, 'admin');
  adminB = await registerAndLogin(`cat-b-${stamp}@test.local`, 'admin');
  customer = await registerAndLogin(`cat-c-${stamp}@test.local`, 'customer');

  businessA = await createBusiness(adminA, `Biz A ${stamp}`);
  businessB = await createBusiness(adminB, `Biz B ${stamp}`);

  const locA = await createLocation(adminA, businessA.id, 'A-Main');
  const locB = await createLocation(adminB, businessB.id, 'B-Main');
  const locA2 = await createLocation(adminA, businessA.id, 'A-Second');

  expect(locA.statusCode).toBe(201);
  expect(locB.statusCode).toBe(201);
  expect(locA2.statusCode).toBe(201);

  locationA = locA.body.data!;
  locationB = locB.body.data!;
  locationA2 = locA2.body.data!;

  serviceA1 = await createService(adminA, businessA.id, locationA.id, 'A-Svc-1');
  serviceB1 = await createService(adminB, businessB.id, locationB.id, 'B-Svc-1');

  resourceA1 = await createResource(adminA, businessA.id, locationA.id, 'A-Res-1');
  resourceB1 = await createResource(adminB, businessB.id, locationB.id, 'B-Res-1');
});

afterAll(async () => {
  const businessIds = [businessA.id, businessB.id];

  await prisma.serviceResource.deleteMany({
    where: {
      service: { location: { businessId: { in: businessIds } } },
    },
  });

  await prisma.service.deleteMany({
    where: { location: { businessId: { in: businessIds } } },
  });

  await prisma.resource.deleteMany({
    where: { location: { businessId: { in: businessIds } } },
  });

  await prisma.location.deleteMany({
    where: { businessId: { in: businessIds } },
  });

  await prisma.business.deleteMany({
    where: { id: { in: businessIds } },
  });

  const userIds = [adminA.id, adminB.id, customer.id];

  await prisma.refreshToken.deleteMany({
    where: { userId: { in: userIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });

  await app.close();
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Location — POST
// ─────────────────────────────────────────────────────────────

describe('Location — POST', () => {
  it('creates a location as the owning admin (201)', async () => {
    const res = await createLocation(adminA, businessA.id, 'A-Third');
    expect(res.statusCode).toBe(201);
    expect(res.body.data?.id).toBeDefined();
  });

  it('rejects a customer (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(customer),
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a foreign admin (404 business not found)', async () => {
    const res = await createLocation(adminB, businessA.id, 'Hijack');
    expect(res.statusCode).toBe(404);
  });

  it('rejects a duplicate name in the same business (409)', async () => {
    const res = await createLocation(adminA, businessA.id, 'A-Main');
    expect(res.statusCode).toBe(409);
  });

  it('rejects an empty name (400)', async () => {
    const res = await createLocation(adminA, businessA.id, '   ');
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid IANA timezone (400)', async () => {
    const res = await createLocation(adminA, businessA.id, 'Bad-TZ', {
      timezone: 'hello/world',
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid IANA timezone', async () => {
    const res = await createLocation(adminA, businessA.id, 'Good-TZ', {
      timezone: 'Africa/Cairo',
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────
// Location — POST — edge cases
// ─────────────────────────────────────────────────────────────

describe('Location — POST — edge cases', () => {
  it('accepts omitted timezone and uses business default', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'No-Timezone-Override',
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { timezone: string | null };
    expect(body.timezone).toBeNull();
  });

  it('treats empty timezone as no override', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Empty-Timezone',
      { timezone: '' },
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { timezone: string | null };
    expect(body.timezone).toBeNull();
  });

  it('treats whitespace-only timezone as no override', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Whitespace-Timezone',
      { timezone: '   ' },
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { timezone: string | null };
    expect(body.timezone).toBeNull();
  });

  it('accepts a valid IANA timezone', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Valid-Timezone',
      { timezone: 'Europe/London' },
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { timezone: string | null };
    expect(body.timezone).toBe('Europe/London');
  });

  it('rejects an invalid timezone', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Invalid-Timezone',
      { timezone: 'Not/A-Timezone' },
    );

    expect(res.statusCode).toBe(400);
  });

  it('treats empty address as null', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Empty-Address',
      { address: '' },
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { address: string | null };
    expect(body.address).toBeNull();
  });

  it('treats whitespace-only address as null', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Whitespace-Address',
      { address: '   ' },
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { address: string | null };
    expect(body.address).toBeNull();
  });

  it('trims a valid address', async () => {
    const res = await createLocation(
      adminA,
      businessA.id,
      'Trimmed-Address',
      { address: '  12 Nile Street  ' },
    );

    expect(res.statusCode).toBe(201);

    const body = res.body.data as { address: string | null };
    expect(body.address).toBe('12 Nile Street');
  });

  it('rejects a missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminA),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-string name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminA),
      payload: { name: 123 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid business UUID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses/not-a-uuid/locations',
      headers: authHeader(adminA),
      payload: { name: 'Invalid Business Id' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown business id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses/00000000-0000-0000-0000-000000000000/locations',
      headers: authHeader(adminA),
      payload: { name: 'Unknown Business' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects extra properties', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminA),
      payload: {
        name: 'Extra Property',
        hackerField: true,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${businessA.id}/locations`,
      payload: { name: 'Unauthenticated' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a customer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(customer),
      payload: { name: 'Customer Location' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects a foreign admin', async () => {
    const res = await createLocation(
      adminB,
      businessA.id,
      'Foreign Admin',
    );

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// Location — GET list
// ─────────────────────────────────────────────────────────────

describe('Location — GET list', () => {
  it('returns locations owned by the caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// Location — GET list — edge cases
// ─────────────────────────────────────────────────────────────

describe('Location — GET list — edge cases', () => {
  it('returns only locations from the requested owned business', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: Array<{ id: string }> };

    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((x) => x.id === locationA.id)).toBe(true);
    expect(body.data.some((x) => x.id === locationB.id)).toBe(false);
  });

  it('supports limit=1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations?limit=1`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      data: Array<{ id: string }>;
      meta: { nextCursor: string | null };
    };

    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  it('rejects limit below 1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations?limit=0`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects limit above 100', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations?limit=101`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid cursor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations?cursor=invalid`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(400);
  });

  it('paginates using nextCursor', async () => {
    const first = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations?limit=1`,
      headers: authHeader(adminA),
    });

    expect(first.statusCode).toBe(200);

    const firstBody = first.json() as {
      data: Array<{ id: string }>;
      meta: { nextCursor: string | null };
    };

    expect(firstBody.data).toHaveLength(1);

    if (firstBody.meta.nextCursor) {
      const second = await app.inject({
        method: 'GET',
        url: `/businesses/${businessA.id}/locations?limit=1&cursor=${firstBody.meta.nextCursor}`,
        headers: authHeader(adminA),
      });

      expect(second.statusCode).toBe(200);

      const secondBody = second.json() as { data: Array<{ id: string }> };

      expect(secondBody.data.length).toBeLessThanOrEqual(1);

      if (secondBody.data.length > 0) {
        expect(secondBody.data[0]?.id).not.toBe(firstBody.data[0]?.id);
      }
    }
  });

  it('rejects a foreign admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(adminB),
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
      headers: authHeader(customer),
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations`,
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// Location — GET one
// ─────────────────────────────────────────────────────────────

describe('Location — GET one', () => {
  it('returns the location for the owning admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { id: string } };
    expect(body.data.id).toBe(locationA.id);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown location id (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// Location — GET one — edge cases
// ─────────────────────────────────────────────────────────────

describe('Location — GET one — edge cases', () => {
  it('returns the owned location', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { id: string; name: string } };
    expect(body.data.id).toBe(locationA.id);
  });

  it('rejects location from another business', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/${locationB.id}`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid business UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/not-a-uuid/locations/${locationA.id}`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid location UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/not-a-uuid`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown location', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects customer access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(customer),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────
// Location — PATCH
// ─────────────────────────────────────────────────────────────

describe('Location — PATCH', () => {
  it('updates a location owned by the caller', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { name: 'A-Second-Updated' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { name: string } };
    expect(body.data.name).toBe('A-Second-Updated');
  });

  it('rejects a cross-owner update (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminB),
      payload: { name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an empty update body (400)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminA),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts clearing the timezone via null', async () => {
    const createRes = await createLocation(adminA, businessA.id, 'TZ-Clear', {
      timezone: 'Europe/London',
    });
    const locId = createRes.body.data!.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locId}`,
      headers: authHeader(adminA),
      payload: { timezone: null },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { timezone: string | null } };
    expect(body.data.timezone).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Location — PATCH — edge cases
// ─────────────────────────────────────────────────────────────

describe('Location — PATCH — edge cases', () => {
  it('updates the name', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { name: 'A-Second-Renamed' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { name: string } };
    expect(body.data.name).toBe('A-Second-Renamed');
  });

  it('updates isActive to false', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { isActive: boolean } };
    expect(body.data.isActive).toBe(false);
  });

  it('updates isActive back to true', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { isActive: true },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { isActive: boolean } };
    expect(body.data.isActive).toBe(true);
  });

  it('sets a timezone override', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { timezone: 'Europe/London' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { timezone: string | null } };
    expect(body.data.timezone).toBe('Europe/London');
  });

  it('clears timezone with null', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { timezone: null },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { timezone: string | null } };
    expect(body.data.timezone).toBeNull();
  });

  it('clears timezone with empty string', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { timezone: '' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { timezone: string | null } };
    expect(body.data.timezone).toBeNull();
  });

  it('clears timezone with whitespace', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { timezone: '   ' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { timezone: string | null } };
    expect(body.data.timezone).toBeNull();
  });

  it('rejects invalid timezone', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { timezone: 'bad/timezone' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('updates address', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { address: '  New Address  ' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { address: string | null } };
    expect(body.data.address).toBe('New Address');
  });

  it('clears address with null', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { address: null },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { address: string | null } };
    expect(body.data.address).toBeNull();
  });

  it('clears address with empty string', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { address: '' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { address: string | null } };
    expect(body.data.address).toBeNull();
  });

  it('clears address with whitespace', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { address: '   ' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { address: string | null } };
    expect(body.data.address).toBeNull();
  });

  it('rejects empty patch body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown properties', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: {
        name: 'Valid',
        unknownField: 'blocked',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid business UUID', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/not-a-uuid/locations/${locationA2.id}`,
      headers: authHeader(adminA),
      payload: { name: 'Invalid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid location UUID', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/not-a-uuid`,
      headers: authHeader(adminA),
      payload: { name: 'Invalid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown location', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/00000000-0000-0000-0000-000000000000`,
      headers: authHeader(adminA),
      payload: { name: 'Unknown' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects cross-business update', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationB.id}`,
      headers: authHeader(adminA),
      payload: { name: 'Cross Business' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects foreign admin update', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminB),
      payload: { name: 'Hijacked' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects customer update', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(customer),
      payload: { name: 'Customer Update' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects attempts to modify ownership through body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${businessA.id}/locations/${locationA.id}`,
      headers: authHeader(adminA),
      payload: {
        businessId: businessB.id,
        name: 'Tampered',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});