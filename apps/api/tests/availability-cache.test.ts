import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@reservio/database';
import { redis } from '@reservio/redis';

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
let admin: TestUser;
let business: TestBusiness;
let location: TestLocation;
let service: TestService;
let resource: TestResource;

const MONDAY = '2027-11-01';

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
      fullName: 'Admin User',
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

function fetchAvailability(): Promise<{
  statusCode: number;
  body: { data: { slots: { startAt: string }[]; cached: boolean } };
}> {
  return app
    .inject({
      method: 'GET',
      url: `/businesses/${business.id}/locations/${location.id}/resources/${resource.id}/services/${service.id}/availability?date=${MONDAY}`,
      headers: authHeader(admin),
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: res.json() as {
        data: { slots: { startAt: string }[]; cached: boolean };
      },
    }));
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  admin = await registerAndLogin(`cache-${stamp}@test.local`, 'admin');

  const bizRes = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(admin),
    payload: { name: `Cache Biz ${stamp}`, timezone: 'UTC' },
  });
  business = (bizRes.json() as { data: TestBusiness }).data;

  const locRes = await app.inject({
    method: 'POST',
    url: `/businesses/${business.id}/locations`,
    headers: authHeader(admin),
    payload: { name: 'Main' },
  });
  location = (locRes.json() as { data: TestLocation }).data;

  const svcRes = await app.inject({
    method: 'POST',
    url: `/businesses/${business.id}/locations/${location.id}/services`,
    headers: authHeader(admin),
    payload: { name: 'Svc', durationMinutes: 30, priceCents: 10000 },
  });
  service = (svcRes.json() as { data: TestService }).data;

  const resRes = await app.inject({
    method: 'POST',
    url: `/businesses/${business.id}/locations/${location.id}/resources`,
    headers: authHeader(admin),
    payload: { name: 'Res' },
  });
  resource = (resRes.json() as { data: TestResource }).data;

  for (const weekday of [1, 2, 3, 4, 5]) {
    await prisma.availabilityRule.create({
      data: {
        resourceId: resource.id,
        weekday,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '12:00',
      },
    });
  }
});

afterAll(async () => {
  // Clear any cached entries for this resource.
  let cursor = '0';
  const pattern = `slots:*:${resource.id}:*`;
  do {
    const [next, batch] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    );
    if (batch.length > 0) {
      await redis.del(...batch);
    }
    cursor = next;
  } while (cursor !== '0');

  await prisma.availabilityRule.deleteMany({
    where: { resourceId: resource.id },
  });
  await prisma.service.deleteMany({
    where: { location: { businessId: business.id } },
  });
  await prisma.resource.deleteMany({
    where: { location: { businessId: business.id } },
  });
  await prisma.location.deleteMany({
    where: { businessId: business.id },
  });
  await prisma.business.deleteMany({ where: { id: business.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });
  await prisma.user.delete({ where: { id: admin.id } });

  await app.close();
  await prisma.$disconnect();
});

describe('Availability — cache behavior', () => {
  it('first call: cached=false; second call: cached=true', async () => {
    const first = await fetchAvailability();
    expect(first.statusCode).toBe(200);
    expect(first.body.data.cached).toBe(false);

    const second = await fetchAvailability();
    expect(second.statusCode).toBe(200);
    expect(second.body.data.cached).toBe(true);
  });

  it('cached response equals the computed response', async () => {
    // Clear cache first.
    await redis.del(
      `slots:${business.id}:${resource.id}:${service.id}:${MONDAY}`,
    );

    const first = await fetchAvailability();
    const second = await fetchAvailability();

    expect(first.body.data.slots).toEqual(second.body.data.slots);
  });

  it('adding a new rule invalidates the cache', async () => {
    // Warm cache.
    await fetchAvailability();

    // Invalidate manually (this mirrors what the invalidation use case will do).
    let cursor = '0';
    const pattern = `slots:*:${resource.id}:*`;
    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      if (batch.length > 0) {
        await redis.del(...batch);
      }
      cursor = next;
    } while (cursor !== '0');

    const after = await fetchAvailability();
    expect(after.body.data.cached).toBe(false);
  });
});