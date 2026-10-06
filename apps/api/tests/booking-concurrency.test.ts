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
let customerA: TestUser;
let customerB: TestUser;
let businessId: string;
let locationId: string;
let serviceId: string;
let resourceAId: string;
let resourceBId: string;

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

async function bookAt(
  user: TestUser,
  resourceId: string,
  startAt: string,
) {
  return app.inject({
    method: 'POST',
    url: '/bookings',
    headers: authHeader(user),
    payload: {
      businessId,
      locationId,
      resourceId,
      serviceId,
      startAt,
    },
  });
}

async function seedAllWeek(resourceId: string): Promise<void> {
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await prisma.availabilityRule.create({
      data: {
        resourceId,
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

  admin = await registerAndLogin(`cc-admin-${stamp}@test.local`, 'admin');
  customerA = await registerAndLogin(`cc-a-${stamp}@test.local`, 'customer');
  customerB = await registerAndLogin(`cc-b-${stamp}@test.local`, 'customer');

  const bizRes = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(admin),
    payload: { name: `CC Biz ${stamp}`, timezone: 'UTC' },
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

  const resARes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/resources`,
    headers: authHeader(admin),
    payload: { name: 'Res A', bufferMinutes: 0 },
  });
  resourceAId = (resARes.json() as { data: { id: string } }).data.id;

  const resBRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/resources`,
    headers: authHeader(admin),
    payload: { name: 'Res B', bufferMinutes: 0 },
  });
  resourceBId = (resBRes.json() as { data: { id: string } }).data.id;

  await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services/${serviceId}/resources/${resourceAId}`,
    headers: authHeader(admin),
  });
  await app.inject({
    method: 'POST',
    url: `/businesses/${businessId}/locations/${locationId}/services/${serviceId}/resources/${resourceBId}`,
    headers: authHeader(admin),
  });

  await seedAllWeek(resourceAId);
  await seedAllWeek(resourceBId);
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.idempotencyKey.deleteMany({
    where: { actorId: { in: [admin.id, customerA.id, customerB.id] } },
  });
  await prisma.availabilityRule.deleteMany({
    where: { resourceId: { in: [resourceAId, resourceBId] } },
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

  const ids = [admin.id, customerA.id, customerB.id];
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  await app.close();
  await prisma.$disconnect();
});

describe('Booking concurrency — 20 parallel requests', () => {
  it('same resource + same time slot: exactly 1 success, 19 conflicts', async () => {
    const START = '2029-06-05T10:00:00.000Z';

    const requests = Array.from({ length: 20 }, (_, i) =>
      bookAt(i % 2 === 0 ? customerA : customerB, resourceAId, START),
    );

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(19);

    const dbCount = await prisma.booking.count({
      where: { resourceId: resourceAId, startAt: new Date(START) },
    });
    expect(dbCount).toBe(1);
  });

  it('same resource + 20 non-overlapping time slots: all 20 succeed', async () => {
    const base = new Date('2029-07-05T08:00:00Z').getTime();
    const STEP_MS = 30 * 60_000;

    const requests = Array.from({ length: 20 }, (_, i) => {
      const startAt = new Date(base + i * STEP_MS).toISOString();
      return bookAt(customerA, resourceAId, startAt);
    });

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBe(20);
    expect(conflictCount).toBe(0);
  });

  it('2 different resources + same time slot: exactly 2 successes, 18 conflicts', async () => {
    const START = '2029-08-05T10:00:00.000Z';

    const requests = Array.from({ length: 20 }, (_, i) => {
      const rid = i % 2 === 0 ? resourceAId : resourceBId;
      return bookAt(customerA, rid, START);
    });

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBe(2);
    expect(conflictCount).toBe(18);

    const countA = await prisma.booking.count({
      where: { resourceId: resourceAId, startAt: new Date(START) },
    });
    const countB = await prisma.booking.count({
      where: { resourceId: resourceBId, startAt: new Date(START) },
    });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('same resource + partially overlapping slots: only the first in DB wins', async () => {
    const START = '2029-09-05T10:00:00.000Z';

    const overlappingStarts = [
      '2029-09-05T10:00:00.000Z',
      '2029-09-05T10:05:00.000Z',
      '2029-09-05T10:10:00.000Z',
      '2029-09-05T10:15:00.000Z',
    ];

    const requests = Array.from({ length: 20 }, (_, i) => {
      const startAt = overlappingStarts[i % overlappingStarts.length]!;
      return bookAt(customerA, resourceAId, startAt);
    });

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.statusCode);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(19);

    const dbCount = await prisma.booking.count({
      where: {
        resourceId: resourceAId,
        startAt: { gte: new Date('2029-09-05T10:00:00Z') },
        endAt: { lte: new Date('2029-09-05T11:15:00Z') },
      },
    });
    expect(dbCount).toBe(1);
  });
});