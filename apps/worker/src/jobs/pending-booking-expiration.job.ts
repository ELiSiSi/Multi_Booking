import { prisma } from '@reservio/database';
import { redis } from '@reservio/redis';

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
    // Redis is a performance layer only; log and continue.
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

    const updated = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'pending' },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancellationReason: 'pending_timeout',
      },
    });

    if (updated.count > 0) {
      cancelled += 1;

      await prisma.auditEvent.create({
        data: {
          bookingId: booking.id,
          actorId: booking.customerId,
          action: 'booking.cancelled',
          metadata: {
            from: 'pending',
            to: 'cancelled',
            reason: 'pending_timeout',
          },
        },
      });

      // Post-commit cache invalidation.
      await invalidateAvailabilityForResource(booking.resourceId);
    }
  }

  return { scanned: candidates.length, cancelled };
}

export const pendingBookingExpirationJob = runPendingBookingExpiration;