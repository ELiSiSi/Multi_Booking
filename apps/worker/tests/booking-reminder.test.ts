import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@reservio/database';

import { runBookingReminder } from '../src/jobs/booking-reminder.job.js';

let adminId: string;
let customerId: string;
let businessId: string;
let locationId: string;
let serviceId: string;

let resourceIndex = 0;

async function createUniqueResource(): Promise<string> {
  resourceIndex += 1;
  const resource = await prisma.resource.create({
    data: {
      locationId,
      name: `Res-${resourceIndex}-${Date.now()}`,
      bufferMinutes: 0,
    },
  });
  return resource.id;
}

async function createConfirmedBooking(opts: {
  startAtOffsetMs: number;
  status?: 'confirmed' | 'cancelled' | 'pending';
}): Promise<string> {
  const resourceId = await createUniqueResource();

  const startAt = new Date(Date.now() + opts.startAtOffsetMs);
  const endAt = new Date(startAt.getTime() + 30 * 60_000);

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
      status: opts.status ?? 'confirmed',
    },
  });

  return booking.id;
}

beforeAll(async () => {
  const stamp = Date.now();

  const customer = await prisma.user.create({
    data: {
      email: `rem-cust-${stamp}@test.local`,
      passwordHash: 'x',
      fullName: 'Reminder Customer',
      role: 'customer',
    },
  });
  customerId = customer.id;

  const admin = await prisma.user.create({
    data: {
      email: `rem-admin-${stamp}@test.local`,
      passwordHash: 'x',
      fullName: 'Reminder Admin',
      role: 'admin',
    },
  });
  adminId = admin.id;

  const business = await prisma.business.create({
    data: {
      ownerId: adminId,
      name: `Reminder Biz ${stamp}`,
      timezone: 'UTC',
      reminderLeadTimeMinutes: 30,
    },
  });
  businessId = business.id;

  const location = await prisma.location.create({
    data: { businessId, name: 'Main' },
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

describe('runBookingReminder', () => {
  it('returns { scanned: 0, reminded: 0 } when there are no upcoming confirmed bookings', async () => {
    const result = await runBookingReminder();
    expect(result.scanned).toBe(0);
    expect(result.reminded).toBe(0);
  });

  it('creates a reminder for a booking inside the reminder lead time', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: 15 * 60_000,
    });

    const result = await runBookingReminder();

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.reminded).toBeGreaterThanOrEqual(1);

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(1);

    const metadata = events[0]!.metadata as {
      startAt?: string;
      leadTimeMinutes?: number;
      notifiedCustomerId?: string;
    };
    expect(metadata.leadTimeMinutes).toBe(30);
    expect(typeof metadata.startAt).toBe('string');
    expect(metadata.notifiedCustomerId).toBe(customerId);
  });

  it('does not remind for a booking far in the future', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: 5 * 60 * 60_000,
    });

    await runBookingReminder();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(0);
  });

  it('does not remind for a cancelled booking', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: 10 * 60_000,
      status: 'cancelled',
    });

    await runBookingReminder();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(0);
  });

  it('is idempotent — running twice does not duplicate reminders', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: 20 * 60_000,
    });

    await runBookingReminder();
    await runBookingReminder();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(1);
  });

  it('does not remind for a booking in the past', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: -15 * 60_000,
    });

    await runBookingReminder();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(0);
  });

  it('does not remind for a pending booking within the reminder window', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: 15 * 60_000,
      status: 'pending',
    });

    await runBookingReminder();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(0);
  });

  it('does not remind for a booking starting just outside the lead time (e.g. 35 minutes)', async () => {
    const bookingId = await createConfirmedBooking({
      startAtOffsetMs: 35 * 60_000,
    });

    await runBookingReminder();

    const events = await prisma.auditEvent.findMany({
      where: { bookingId, action: 'booking.reminder_sent' },
    });
    expect(events.length).toBe(0);
  });

  it('reminds multiple distinct confirmed bookings inside the window', async () => {
    const booking1 = await createConfirmedBooking({
      startAtOffsetMs: 10 * 60_000,
    });
    const booking2 = await createConfirmedBooking({
      startAtOffsetMs: 25 * 60_000,
    });

    const result = await runBookingReminder();

    expect(result.reminded).toBeGreaterThanOrEqual(2);

    const event1 = await prisma.auditEvent.findMany({
      where: { bookingId: booking1, action: 'booking.reminder_sent' },
    });
    const event2 = await prisma.auditEvent.findMany({
      where: { bookingId: booking2, action: 'booking.reminder_sent' },
    });

    expect(event1.length).toBe(1);
    expect(event2.length).toBe(1);
  });

  it('filters correctly when confirmed, pending, and cancelled bookings exist in the same window', async () => {
    const confirmedId = await createConfirmedBooking({
      startAtOffsetMs: 20 * 60_000,
      status: 'confirmed',
    });
    const pendingId = await createConfirmedBooking({
      startAtOffsetMs: 20 * 60_000,
      status: 'pending',
    });
    const cancelledId = await createConfirmedBooking({
      startAtOffsetMs: 20 * 60_000,
      status: 'cancelled',
    });

    await runBookingReminder();

    const confirmedEvents = await prisma.auditEvent.findMany({
      where: { bookingId: confirmedId, action: 'booking.reminder_sent' },
    });
    const pendingEvents = await prisma.auditEvent.findMany({
      where: { bookingId: pendingId, action: 'booking.reminder_sent' },
    });
    const cancelledEvents = await prisma.auditEvent.findMany({
      where: { bookingId: cancelledId, action: 'booking.reminder_sent' },
    });

    expect(confirmedEvents.length).toBe(1);
    expect(pendingEvents.length).toBe(0);
    expect(cancelledEvents.length).toBe(0);
  });
});