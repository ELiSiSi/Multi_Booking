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
let otherCustomer: TestUser;
let businessId: string;
let locationId: string;
let serviceId: string;
let resourceId: string;

function authHeader(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.accessToken}` };
}

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

async function createBooking(
  user: TestUser,
  startAt: string,
  idempotencyKey?: string,
): Promise<{ statusCode: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: {
      ...authHeader(user),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    payload: {
      businessId,
      locationId,
      resourceId,
      serviceId,
      startAt,
    },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  admin = await registerAndLogin(`bk-admin-${stamp}@test.local`, 'admin');
  customer = await registerAndLogin(`bk-cust-${stamp}@test.local`, 'customer');
  otherCustomer = await registerAndLogin(
    `bk-other-${stamp}@test.local`,
    'customer',
  );

  const bizRes = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(admin),
    payload: { name: `BK Biz ${stamp}`, timezone: 'UTC' },
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

  for (const weekday of [ 1, 2, 3, 4, 5, 6 ,7]) {
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
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({
    where: { booking: { businessId } },
  });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.idempotencyKey.deleteMany({
    where: { actorId: { in: [admin.id, customer.id, otherCustomer.id] } },
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

  const ids = [admin.id, customer.id, otherCustomer.id];
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  await app.close();
  await prisma.$disconnect();
});

describe('Booking — POST /bookings', () => {
  it('creates a booking (201)', async () => {
    const res = await createBooking(customer, '2028-06-05T10:00:00.000Z');
    expect(res.statusCode).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.customerId).toBe(customer.id);
    expect(res.body.data.durationMinutes).toBe(30);
    expect(res.body.data.bufferMinutes).toBe(0);
    expect(res.body.data.priceCents).toBe(5000);
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bookings',
      payload: {
        businessId,
        locationId,
        resourceId,
        serviceId,
        startAt: '2028-06-05T11:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects start in the past (400)', async () => {
    const res = await createBooking(customer, '2020-01-01T10:00:00.000Z');
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid startAt format (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: authHeader(customer),
      payload: {
        businessId,
        locationId,
        resourceId,
        serviceId,
        startAt: 'not-a-date',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing required fields (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: authHeader(customer),
      payload: { businessId },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown resource (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: authHeader(customer),
      payload: {
        businessId,
        locationId,
        resourceId: '00000000-0000-0000-0000-000000000000',
        serviceId,
        startAt: '2028-06-05T12:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a startAt not aligned to slot granularity (409)', async () => {
    const res = await createBooking(customer, '2028-06-06T10:07:00.000Z');
    expect(res.statusCode).toBe(409);
  });

  it('rejects overlapping booking on same resource (409)', async () => {
    await createBooking(customer, '2028-07-05T10:00:00.000Z');

    const res = await createBooking(
      otherCustomer,
      '2028-07-05T10:15:00.000Z',
    );
    expect(res.statusCode).toBe(409);
  });

  it('allows adjacent bookings (buffer=0)', async () => {
    await createBooking(customer, '2028-08-05T10:00:00.000Z');

    const res = await createBooking(
      otherCustomer,
      '2028-08-05T10:30:00.000Z',
    );
    expect(res.statusCode).toBe(201);
  });

  it('allows a booking on a different resource at the same time', async () => {
    const otherRes = await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/locations/${locationId}/resources`,
      headers: authHeader(admin),
      payload: { name: `OtherRes-${Date.now()}`, bufferMinutes: 0 },
    });
    const otherResourceId = (otherRes.json() as { data: { id: string } }).data.id;

    await app.inject({
      method: 'POST',
      url: `/businesses/${businessId}/locations/${locationId}/services/${serviceId}/resources/${otherResourceId}`,
      headers: authHeader(admin),
    });

    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      await prisma.availabilityRule.create({
        data: {
          resourceId: otherResourceId,
          weekday,
          type: 'OPEN',
          startTime: '00:00',
          endTime: '23:59',
        },
      });
    }

    const first = await createBooking(customer, '2028-08-06T10:00:00.000Z');
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: authHeader(otherCustomer),
      payload: {
        businessId,
        locationId,
        resourceId: otherResourceId,
        serviceId,
        startAt: '2028-08-06T10:00:00.000Z',
      },
    });
    expect(second.statusCode).toBe(201);

    await prisma.availabilityRule.deleteMany({
      where: { resourceId: otherResourceId },
    });
    await prisma.serviceResource.deleteMany({
      where: { resourceId: otherResourceId },
    });
    await prisma.resource.delete({ where: { id: otherResourceId } });
  });

  it('returns the existing booking for the same Idempotency-Key', async () => {
    const key = `idem-${Date.now()}`;
    const first = await createBooking(
      customer,
      '2028-09-05T10:00:00.000Z',
      key,
    );
    expect(first.statusCode).toBe(201);

    const second = await createBooking(
      customer,
      '2028-09-05T10:00:00.000Z',
      key,
    );
    expect(second.statusCode).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const count = await prisma.booking.count({
      where: { customerId: customer.id, startAt: new Date('2028-09-05T10:00:00Z') },
    });
    expect(count).toBe(1);
  });

  it('rejects Idempotency-Key reused with different payload (409)', async () => {
    const key = `idem-conflict-${Date.now()}`;
    await createBooking(customer, '2028-10-05T10:00:00.000Z', key);

    const second = await createBooking(
      customer,
      '2028-10-05T14:00:00.000Z',
      key,
    );
    expect(second.statusCode).toBe(409);
  });
});

describe('Booking — GET /bookings/mine', () => {
  it('returns the customer bookings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bookings/mine?limit=10',
      headers: authHeader(customer),
    });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: { customerId: string }[] }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((b) => b.customerId === customer.id)).toBe(true);
  });

  it('rejects bad limit (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bookings/mine?limit=0',
      headers: authHeader(customer),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bookings/mine',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Booking — GET /bookings/:id', () => {
  it('customer retrieves their own booking', async () => {
    const created = await createBooking(customer, '2028-11-05T10:00:00.000Z');
    const id = created.body.data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/bookings/${id}`,
      headers: authHeader(customer),
    });
    expect(res.statusCode).toBe(200);
  });

  it('admin (owner) retrieves a booking in their business', async () => {
    const created = await createBooking(customer, '2028-11-06T10:00:00.000Z');
    const id = created.body.data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/bookings/${id}`,
      headers: authHeader(admin),
    });
    expect(res.statusCode).toBe(200);
  });

  it('other customer cannot view (404)', async () => {
    const created = await createBooking(customer, '2028-12-05T10:00:00.000Z');
    const id = created.body.data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/bookings/${id}`,
      headers: authHeader(otherCustomer),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects unknown booking id (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bookings/00000000-0000-0000-0000-000000000000',
      headers: authHeader(customer),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects bad uuid (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bookings/not-a-uuid',
      headers: authHeader(customer),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Booking — GET /businesses/:businessId/bookings', () => {
  it('admin lists business bookings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/bookings?limit=10`,
      headers: authHeader(admin),
    });
    expect(res.statusCode).toBe(200);
  });

  it('customer cannot list (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/bookings`,
      headers: authHeader(customer),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/businesses/${businessId}/bookings`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Booking — Transitions (Confirm / Cancel / Complete / No-Show)', () => {
  let pendingBookingId: string;
  let confirmedBookingId: string;

  beforeAll(async () => {
    const res1 = await createBooking(customer, '2029-01-01T10:00:00.000Z');
    pendingBookingId = res1.body.data.id;

    const res2 = await createBooking(customer, '2029-01-02T10:00:00.000Z');
    confirmedBookingId = res2.body.data.id;
    await app.inject({
      method: 'POST',
      url: `/bookings/${confirmedBookingId}/confirm`,
      headers: authHeader(admin),
    });
  });

  describe('POST /bookings/:id/confirm', () => {
    it('customer cannot confirm (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${pendingBookingId}/confirm`,
        headers: authHeader(customer),
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin confirms a pending booking', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${pendingBookingId}/confirm`,
        headers: authHeader(admin),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('confirmed');
    });

    it('rejects invalid transition (confirmed -> confirmed)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${confirmedBookingId}/confirm`,
        headers: authHeader(admin),
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    let toCancelId: string;

    beforeAll(async () => {
      const res = await createBooking(customer, '2029-02-01T10:00:00.000Z');
      toCancelId = res.body.data.id;
    });

    it('customer can cancel their own booking', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${toCancelId}/cancel`,
        headers: authHeader(customer),
        payload: { reason: 'Changed my mind' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('cancelled');
      expect(res.json().data.cancellationReason).toBe('Changed my mind');
    });

    it('rejects cancelling an already-cancelled booking (409)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${toCancelId}/cancel`,
        headers: authHeader(customer),
        payload: {},
      });
      expect(res.statusCode).toBe(409);
    });

    it('other customer cannot cancel (404)', async () => {
      const bRes = await createBooking(customer, '2029-02-02T10:00:00.000Z');
      const id = bRes.body.data.id;
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${id}/cancel`,
        headers: authHeader(otherCustomer),
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('admin can cancel a booking', async () => {
      const bRes = await createBooking(customer, '2029-02-03T10:00:00.000Z');
      const id = bRes.body.data.id;
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${id}/cancel`,
        headers: authHeader(admin),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('cancelled');
    });
    it('admin can cancel outside the cancellation window', async () => {
      // Create a business with a narrow cancellation window.
      const bizRes2 = await app.inject({
        method: 'POST',
        url: '/businesses',
        headers: authHeader(admin),
        payload: {
          name: `NarrowWinBiz-${Date.now()}`,
          timezone: 'UTC',
          cancellationWindowMinutes: 60,
        },
      });
      const narrowBizId = (bizRes2.json() as { data: { id: string } }).data.id;

      const locRes2 = await app.inject({
        method: 'POST',
        url: `/businesses/${narrowBizId}/locations`,
        headers: authHeader(admin),
        payload: { name: 'Main2' },
      });
      const locId2 = (locRes2.json() as { data: { id: string } }).data.id;

      const svcRes2 = await app.inject({
        method: 'POST',
        url: `/businesses/${narrowBizId}/locations/${locId2}/services`,
        headers: authHeader(admin),
        payload: { name: 'Svc2', durationMinutes: 30, priceCents: 5000 },
      });
      const svcId2 = (svcRes2.json() as { data: { id: string } }).data.id;

      const resRes2 = await app.inject({
        method: 'POST',
        url: `/businesses/${narrowBizId}/locations/${locId2}/resources`,
        headers: authHeader(admin),
        payload: { name: 'Res2', bufferMinutes: 0 },
      });
      const resId2 = (resRes2.json() as { data: { id: string } }).data.id;

      await app.inject({
        method: 'POST',
        url: `/businesses/${narrowBizId}/locations/${locId2}/services/${svcId2}/resources/${resId2}`,
        headers: authHeader(admin),
      });

      for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
        await prisma.availabilityRule.create({
          data: {
            resourceId: resId2,
            weekday,
            type: 'OPEN',
            startTime: '00:00',
            endTime: '23:59',
          },
        });
      }

      // Create a confirmed booking whose startAt is 30 min from now
      // (inside the 60-min cancellation window).
      const booking = await prisma.booking.create({
        data: {
          businessId: narrowBizId,
          locationId: locId2,
          resourceId: resId2,
          serviceId: svcId2,
          customerId: customer.id,
          startAt: new Date(Date.now() + 30 * 60_000),
          endAt: new Date(Date.now() + 60 * 60_000),
          durationMinutes: 30,
          bufferMinutes: 0,
          priceCents: 5000,
          currency: 'USD',
          status: 'confirmed',
        },
      });

      // Customer is blocked (inside cancellation window).
      const custRes = await app.inject({
        method: 'POST',
        url: `/bookings/${booking.id}/cancel`,
        headers: authHeader(customer),
        payload: {},
      });
      expect(custRes.statusCode).toBe(409);

      // Admin can cancel anytime.
      const adminRes = await app.inject({
        method: 'POST',
        url: `/bookings/${booking.id}/cancel`,
        headers: authHeader(admin),
        payload: { reason: 'Emergency' },
      });
      expect(adminRes.statusCode).toBe(200);
      expect(adminRes.json().data.status).toBe('cancelled');

      // Cleanup
      await prisma.auditEvent.deleteMany({
        where: { booking: { businessId: narrowBizId } },
      });
      await prisma.booking.deleteMany({ where: { businessId: narrowBizId } });
      await prisma.availabilityRule.deleteMany({
        where: { resourceId: resId2 },
      });
      await prisma.serviceResource.deleteMany({
        where: { service: { location: { businessId: narrowBizId } } },
      });
      await prisma.service.deleteMany({
        where: { location: { businessId: narrowBizId } },
      });
      await prisma.resource.deleteMany({
        where: { location: { businessId: narrowBizId } },
      });
      await prisma.location.deleteMany({
        where: { businessId: narrowBizId },
      });
      await prisma.business.delete({ where: { id: narrowBizId } });
    });
  });

  describe('POST /bookings/:id/complete', () => {
    it('customer cannot complete (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${confirmedBookingId}/complete`,
        headers: authHeader(customer),
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin completes a confirmed booking', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${confirmedBookingId}/complete`,
        headers: authHeader(admin),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('completed');
    });

    it('rejects invalid transition (completed -> cancelled)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${confirmedBookingId}/cancel`,
        headers: authHeader(admin),
        payload: {},
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /bookings/:id/no-show', () => {
    let pastBookingId: string;
    let futureBookingId: string;

    beforeAll(async () => {
      const res1 = await createBooking(customer, '2029-03-01T10:00:00.000Z');
      futureBookingId = res1.body.data.id;
      await app.inject({
        method: 'POST',
        url: `/bookings/${futureBookingId}/confirm`,
        headers: authHeader(admin),
      });

      const pastBooking = await prisma.booking.create({
        data: {
          businessId,
          locationId,
          resourceId,
          serviceId,
          customerId: customer.id,
          startAt: new Date(Date.now() - 3600000),
          endAt: new Date(Date.now() - 1800000),
          durationMinutes: 30,
          bufferMinutes: 0,
          priceCents: 5000,
          currency: 'USD',
          status: 'confirmed',
        },
      });
      pastBookingId = pastBooking.id;
    });

    it('customer cannot mark no-show (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${pastBookingId}/no-show`,
        headers: authHeader(customer),
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects no-show if booking is in the future (409)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${futureBookingId}/no-show`,
        headers: authHeader(admin),
      });
      expect(res.statusCode).toBe(409);
    });

    it('admin marks a past booking as no-show', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bookings/${pastBookingId}/no-show`,
        headers: authHeader(admin),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('no_show');
    });
  });
});