import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  bookingQueue,
  JOB_NAMES,
  type BookingReminderPayload,
  type PendingExpirationPayload,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────
// Test configuration
// ─────────────────────────────────────────────────────────────

const TEST_JOB_ID_PREFIX = 'test-job-';

function makeJobId(suffix: string): string {
  return `${TEST_JOB_ID_PREFIX}${suffix}`;
}

async function cleanTestJobs(): Promise<void> {
  // Remove any leftover test jobs from previous runs.
  const jobs = await bookingQueue.getJobs([
    'waiting',
    'delayed',
    'active',
    'completed',
    'failed',
  ]);

  await Promise.all(
    jobs
      .filter((job) => job.id?.startsWith(TEST_JOB_ID_PREFIX))
      .map((job) => job.remove()),
  );
}

// ─────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────

describe('bookingQueue', () => {
  beforeAll(async () => {
    // Make sure the queue can reach Redis.
    await bookingQueue.waitUntilReady();
  });

  beforeEach(async () => {
    await cleanTestJobs();
  });

  afterAll(async () => {
    await cleanTestJobs();
    await bookingQueue.close();
  });

  // ─────────────────────────────────────────────────────────
  // 1. Connection and configuration
  // ─────────────────────────────────────────────────────────

  describe('connection and configuration', () => {
    it('is connected to Redis and ready', async () => {
      const client = await bookingQueue.client;
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    });

    it('uses the queue name "booking-jobs"', () => {
      expect(bookingQueue.name).toBe('booking-jobs');
    });

    it('exposes the exact set of expected job names', () => {
      expect(JOB_NAMES.PENDING_EXPIRATION).toBe('pending-expiration');
      expect(JOB_NAMES.BOOKING_REMINDER).toBe('booking-reminder');
      expect(JOB_NAMES.IDEMPOTENCY_CLEANUP).toBe('idempotency-cleanup');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. Adding jobs
  // ─────────────────────────────────────────────────────────

  describe('adding jobs', () => {
    it('adds a pending-expiration job', async () => {
      const payload: PendingExpirationPayload = {
        bookingId: 'booking-001',
      };

      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        payload,
        { jobId: makeJobId('pending-1') },
      );

      expect(job).toBeDefined();
      expect(job.id).toBe(makeJobId('pending-1'));
      expect(job.name).toBe('pending-expiration');
      expect(job.data).toEqual(payload);
    });

    it('adds a booking-reminder job', async () => {
      const payload: BookingReminderPayload = {
        bookingId: 'booking-002',
      };

      const job = await bookingQueue.add(
        JOB_NAMES.BOOKING_REMINDER,
        payload,
        { jobId: makeJobId('reminder-1') },
      );

      expect(job.id).toBe(makeJobId('reminder-1'));
      expect(job.name).toBe('booking-reminder');
      expect(job.data).toEqual(payload);
    });

    it('adds an idempotency-cleanup job with empty payload', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.IDEMPOTENCY_CLEANUP,
        {},
        { jobId: makeJobId('cleanup-1') },
      );

      expect(job.id).toBe(makeJobId('cleanup-1'));
      expect(job.name).toBe('idempotency-cleanup');
      expect(job.data).toEqual({});
    });

    it('adds a job with a delay', async () => {
      const delayMs = 60_000;
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-delayed' },
        {
          jobId: makeJobId('delayed-1'),
          delay: delayMs,
        },
      );

      expect(job.opts.delay).toBe(delayMs);
      // A delayed job is not in "waiting" yet.
      expect(await job.isDelayed()).toBe(true);
      expect(await job.isWaiting()).toBe(false);
    });

    it('allows overriding default job options per job', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-override' },
        {
          jobId: makeJobId('override-1'),
          attempts: 5,
          backoff: { type: 'fixed', delay: 1_000 },
        },
      );

      expect(job.opts.attempts).toBe(5);
      expect(job.opts.backoff).toEqual({ type: 'fixed', delay: 1_000 });
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. Default job options
  // ─────────────────────────────────────────────────────────

  describe('default job options', () => {
    it('applies attempts = 3 by default', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-defaults' },
        { jobId: makeJobId('defaults-1') },
      );

      expect(job.opts.attempts).toBe(3);
    });

    it('applies exponential backoff with base delay 5000ms', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-backoff' },
        { jobId: makeJobId('backoff-1') },
      );

      expect(job.opts.backoff).toEqual({
        type: 'exponential',
        delay: 5_000,
      });
    });

    it('applies removeOnComplete retention by default', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-retention' },
        { jobId: makeJobId('retention-1') },
      );

      expect(job.opts.removeOnComplete).toEqual({
        age: 3_600,
        count: 1_000,
      });
    });

    it('applies removeOnFail retention by default', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-retention-fail' },
        { jobId: makeJobId('retention-fail-1') },
      );

      expect(job.opts.removeOnFail).toEqual({
        age: 86_400,
        count: 5_000,
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. Job retrieval
  // ─────────────────────────────────────────────────────────

  describe('job retrieval', () => {
    it('retrieves a job by ID', async () => {
      const jobId = makeJobId('retrieve-1');
      await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-retrieve' },
        { jobId },
      );

      const fetched = await bookingQueue.getJob(jobId);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(jobId);
      expect(fetched?.data).toEqual({ bookingId: 'booking-retrieve' });
    });

    it('returns undefined for a non-existent job ID', async () => {
      const fetched = await bookingQueue.getJob('non-existent-job-id');
      expect(fetched).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 5. Job removal
  // ─────────────────────────────────────────────────────────

  describe('job removal', () => {
    it('removes a job by ID', async () => {
      const jobId = makeJobId('remove-1');
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-remove' },
        { jobId },
      );

      await job.remove();

      const fetched = await bookingQueue.getJob(jobId);
      expect(fetched).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 6. Job counts
  // ─────────────────────────────────────────────────────────

  describe('job counts', () => {
    it('counts waiting jobs correctly', async () => {
      const before = await bookingQueue.getWaitingCount();

      await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'count-1' },
        { jobId: makeJobId('count-1') },
      );
      await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'count-2' },
        { jobId: makeJobId('count-2') },
      );

      const after = await bookingQueue.getWaitingCount();
      expect(after).toBe(before + 2);
    });

    it('counts delayed jobs correctly', async () => {
      const before = await bookingQueue.getDelayedCount();

      await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'delayed-count' },
        {
          jobId: makeJobId('delayed-count-1'),
          delay: 60_000,
        },
      );

      const after = await bookingQueue.getDelayedCount();
      expect(after).toBe(before + 1);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 7. Deduplication via jobId
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // 7. Deduplication
  // ─────────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('does not create a second job with the same jobId', async () => {
      const jobId = makeJobId('dedup-jobid-1');

      await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'dedup-a' },
        { jobId },
      );

      await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'dedup-b' },
        { jobId },
      );

      // BullMQ deduplicates by jobId: only one persisted job exists.
      // The exact payload of the returned Job instance is version-
      // dependent, so we only assert the count.
      const all = await bookingQueue.getJobs(['waiting', 'delayed']);
      const matching = all.filter((j) => j.id === jobId);

      expect(matching).toHaveLength(1);
    });

    it('deduplication.id prevents duplicate jobs while the original exists', async () => {
      const dedupId = makeJobId('dedup-option-1');

      const first = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'dedup-option-a' },
        {
          deduplication: { id: dedupId },
        },
      );

      const second = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'dedup-option-b' },
        {
          deduplication: { id: dedupId },
        },
      );

      // BullMQ returns the existing job when deduplication.id matches.
      expect(second.id).toBe(first.id);
    });
  });
  // ─────────────────────────────────────────────────────────
  // 8. Payload integrity
  // ─────────────────────────────────────────────────────────

  describe('payload integrity', () => {
    it('preserves a complex payload without modification', async () => {
      const payload = {
        bookingId: 'booking-complex',
        reason: 'EXPIRATION_TIMEOUT',
        requestedBy: 'system',
      };

      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        payload,
        { jobId: makeJobId('complex-1') },
      );

      expect(job.data).toEqual(payload);
    });

    it('preserves the job timestamp', async () => {
      const before = Date.now();

      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-ts' },
        { jobId: makeJobId('ts-1') },
      );

      const after = Date.now();

      expect(job.timestamp).toBeGreaterThanOrEqual(before);
      expect(job.timestamp).toBeLessThanOrEqual(after);
    });

    it('records the attempt counter starting at zero', async () => {
      const job = await bookingQueue.add(
        JOB_NAMES.PENDING_EXPIRATION,
        { bookingId: 'booking-attempts' },
        { jobId: makeJobId('attempts-1') },
      );

      expect(job.attemptsMade).toBe(0);
    });
  });
});