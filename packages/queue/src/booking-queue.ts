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
     
     
     
     
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },

     
      removeOnComplete: {
        age: 3_600,
        count: 1_000,
      },
      removeOnFail: {
        age: 86_400,
        count: 5_000,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.bookingQueue = bookingQueue;
}