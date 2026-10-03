import type { Job } from 'bullmq';

import type { BookingReminderPayload } from '@reservio/queue';

/**
 * Handles `booking-reminder` jobs.
 *
 * Scheduled by the API after the `pending → confirmed` transition.
 * Fires at `startAt − reminderLeadTime`.
 *
 * This is a NOTIFICATION job — it does NOT change booking state.
 *
 * V1 placeholder: the actual notification pipeline lands in Phase 6.
 */
export async function bookingReminderJob(
  job: Job<BookingReminderPayload>,
): Promise<void> {
  const { bookingId } = job.data;

  // TODO (Phase 6): send reminder through the notification pipeline.
  console.log(
    `[worker] booking-reminder placeholder — bookingId=${bookingId}, jobId=${job.id}`,
  );
}
