import type { Job } from 'bullmq';

import type { PendingExpirationPayload } from '@reservio/queue';

/**
 * Handles `pending-expiration` jobs.
 *
 * When a booking is created, a delayed job is scheduled for
 * `pendingExpiresAt`. When it fires, this handler must:
 *   1. Reload the booking from PostgreSQL.
 *   2. If still `pending` and the threshold has passed, call
 *      `booking-core`'s transition use case to move it to
 *      `cancelled` with reason `EXPIRATION_TIMEOUT`.
 *   3. Invalidate the availability cache.
 *
 * V1 placeholder: the actual implementation lands in Phase 6
 * once `packages/booking-core` exists.
 */
export async function pendingBookingExpirationJob(
  job: Job<PendingExpirationPayload>,
): Promise<void> {
  const { bookingId } = job.data;

  // TODO (Phase 6): delegate to booking-core transition use case.
  console.log(
    `[worker] pending-expiration placeholder — bookingId=${bookingId}, jobId=${job.id}`,
  );
}
