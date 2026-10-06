import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@reservio/database';

import { buildApp } from '../src/app.js';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

const TEST_PASSWORD = 'TestPassword!123';

let app: FastifyInstance;
let admin: TestUser;
let customer: TestUser;
let businessId: string;
let locationId: string;
let serviceId: string;
let resourceId: string;

async function registerAndLogin(
  email: string,
  role: 'admin' | 'customer',
): Promise<TestUser> {
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: TEST_PASSWORD, fullName: 'User' },
  });
  expect(reg.statusCode).toBe(201);

  const userId = (reg.json() as { user: { id: string } }).user.id;

  if (role === 'admin') {
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });
  }

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: TEST_PASSWORD },
  });
  expect(login.statusCode).toBe(200);

  const accessToken = (login.json() as { accessToken: string }).accessToken;

  return { id: userId, email, accessToken };
}

function authHeader(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.accessToken}` };
}

async function bookWithKey(
  user: TestUser,
  startAt: string,
  idempotencyKey: string,
) {
  return app.inject({
    method: 'POST',
    url: '/bookings',
    headers: {
      ...authHeader(user),
      'idempotency-key': idempotencyKey,
    },
    payload: {
      businessId,
      locationId,
      resourceId,
      serviceId,
      startAt,
    },
  });
}

async function seedAllWeek(resId: string): Promise<void> {
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await prisma.availabilityRule.create({
      data: {
        resourceId: resId,
        weekday,
        type: 'OPEN',
        startTime: '00:00',
        endTime: '23:59',
      },
    });
  }
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  admin = await registerAndLogin(`idem-admin-${stamp}@test.local`, 'admin');
  customer = await registerAndLogin(`idem-cust-${stamp}@test.local`, 'customer');

  const bizRes = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(admin),
    payload: { name: `Idem Biz ${stamp}`, timezone: 'UTC' },
  });
  businessId = (bizRes.json() as { data: { id: string } }).data.id;

  const locRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations`,
    headers: authHeader(admin),
    payload: { name: 'Main' },
  });
  locationId = (locRes.json() as { data: { id: string } }).data.id;

  const svcRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services`,
    headers: authHeader(admin),
    payload: { name: 'Svc', durationMinutes: 30, priceCents: 5000 },
  });
  serviceId = (svcRes.json() as { data: { id: string } }).data.id;

  const resRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/resources`,
    headers: authHeader(admin),
    payload: { name: 'Res', bufferMinutes: 0 },
  });
  resourceId = (resRes.json() as { data: { id: string } }).data.id;

  await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services/${serviceId}/resources/${resourceId}`,
    headers: authHeader(admin),
  });

  await seedAllWeek(resourceId);
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({
    where: { booking: { businessId } },
  });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.idempotencyKey.deleteMany({
    where: { actorId: { in: [admin.id, customer.id] } },
  });
  await prisma.availabilityRule.deleteMany({
    where: { resourceId },
  });
  await prisma.serviceResource.deleteMany({
    where: { service: { location: { businessId } } },
  });
  await prisma.service.deleteMany({
    where: { location: { businessId } },
  });
  await prisma.resource.deleteMany({
    where: { location: { businessId } },
  });
  await prisma.location.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });

  const ids = [admin.id, customer.id];
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  await app.close();
  await prisma.$disconnect();
});

describe('Booking idempotency — 20 parallel requests with the same key', () => {
  it('creates exactly 1 booking and all responses share the same booking id', async () => {
    const START = '2030-01-05T10:00:00.000Z';
    const KEY = `idem-concurrency-${Date.now()}`;

    const requests = Array.from({ length: 20 }, () =>
      bookWithKey(customer, START, KEY),
    );

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    expect(successCount).toBe(20);

    const bookingIds = new Set(
      results.map(
        (r) =>
          (r.json() as { data: { id: string } }).data?.id,
      ),
    );
    expect(bookingIds.size).toBe(1);

    const dbCount = await prisma.booking.count({
      where: { resourceId, startAt: new Date(START) },
    });
    expect(dbCount).toBe(1);

    const idemCount = await prisma.idempotencyKey.count({
      where: { actorId: customer.id, key: KEY },
    });
    expect(idemCount).toBe(1);
  });

  it('different keys on the same slot: 1 success, 19 conflicts', async () => {
    const START = '2030-02-05T10:00:00.000Z';

    const requests = Array.from({ length: 20 }, (_, i) =>
      bookWithKey(customer, START, `idem-distinct-${Date.now()}-${i}`),
    );

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(19);
  });

  it('same key with different body: 1 success, 19 conflicts (409)', async () => {
    const KEY = `idem-conflict-${Date.now()}`;

    const requests = Array.from({ length: 20 }, (_, i) => {
      const minute = i % 2 === 0 ? 0 : 15;
      const startAt = `2030-03-05T10:${minute.toString().padStart(2, '0')}:00.000Z`;
      return bookWithKey(customer, startAt, KEY);
    });

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount + conflictCount).toBe(20);
    expect(conflictCount).toBeGreaterThan(0);
  });

  it('idempotency records do not leak between users', async () => {
    const KEY = `idem-shared-${Date.now()}`;
    const START_CUST = '2030-04-05T10:00:00.000Z';
    const START_ADMIN = '2030-04-05T14:00:00.000Z';

    const custRes = await bookWithKey(customer, START_CUST, KEY);
    expect(custRes.statusCode).toBe(201);

    const adminRes = await bookWithKey(admin, START_ADMIN, KEY);
    expect(adminRes.statusCode).toBe(201);

    const custId = (custRes.json() as { data: { id: string } }).data.id;
    const adminId = (adminRes.json() as { data: { id: string } }).data.id;
    expect(custId).not.toBe(adminId);

    const totalCount = await prisma.idempotencyKey.count({
      where: { key: KEY },
    });
    expect(totalCount).toBe(2);
  });
});