import {
  SYSTEM_ACTOR_ID,
  TransitionBookingUseCase,
} from '@reservio/booking-core';
import { PrismaUnitOfWork, prisma } from '@reservio/database';
import { redis } from '@reservio/redis';

const uow = new PrismaUnitOfWork(prisma);
const transitionBooking = new TransitionBookingUseCase(uow);

export interface PendingExpirationResult {
  scanned: number;
  cancelled: number;
}

async function invalidateAvailabilityForResource(
  resourceId: string,
): Promise<void> {
  let cursor = '0';
  const pattern = `slots:*:${resourceId}:*`;

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
}

export async function runPendingBookingExpiration(
  _job?: unknown,
): Promise<PendingExpirationResult> {
  const now = new Date();

  // The pending expiration window is snapshotted on each booking at
  // creation time (Booking.pendingExpiresAt), as required by the design
  // (Section 6 §7). Changing Business.pendingTimeoutMinutes later must
  // NOT retroactively affect bookings that were already created.
  const candidates = await prisma.booking.findMany({
    where: {
      status: 'pending',
      pendingExpiresAt: { lte: now, not: null },
    },
    orderBy: [{ pendingExpiresAt: 'asc' }],
    take: 500,
  });

  let cancelled = 0;

  for (const booking of candidates) {
    // Pre-check: did a prior attempt of this same job already perform
    // the transition? If so, only the cache invalidation remains.
    const current = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { status: true, cancellationReason: true },
    });

    if (!current) continue;

    const alreadyExpiredByUs =
      current.status === 'cancelled' &&
      current.cancellationReason === 'EXPIRATION_TIMEOUT';

    if (!alreadyExpiredByUs) {
      // Lost the race to a concurrent API call (admin confirmed /
      // customer cancelled) — the core would reject this anyway.
      if (current.status !== 'pending') continue;

      try {
        await transitionBooking.execute({
          bookingId: booking.id,
          actor: { userId: SYSTEM_ACTOR_ID, role: 'system' },
          to: 'cancelled',
          cancellationReason: 'EXPIRATION_TIMEOUT',
        });
        cancelled += 1;
      } catch (err) {
        // Business error (lost race, invalid state, timing guard).
        // Do not retry — just skip invalidation for this booking.
        console.error(
          `[worker] pending expiration transition failed for ${booking.id}:`,
          err,
        );
        continue;
      }
    }

    // Reached on: (a) transition just succeeded, or (b) a prior
    // attempt of this same job already transitioned the booking.
    // In both cases the cache invalidation is still outstanding.
    await invalidateAvailabilityForResource(booking.resourceId);
  }

  return { scanned: candidates.length, cancelled };
}

export const pendingBookingExpirationJob = runPendingBookingExpiration;