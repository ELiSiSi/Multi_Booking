import { Queue } from 'bullmq';

import { connection } from './connection.js';

const globalForQueue = globalThis as unknown as {
  bookingQueue: Queue | undefined;
};


export const bookingQueue: Queue =
  globalForQueue.bookingQueue ??
  new Queue('booking-jobs', {
    connection,
    defaultJobOptions: {
      // Retry policy: 3 attempts with exponential backoff.
      // 1st attempt: immediately
      // 2nd attempt: ~5s after failure
      // 3rd attempt: ~10s after failure
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },

      // Keep a bounded history for debugging.
      removeOnComplete: {
        age: 3_600, // 1 hour
        count: 1_000,
      },
      removeOnFail: {
        age: 86_400, // 24 hours
        count: 5_000,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.bookingQueue = bookingQueue;
}