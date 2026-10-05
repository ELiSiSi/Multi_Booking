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
let businessA: TestBusiness;
let businessB: TestBusiness;
let locationA: TestLocation;
let locationB: TestLocation;
let serviceA: TestService;
let serviceB: TestService;
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

async function createService(
  owner: TestUser,
  businessId: string,
  locationId: string,
  name: string,
  durationMinutes: number,
): Promise<TestService> {
  const res = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services`,
    headers: authHeader(owner),
    payload: { name, durationMinutes, priceCents: 10000 },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: TestService }).data;
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

async function seedMonToFri(
  resourceId: string,
  openStart = '09:00',
  openEnd = '17:00',
): Promise<void> {
  for (const weekday of [1, 2, 3, 4, 5]) {
    await prisma.availabilityRule.create({
      data: {
        resourceId,
        weekday,
        type: 'OPEN',
        startTime: openStart,
        endTime: openEnd,
      },
    });
  }
}

function fetchAvailability(
  businessId: string,
  locationId: string,
  resourceId: string,
  serviceId: string,
  date: string,
  user?: TestUser,
): Promise<{ statusCode: number; body: unknown }> {
  return app
    .inject({
      method: 'GET',
      url: `/businesses/${businessId}/locations/${locationId}/resources/${resourceId}/services/${serviceId}/availability?date=${date}`,
      ...(user && { headers: authHeader(user) }),
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json() }));
}

// ─────────────────────────────────────────────────────────────

// 2027-10-04 is a Monday (weekday 1).
const MONDAY = '2027-10-04';
// 2027-10-09 is a Saturday (weekday 6) — no rules seeded.
const SATURDAY = '2027-10-09';

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  adminA = await registerAndLogin(`av-a-${stamp}@test.local`, 'admin');
  adminB = await registerAndLogin(`av-b-${stamp}@test.local`, 'admin');

  businessA = await createBusiness(adminA, `AV A ${stamp}`);
  businessB = await createBusiness(adminB, `AV B ${stamp}`);

  locationA = await createLocation(adminA, businessA.id, 'A-Main');
  locationB = await createLocation(adminB, businessB.id, 'B-Main');

  serviceA = await createService(
    adminA,
    businessA.id,
    locationA.id,
    'A-Svc',
    30,
  );
  serviceB = await createService(
    adminB,
    businessB.id,
    locationB.id,
    'B-Svc',
    30,
  );

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

  await seedMonToFri(resourceA.id);
  await seedMonToFri(resourceB.id);
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
  await prisma.serviceResource.deleteMany({
    where: { service: { location: { businessId: { in: businessIds } } } },
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

  const userIds = [adminA.id, adminB.id];
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await app.close();
  await prisma.$disconnect();
});

describe('Availability — GET', () => {
  it('returns slots for a Monday with 09:00–17:00 (30-min service, 15-min granularity)', async () => {
    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      MONDAY,
      adminA,
    );

    expect(res.statusCode).toBe(200);
    const data = (res.body as { data: { slots: { startAt: string }[]; timezone: string } }).data;
    expect(data.timezone).toBe('UTC');
    expect(data.slots).toHaveLength(31);
    expect(data.slots[0]!.startAt).toBe('2027-10-04T09:00:00.000Z');
    expect(data.slots[data.slots.length - 1]!.startAt).toBe(
      '2027-10-04T16:30:00.000Z',
    );
  });

  it('returns zero slots on a day with no recurring rules', async () => {
    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      SATURDAY,
      adminA,
    );

    expect(res.statusCode).toBe(200);
    const data = (res.body as { data: { slots: unknown[] } }).data;
    expect(data.slots).toEqual([]);
  });

  it('CLOSED exception returns zero slots', async () => {
    await prisma.availabilityException.create({
      data: {
        resourceId: resourceA.id,
        date: new Date('2027-10-05T00:00:00Z'),
        type: 'CLOSED',
        reason: 'Public holiday',
      },
    });

    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      '2027-10-05',
      adminA,
    );

    expect(res.statusCode).toBe(200);
    const data = (res.body as { data: { slots: unknown[] } }).data;
    expect(data.slots).toEqual([]);

    await prisma.availabilityException.deleteMany({
      where: { resourceId: resourceA.id, date: new Date('2027-10-05T00:00:00Z') },
    });
  });

  it('CUSTOM_HOURS replaces recurring windows', async () => {
    await prisma.availabilityException.create({
      data: {
        resourceId: resourceA.id,
        date: new Date('2027-10-06T00:00:00Z'),
        type: 'CUSTOM_HOURS',
        startTime: '14:00',
        endTime: '16:00',
      },
    });

    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      '2027-10-06',
      adminA,
    );

    expect(res.statusCode).toBe(200);
    const slots = (res.body as { data: { slots: { startAt: string }[] } }).data.slots;
    expect(slots[0]!.startAt).toBe('2027-10-06T14:00:00.000Z');
    expect(slots[slots.length - 1]!.startAt).toBe('2027-10-06T15:30:00.000Z');

    await prisma.availabilityException.deleteMany({
      where: { resourceId: resourceA.id, date: new Date('2027-10-06T00:00:00Z') },
    });
  });

  it('BREAK exception subtracts the interval', async () => {
    await prisma.availabilityException.create({
      data: {
        resourceId: resourceA.id,
        date: new Date('2027-10-07T00:00:00Z'),
        type: 'BREAK',
        startTime: '12:00',
        endTime: '13:00',
      },
    });

    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      '2027-10-07',
      adminA,
    );

    expect(res.statusCode).toBe(200);
    const starts = (res.body as { data: { slots: { startAt: string }[] } }).data.slots.map(
      (s) => s.startAt,
    );
    expect(starts).not.toContain('2027-10-07T11:45:00.000Z');
    expect(starts).not.toContain('2027-10-07T12:00:00.000Z');
    expect(starts).not.toContain('2027-10-07T12:30:00.000Z');
    expect(starts).toContain('2027-10-07T13:00:00.000Z');

    await prisma.availabilityException.deleteMany({
      where: { resourceId: resourceA.id, date: new Date('2027-10-07T00:00:00Z') },
    });
  });

  it('rejects an invalid date format (400)', async () => {
    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      'not-a-date',
      adminA,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown resource (404)', async () => {
    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      '00000000-0000-0000-0000-000000000000',
      serviceA.id,
      MONDAY,
      adminA,
    );
    expect(res.statusCode).toBe(404);
  });

  it('rejects cross-business resource access (404)', async () => {
    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceB.id,
      serviceA.id,
      MONDAY,
      adminA,
    );
    expect(res.statusCode).toBe(404);
  });

  it('allows public access without authentication', async () => {
    const res = await fetchAvailability(
      businessA.id,
      locationA.id,
      resourceA.id,
      serviceA.id,
      MONDAY,
    );
    expect(res.statusCode).toBe(200);
  });
});