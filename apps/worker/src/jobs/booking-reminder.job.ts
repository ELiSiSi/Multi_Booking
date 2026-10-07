import { Prisma, prisma } from '@reservio/database';
import { SYSTEM_ACTOR_ID } from '@reservio/booking-core';

export interface BookingReminderResult {
  scanned: number;
  reminded: number;
}

function isReminderUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('bookingId') && target.includes('action');
  }
  if (typeof target === 'string') {
    return target === 'AuditEvent_booking_reminder_unique';
  }
  return false;
}

export async function runBookingReminder(
  _job?: unknown,
): Promise<BookingReminderResult> {
  const now = new Date();

  const maxLeadTimeAgg = await prisma.business.aggregate({
    _max: { reminderLeadTimeMinutes: true },
    where: { status: 'ACTIVE' },
  });

  const maxLeadTimeMinutes =
    maxLeadTimeAgg._max.reminderLeadTimeMinutes ?? 30;

  const fetchWindowEnd = new Date(
    now.getTime() + maxLeadTimeMinutes * 60_000,
  );

  const candidates = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      startAt: { gte: now, lte: fetchWindowEnd },
      business: {
        status: 'ACTIVE',
      },
    },
    orderBy: [{ startAt: 'asc' }],
    take: 200,
    include: {
      business: {
        select: { reminderLeadTimeMinutes: true },
      },
    },
  });

  let reminded = 0;

  for (const booking of candidates) {
    const leadTimeMs = booking.business.reminderLeadTimeMinutes * 60_000;
    const reminderAt = new Date(booking.startAt.getTime() - leadTimeMs);

    if (now.getTime() < reminderAt.getTime()) {
      continue;
    }

    const existing = await prisma.auditEvent.findFirst({
      where: {
        bookingId: booking.id,
        action: 'booking.reminder_sent',
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    try {
      await prisma.auditEvent.create({
        data: {
          bookingId: booking.id,
          actorId: SYSTEM_ACTOR_ID,
          action: 'booking.reminder_sent',
          metadata: {
            startAt: booking.startAt.toISOString(),
            leadTimeMinutes: booking.business.reminderLeadTimeMinutes,
            notifiedCustomerId: booking.customerId,
          },
        },
      });

      reminded += 1;
    } catch (error) {
      if (isReminderUniqueViolation(error)) {
        continue;
      }
      throw error;
    }
  }

  return { scanned: candidates.length, reminded };
}

export const bookingReminderJob = runBookingReminder;