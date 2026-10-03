import { UnrecoverableError, Worker } from 'bullmq';
import pino from 'pino';

import { loadEnv } from '@reservio/config';
import { prisma } from '@reservio/database';
import { connection, JOB_NAMES } from '@reservio/queue';
import { redis } from '@reservio/redis';
import {
  type BookingReminderPayload,
  type PendingExpirationPayload,
} from '@reservio/queue';

import { bookingReminderJob } from './jobs/booking-reminder.job.js';
import { pendingBookingExpirationJob } from './jobs/pending-booking-expiration.job.js';

const env = loadEnv();

const logger = pino({
  level: env.NODE_ENV === 'development' ? 'info' : 'warn',
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

async function main(): Promise<void> {
  logger.info('Worker starting...');

  
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Postgres connection verified');
  } catch (err) {
    logger.error({ err }, 'Failed to reach Postgres — exiting');
    process.exit(1);
  }

  try {
    await redis.ping();
    logger.info('Redis connection verified');
  } catch (err) {
    logger.error({ err }, 'Failed to reach Redis — exiting');
    process.exit(1);
  }

  
  const worker = new Worker(
    'booking-jobs',
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.PENDING_EXPIRATION:
          await pendingBookingExpirationJob(
            job as Parameters<typeof pendingBookingExpirationJob>[0],
          );
          break;

        case JOB_NAMES.BOOKING_REMINDER:
          await bookingReminderJob(
            job as Parameters<typeof bookingReminderJob>[0],
          );
          break;

        default:
          logger.error(
            { jobName: job.name, jobId: job.id },
            'Unknown job name',
          );
          throw new UnrecoverableError(`Unknown booking job: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  
  worker.on('ready', () => {
    logger.info(
      `Worker ready — concurrency=${env.WORKER_CONCURRENCY}, queue=booking-jobs`,
    );
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, jobName: job?.name, err },
      'Job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn(`Received ${signal} again, ignoring`);
      return;
    }
    shuttingDown = true;

    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await worker.close();
      logger.info('Worker closed');

      await prisma.$disconnect();
      logger.info('Postgres disconnected');

      await redis.quit();
      logger.info('Redis disconnected');

      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

void main();
