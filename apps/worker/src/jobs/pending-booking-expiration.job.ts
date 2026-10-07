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

  try {
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
  } catch (error) {
    console.error('[worker] cache invalidation failed:', error);
  }
}

export async function runPendingBookingExpiration(
  _job?: unknown,
): Promise<PendingExpirationResult> {
  const now = new Date();

  const candidates = await prisma.booking.findMany({
    where: { status: 'pending' },
    orderBy: [{ createdAt: 'asc' }],
    take: 500,
    include: {
      business: { select: { pendingTimeoutMinutes: true } },
    },
  });

  let cancelled = 0;

  for (const booking of candidates) {
    const timeoutMs = booking.business.pendingTimeoutMinutes * 60_000;
    const expiresAt = new Date(booking.createdAt.getTime() + timeoutMs);

    if (expiresAt.getTime() > now.getTime()) {
      continue;
    }

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


    await invalidateAvailabilityForResource(booking.resourceId);
  }

  return { scanned: candidates.length, cancelled };
}

export const pendingBookingExpirationJob = runPendingBookingExpiration;