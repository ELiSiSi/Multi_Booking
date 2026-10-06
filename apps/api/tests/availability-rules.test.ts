import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@reservio/database';

import { buildApp } from '../src/app.js';

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

interface TestResource {
  id: string;
}

const TEST_PASSWORD = 'TestPassword!123';

let app: FastifyInstance;
let adminA: TestUser;
let adminB: TestUser;
let businessA: TestBusiness;
let businessB: TestBusiness;
let locationA: TestLocation;
let locationB: TestLocation;
let resourceA: TestResource;
let resourceB: TestResource;

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

  const userId = (registerRes.json() as { user: { id: string } }).user.id;

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

  const accessToken = (loginRes.json() as { accessToken: string }).accessToken;

  return { id: userId, email, accessToken };
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
    payload: { name, timezone: 'UTC' },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: TestBusiness }).data;
}

async function createLocation(
  owner: TestUser,
  businessId: string,
  name: string,
): Promise<TestLocation> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations`,
    headers: authHeader(owner),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: TestLocation }).data;
}

async function createResource(
  owner: TestUser,
  businessId: string,
  locationId: string,
  name: string,
): Promise<TestResource> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/resources`,
    headers: authHeader(owner),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: TestResource }).data;
}

function rulesUrl(
  businessId: string,
  locationId: string,
  resourceId: string,
  ruleId?: string,
): string {
  const base = `/businesses/${businessId}/locations/${locationId}/resources/${resourceId}/availability-rules`;
  return ruleId ? `${base}/${ruleId}` : base;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  adminA = await registerAndLogin(`rules-a-${stamp}@test.local`, 'admin');
  adminB = await registerAndLogin(`rules-b-${stamp}@test.local`, 'admin');

  businessA = await createBusiness(adminA, `Rules Biz A ${stamp}`);
  businessB = await createBusiness(adminB, `Rules Biz B ${stamp}`);

  locationA = await createLocation(adminA, businessA.id, 'A-Main');
  locationB = await createLocation(adminB, businessB.id, 'B-Main');

  resourceA = await createResource(
    adminA,
    businessA.id,
    locationA.id,
    'A-Res',
  );
  resourceB = await createResource(
    adminB,
    businessB.id,
    locationB.id,
    'B-Res',
  );
});

afterAll(async () => {
  const businessIds = [businessA.id, businessB.id];
  const resourceIds = [resourceA.id, resourceB.id];

  await prisma.availabilityException.deleteMany({
    where: { resourceId: { in: resourceIds } },
  });
  await prisma.availabilityRule.deleteMany({
    where: { resourceId: { in: resourceIds } },
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
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });

  const userIds = [adminA.id, adminB.id];
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await app.close();
  await prisma.$disconnect();
});

describe('Availability Rule — POST', () => {
  it('creates an OPEN rule (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 1,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { id: string; weekday: number } };
    expect(body.data.weekday).toBe(1);
  });

  it('creates a BREAK rule (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 1,
        type: 'BREAK',
        startTime: '13:00',
        endTime: '14:00',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('accepts effective range', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 2,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
        effectiveFrom: '2027-01-01',
        effectiveTo: '2027-12-31',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('rejects weekday=0 (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 0,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects weekday=8 (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 8,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid startTime format (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 3,
        type: 'OPEN',
        startTime: '9:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects startTime >= endTime (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 3,
        type: 'OPEN',
        startTime: '17:00',
        endTime: '09:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects effectiveFrom > effectiveTo (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 3,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
        effectiveFrom: '2027-12-31',
        effectiveTo: '2027-01-01',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminB),
      payload: {
        weekday: 1,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const customer = await registerAndLogin(
      `rules-c-${Date.now()}@test.local`,
      'customer',
    );

    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(customer),
      payload: {
        weekday: 1,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(403);

    await prisma.refreshToken.deleteMany({ where: { userId: customer.id } });
    await prisma.user.delete({ where: { id: customer.id } });
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      payload: {
        weekday: 1,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects missing required fields (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        // missing weekday
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid type (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 2,
        type: 'CLOSED', // Not in enum
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts null for effective dates (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 2,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
        effectiveFrom: null,
        effectiveTo: null,
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Availability Rule — GET list', () => {
  it('returns rules for the owning admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Availability Rule — PATCH', () => {
  it('updates an existing rule (200)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '12:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
      payload: { endTime: '18:00' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { endTime: string } };
    expect(body.data.endTime).toBe('18:00');
  });

  it('rejects an update making startTime >= endTime (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
      payload: { startTime: '18:00' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty update body (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown rule (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(
        businessA.id,
        locationA.id,
        resourceA.id,
        '00000000-0000-0000-0000-000000000000',
      ),
      headers: authHeader(adminA),
      payload: { endTime: '18:00' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates weekday and type (200)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '12:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
      payload: { weekday: 5, type: 'BREAK' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { weekday: number; type: string } };
    expect(body.data.weekday).toBe(5);
    expect(body.data.type).toBe('BREAK');
  });

  it('rejects update making effectiveFrom > effectiveTo (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
        effectiveFrom: '2027-01-01',
        effectiveTo: '2027-12-31',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
      payload: { effectiveFrom: '2028-01-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid effectiveTo format (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
      payload: { effectiveTo: 'invalid-date' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a foreign admin from updating (404)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 4,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminB),
      payload: { endTime: '18:00' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Availability Rule — DELETE', () => {
  it('deletes an existing rule (204)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 5,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'DELETE',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(204);
  });

  it('rejects deleting twice (404)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 5,
        type: 'OPEN',
        startTime: '10:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    await app.inject({
      method: 'DELETE',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
    });

    const second = await app.inject({
      method: 'DELETE',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminA),
    });
    expect(second.statusCode).toBe(404);
  });

  it('rejects an unknown rule (404)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: rulesUrl(
        businessA.id,
        locationA.id,
        resourceA.id,
        '00000000-0000-0000-0000-000000000000',
      ),
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a foreign admin (404)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        weekday: 6,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });
    const ruleId = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'DELETE',
      url: rulesUrl(businessA.id, locationA.id, resourceA.id, ruleId),
      headers: authHeader(adminB),
    });
    expect(res.statusCode).toBe(404);
  });
});