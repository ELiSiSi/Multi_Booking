import type { Job } from 'bullmq';

import type { PendingExpirationPayload } from '@reservio/queue';

export async function pendingBookingExpirationJob(
  job: Job<PendingExpirationPayload>,
): Promise<void> {
  const { bookingId } = job.data;

 
  console.log(
    `[worker] pending-expiration placeholder — bookingId=${bookingId}, jobId=${job.id}`,
  );
}
