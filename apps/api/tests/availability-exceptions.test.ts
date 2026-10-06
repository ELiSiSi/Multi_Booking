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

function exceptionsUrl(
  businessId: string,
  locationId: string,
  resourceId: string,
  exceptionId?: string,
): string {
  const base = `/businesses/${businessId}/locations/${locationId}/resources/${resourceId}/availability-exceptions`;
  return exceptionId ? `${base}/${exceptionId}` : base;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  adminA = await registerAndLogin(`exc-a-${stamp}@test.local`, 'admin');
  adminB = await registerAndLogin(`exc-b-${stamp}@test.local`, 'admin');

  businessA = await createBusiness(adminA, `Exc Biz A ${stamp}`);
  businessB = await createBusiness(adminB, `Exc Biz B ${stamp}`);

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

describe('Availability Exception — POST', () => {
  it('creates a CLOSED exception (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-25',
        type: 'CLOSED',
        reason: 'Christmas',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { id: string; type: string } };
    expect(body.data.type).toBe('CLOSED');
  });

  it('creates a CUSTOM_HOURS exception (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-26',
        type: 'CUSTOM_HOURS',
        startTime: '10:00',
        endTime: '14:00',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('creates a BREAK exception (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-27',
        type: 'BREAK',
        startTime: '12:00',
        endTime: '13:00',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects CLOSED with startTime (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-28',
        type: 'CLOSED',
        startTime: '09:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects CUSTOM_HOURS without times (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-29',
        type: 'CUSTOM_HOURS',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects BREAK with startTime >= endTime (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-30',
        type: 'BREAK',
        startTime: '13:00',
        endTime: '12:00',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid date format (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: 'not-a-date',
        type: 'CLOSED',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminB),
      payload: {
        date: '2027-12-25',
        type: 'CLOSED',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      payload: {
        date: '2027-12-25',
        type: 'CLOSED',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a customer (403)', async () => {
    const customer = await registerAndLogin(
      `exc-c-${Date.now()}@test.local`,
      'customer',
    );

    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(customer),
      payload: {
        date: '2027-12-25',
        type: 'CLOSED',
      },
    });
    expect(res.statusCode).toBe(403);

    await prisma.refreshToken.deleteMany({ where: { userId: customer.id } });
    await prisma.user.delete({ where: { id: customer.id } });
  });

  it('rejects missing required fields (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        // date missing
        type: 'CLOSED',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid type (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2027-12-25',
        type: 'INVALID_TYPE',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Availability Exception — GET list', () => {
  it('returns exceptions for the owning admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('rejects a foreign admin (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminB),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Availability Exception — PATCH', () => {
  it('updates reason (200)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-01',
        type: 'CLOSED',
        reason: 'New Year',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
      payload: { reason: 'New Year (updated)' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { reason: string } };
    expect(body.data.reason).toBe('New Year (updated)');
  });

  it('switching to CLOSED clears times (200)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-02',
        type: 'BREAK',
        startTime: '10:00',
        endTime: '11:00',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
      payload: { type: 'CLOSED' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { type: string; startTime: string | null; endTime: string | null };
    };
    expect(body.data.type).toBe('CLOSED');
    expect(body.data.startTime).toBeNull();
    expect(body.data.endTime).toBeNull();
  });

  it('rejects an empty update body (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-03',
        type: 'CLOSED',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown exception (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(
        businessA.id,
        locationA.id,
        resourceA.id,
        '00000000-0000-0000-0000-000000000000',
      ),
      headers: authHeader(adminA),
      payload: { reason: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a foreign admin (404)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-04',
        type: 'CLOSED',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminB),
      payload: { reason: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects switching from CLOSED to CUSTOM_HOURS without times (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-05',
        type: 'CLOSED',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
      payload: { type: 'CUSTOM_HOURS' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('updates times successfully for CUSTOM_HOURS (200)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-06',
        type: 'CUSTOM_HOURS',
        startTime: '09:00',
        endTime: '12:00',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
      payload: { startTime: '10:00', endTime: '14:00' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { startTime: string; endTime: string } };
    expect(body.data.startTime).toBe('10:00');
    expect(body.data.endTime).toBe('14:00');
  });

  it('rejects update where startTime >= endTime (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-01-07',
        type: 'CUSTOM_HOURS',
        startTime: '09:00',
        endTime: '12:00',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
      payload: { startTime: '13:00' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Availability Exception — DELETE', () => {
  it('deletes an existing exception (204)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-02-01',
        type: 'CLOSED',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'DELETE',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
    });
    expect(res.statusCode).toBe(204);
  });

  it('rejects deleting twice (404)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-02-02',
        type: 'CLOSED',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    await app.inject({
      method: 'DELETE',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
    });

    const second = await app.inject({
      method: 'DELETE',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminA),
    });
    expect(second.statusCode).toBe(404);
  });

  it('rejects an unknown exception (404)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: exceptionsUrl(
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
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id),
      headers: authHeader(adminA),
      payload: {
        date: '2028-02-03',
        type: 'CLOSED',
      },
    });
    const id = (createRes.json() as { data: { id: string } }).data.id;

    const res = await app.inject({
      method: 'DELETE',
      url: exceptionsUrl(businessA.id, locationA.id, resourceA.id, id),
      headers: authHeader(adminB),
    });
    expect(res.statusCode).toBe(404);
  });
});