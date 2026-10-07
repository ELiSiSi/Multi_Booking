import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@reservio/database';

import { runPendingBookingExpiration } from '../src/jobs/pending-booking-expiration.job.js';

let adminId: string;
let businessId: string;
let locationId: string;
let serviceId: string;
let resourceId: string;
let customerId: string;

let bookingIndex = 0;

async function createPendingBooking(opts: {
  createdAtOffsetMs: number;
}): Promise<string> {
  // Each booking uses a unique time slot to avoid EXCLUDE conflicts.
  const slotOffsetMs = bookingIndex * 60 * 60_000; // 1 hour apart
  bookingIndex += 1;

  const startAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000 + slotOffsetMs,
  );
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  const createdAt = new Date(Date.now() + opts.createdAtOffsetMs);

  // Mirror the production behavior: pendingExpiresAt is snapshotted
  // from createdAt + business.pendingTimeoutMinutes at booking time.
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { pendingTimeoutMinutes: true },
  });
  const pendingExpiresAt = new Date(
    createdAt.getTime() + business.pendingTimeoutMinutes * 60_000,
  );

  const booking = await prisma.booking.create({
    data: {
      businessId,
      locationId,
      resourceId,
      serviceId,
      customerId,
      startAt,
      endAt,
      durationMinutes: 30,
      bufferMinutes: 0,
      priceCents: 5000,
      currency: 'USD',
      status: 'pending',
      createdAt,
      pendingExpiresAt,
    },
  });

  return booking.id;
}

beforeAll(async () => {
  const stamp = Date.now();

  const customer = await prisma.user.create({
    data: {
      email: `worker-cust-${stamp}@test.local`,
      passwordHash: 'x',
      fullName: 'Worker Customer',
      role: 'customer',
    },
  });
  customerId = customer.id;

  const admin = await prisma.user.create({
    data: {
      email: `worker-admin-${stamp}@test.local`,
      passwordHash: 'x',
      fullName: 'Worker Admin',
      role: 'admin',
    },
  });
  adminId = admin.id;

  const business = await prisma.business.create({
    data: {
      ownerId: adminId,
      name: `Worker Biz ${stamp}`,
      timezone: 'UTC',
      pendingTimeoutMinutes: 1,
    },
  });
  businessId = business.id;

  const location = await prisma.location.create({
    data: {
      businessId,
      name: 'Main',
    },
  });
  locationId = location.id;

  const service = await prisma.service.create({
    data: {
      locationId,
      name: 'Svc',
      durationMinutes: 30,
      priceCents: 5000,
      currency: 'USD',
    },
  });
  serviceId = service.id;

  const resource = await prisma.resource.create({
    data: {
      locationId,
      name: 'Res',
      bufferMinutes: 0,
    },
  });
  resourceId = resource.id;
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({
    where: { booking: { businessId } },
  });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.service.deleteMany({ where: { locationId } });
  await prisma.resource.deleteMany({ where: { locationId } });
  await prisma.location.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.user.deleteMany({
    where: { id: { in: [adminId, customerId] } },
  });

  await prisma.$disconnect();
});

describe('runPendingBookingExpiration', () => {
  it('returns { scanned: 0, cancelled: 0 } when there are no pending bookings', async () => {
    const result = await runPendingBookingExpiration();
    expect(result.scanned).toBe(0);
    expect(result.cancelled).toBe(0);
  });

  it('cancels a pending booking that has exceeded its timeout', async () => {
    const bookingId = await createPendingBooking({
      createdAtOffsetMs: -5 * 60_000,
    });

    const result = await runPendingBookingExpiration();

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.cancelled).toBeGreaterThanOrEqual(1);

    const after = await prisma.booking.findUnique({
      where: { id: bookingId },
    });
    expect(after?.status).toBe('cancelled');
    expect(after?.cancellationReason).toBe('EXPIRATION_TIMEOUT');
  });

  it('does not cancel a pending booking within its timeout window', async () => {
    const bookingId = await createPendingBooking({
      createdAtOffsetMs: 0,
    });

    await runPendingBookingExpiration();

    const after = await prisma.booking.findUnique({
      where: { id: bookingId },
    });
    expect(after?.status).toBe('pending');
  });

  it('writes an audit event when a booking is cancelled', async () => {
    const bookingId = await createPendingBooking({
      createdAtOffsetMs: -10 * 60_000,
    });

    await runPendingBookingExpiration();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId },
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[0]!;
    expect(event.action).toBe('booking.cancelled');

    const metadata = event.metadata as {
      from?: string;
      to?: string;
      reason?: string;
    };
    expect(metadata.from).toBe('pending');
    expect(metadata.to).toBe('cancelled');
    expect(metadata.reason).toBe('EXPIRATION_TIMEOUT');
  });

  it('is idempotent — running twice does not change already-cancelled bookings', async () => {
    const bookingId = await createPendingBooking({
      createdAtOffsetMs: -5 * 60_000,
    });

    await runPendingBookingExpiration();
    await runPendingBookingExpiration();

    const auditEvents = await prisma.auditEvent.findMany({
      where: { bookingId },
    });
    expect(auditEvents.length).toBe(1);
  });

  it('uses the snapshotted pendingExpiresAt, not the current business timeout', async () => {
    // Snapshot semantics: a booking created under a 1-minute timeout
    // must NOT be affected when the business later changes its
    // pendingTimeoutMinutes to something much larger.
    const bookingId = await createPendingBooking({
      createdAtOffsetMs: -5 * 60_000, // expiresAt = createdAt + 1 min = 4 min ago
    });

    // Change the business timeout to 60 minutes (would extend to 55 min
    // in the future if the worker recomputed live). It must NOT.
    await prisma.business.update({
      where: { id: businessId },
      data: { pendingTimeoutMinutes: 60 },
    });

    try {
      const result = await runPendingBookingExpiration();
      expect(result.cancelled).toBeGreaterThanOrEqual(1);

      const after = await prisma.booking.findUnique({
        where: { id: bookingId },
      });
      expect(after?.status).toBe('cancelled');
      expect(after?.cancellationReason).toBe('EXPIRATION_TIMEOUT');
    } finally {
      // Restore the original timeout for subsequent tests.
      await prisma.business.update({
        where: { id: businessId },
        data: { pendingTimeoutMinutes: 1 },
      });
    }
  });
});