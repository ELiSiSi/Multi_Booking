import { prisma } from '@reservio/database';

const REMINDER_WINDOW_MINUTES = 30;

export interface BookingReminderResult {
  scanned: number;
  reminded: number;
}

export async function runBookingReminder(
  _job?: unknown,
): Promise<BookingReminderResult> {
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + REMINDER_WINDOW_MINUTES * 60_000,
  );

  const candidates = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      startAt: { gte: now, lte: windowEnd },
    },
    orderBy: [{ startAt: 'asc' }],
    take: 200,
  });

  let reminded = 0;

  for (const booking of candidates) {
    const existing = await prisma.auditEvent.findFirst({
      where: {
        bookingId: booking.id,
        action: 'booking.reminder_sent',
      },
    });

    if (existing) {
      continue;
    }

    await prisma.auditEvent.create({
      data: {
        bookingId: booking.id,
        actorId: booking.customerId,
        action: 'booking.reminder_sent',
        metadata: {
          startAt: booking.startAt.toISOString(),
          windowMinutes: REMINDER_WINDOW_MINUTES,
        },
      },
    });

    reminded += 1;
  }

  return { scanned: candidates.length, reminded };
}

export const bookingReminderJob = runBookingReminder;