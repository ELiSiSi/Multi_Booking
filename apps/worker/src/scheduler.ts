import type { Job, Queue } from 'bullmq';
import { bookingQueue, JOB_NAMES } from '@reservio/queue';

const PENDING_EXPIRATION_INTERVAL_MS = 60_000; // every 1 minute
const BOOKING_REMINDER_INTERVAL_MS = 60_000;   // every 1 minute

export interface SchedulerLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export async function startScheduler(logger: SchedulerLogger): Promise<void> {
  try {
    await registerRepeatable(
      bookingQueue,
      JOB_NAMES.PENDING_EXPIRATION,
      'repeat:pending-expiration',
      PENDING_EXPIRATION_INTERVAL_MS,
    );
    logger.info(
      { jobName: JOB_NAMES.PENDING_EXPIRATION, everyMs: PENDING_EXPIRATION_INTERVAL_MS },
      'Registered repeatable job',
    );

    await registerRepeatable(
      bookingQueue,
      JOB_NAMES.BOOKING_REMINDER,
      'repeat:booking-reminder',
      BOOKING_REMINDER_INTERVAL_MS,
    );
    logger.info(
      { jobName: JOB_NAMES.BOOKING_REMINDER, everyMs: BOOKING_REMINDER_INTERVAL_MS },
      'Registered repeatable job',
    );
  } catch (err) {
    logger.error({ err }, 'Failed to register repeatable jobs');
    throw err;
  }
}

async function registerRepeatable(
  queue: Queue,
  jobName: string,
  jobId: string,
  everyMs: number,
): Promise<Job> {
  return queue.add(
    jobName,
    {},
    {
      jobId,
      repeat: { every: everyMs },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );
}