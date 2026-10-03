import type { Job } from 'bullmq';

import type { BookingReminderPayload } from '@reservio/queue';

export async function bookingReminderJob(
  job: Job<BookingReminderPayload>,
): Promise<void> {
  const { bookingId } = job.data;

 
  console.log(
    `[worker] booking-reminder placeholder — bookingId=${bookingId}, jobId=${job.id}`,
  );
}
