import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';

import {
  JOB_NAMES,
  type BookingReminderPayload,
  type PendingExpirationPayload,
} from '@reservio/queue';

import { bookingReminderJob } from '../src/jobs/booking-reminder.job.js';
import { pendingBookingExpirationJob } from '../src/jobs/pending-booking-expiration.job.js';

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

function makeJob<T>(
  name: string,
  data: T,
  id: string | undefined = 'test-job-id',
): Job<T> {
  return {
    id,
    name,
    data,
  } as unknown as Job<T>;
}

// ─────────────────────────────────────────────────────────────
// pendingBookingExpirationJob
// ─────────────────────────────────────────────────────────────

describe('pendingBookingExpirationJob', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('is a function', () => {
    expect(typeof pendingBookingExpirationJob).toBe('function');
  });

  it('accepts a valid PendingExpirationPayload and resolves', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-001' },
      'pending-job-1',
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();
  });

  it('returns a Promise', () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-promise' },
    );

    const result = pendingBookingExpirationJob(job);

    expect(result).toBeInstanceOf(Promise);

    return result;
  });

  it('logs exactly once', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-log-once' },
      'pending-log-once',
    );

    await pendingBookingExpirationJob(job);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('logs the correct job name', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-name' },
      'pending-name',
    );

    await pendingBookingExpirationJob(job);

    const message = String(logSpy.mock.calls[0]?.[0]);

    expect(message).toContain(JOB_NAMES.PENDING_EXPIRATION);
  });

  it('logs the bookingId', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-xyz' },
      'pending-job-2',
    );

    await pendingBookingExpirationJob(job);

    const message = String(logSpy.mock.calls[0]?.[0]);

    expect(message).toContain('booking-xyz');
  });

  it('logs the job id', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-job-id' },
      'pending-job-123',
    );

    await pendingBookingExpirationJob(job);

    const message = String(logSpy.mock.calls[0]?.[0]);

    expect(message).toContain('pending-job-123');
  });

  it('handles an empty bookingId without throwing', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: '' },
      'pending-empty',
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();
  });

  it('handles a very long bookingId', async () => {
    const bookingId = 'b'.repeat(10_000);

    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId },
      'pending-long',
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain(bookingId);
  });

  it('handles special characters in bookingId', async () => {
    const bookingId = 'booking-123_ABC:/?@#$%';

    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId },
      'pending-special',
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain(bookingId);
  });

  it('handles unicode characters in bookingId', async () => {
    const bookingId = 'booking-🎉-مصر-予約';

    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId },
      'pending-unicode',
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain(bookingId);
  });

  it('handles an undefined job id', async () => {
    const job = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-no-id' },
      undefined,
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();
  });

  it('does not mutate job.data', async () => {
    const data: PendingExpirationPayload = {
      bookingId: 'booking-immutable',
    };

    const original = { ...data };
    const job = makeJob(JOB_NAMES.PENDING_EXPIRATION, data);

    await pendingBookingExpirationJob(job);

    expect(job.data).toEqual(original);
    expect(job.data).toBe(data);
  });

  it('supports multiple jobs independently', async () => {
    const job1 = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-1' },
      'job-1',
    );

    const job2 = makeJob<PendingExpirationPayload>(
      JOB_NAMES.PENDING_EXPIRATION,
      { bookingId: 'booking-2' },
      'job-2',
    );

    await Promise.all([
      pendingBookingExpirationJob(job1),
      pendingBookingExpirationJob(job2),
    ]);

    expect(logSpy).toHaveBeenCalledTimes(2);

    const messages = logSpy.mock.calls.map((call) => String(call[0]));

    expect(messages.some((message) => message.includes('booking-1'))).toBe(
      true,
    );
    expect(messages.some((message) => message.includes('booking-2'))).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────
// bookingReminderJob
// ─────────────────────────────────────────────────────────────

describe('bookingReminderJob', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('is a function', () => {
    expect(typeof bookingReminderJob).toBe('function');
  });

  it('accepts a valid BookingReminderPayload and resolves', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-002' },
      'reminder-job-1',
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();
  });

  it('returns a Promise', () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-promise' },
    );

    const result = bookingReminderJob(job);

    expect(result).toBeInstanceOf(Promise);

    return result;
  });

  it('logs exactly once', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-log-once' },
      'reminder-log-once',
    );

    await bookingReminderJob(job);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('logs the correct job name', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-name' },
      'reminder-name',
    );

    await bookingReminderJob(job);

    const message = String(logSpy.mock.calls[0]?.[0]);

    expect(message).toContain(JOB_NAMES.BOOKING_REMINDER);
  });

  it('logs the bookingId', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-abc' },
      'reminder-job-2',
    );

    await bookingReminderJob(job);

    const message = String(logSpy.mock.calls[0]?.[0]);

    expect(message).toContain('booking-abc');
  });

  it('logs the job id', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-job-id' },
      'reminder-job-123',
    );

    await bookingReminderJob(job);

    const message = String(logSpy.mock.calls[0]?.[0]);

    expect(message).toContain('reminder-job-123');
  });

  it('handles an empty bookingId without throwing', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: '' },
      'reminder-empty',
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();
  });

  it('handles a very long bookingId', async () => {
    const bookingId = 'r'.repeat(10_000);

    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId },
      'reminder-long',
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain(bookingId);
  });

  it('handles special characters in bookingId', async () => {
    const bookingId = 'booking-123_ABC:/?@#$%';

    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId },
      'reminder-special',
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain(bookingId);
  });

  it('handles unicode characters in bookingId', async () => {
    const bookingId = 'booking-with-🎉-مصر-予約';

    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId },
      'reminder-unicode',
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();

    const message = String(logSpy.mock.calls[0]?.[0]);
    expect(message).toContain(bookingId);
  });

  it('handles an undefined job id', async () => {
    const job = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-no-id' },
      undefined,
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();
  });

  it('does not mutate job.data', async () => {
    const data: BookingReminderPayload = {
      bookingId: 'booking-immutable',
    };

    const original = { ...data };
    const job = makeJob(JOB_NAMES.BOOKING_REMINDER, data);

    await bookingReminderJob(job);

    expect(job.data).toEqual(original);
    expect(job.data).toBe(data);
  });

  it('supports multiple jobs independently', async () => {
    const job1 = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-1' },
      'job-1',
    );

    const job2 = makeJob<BookingReminderPayload>(
      JOB_NAMES.BOOKING_REMINDER,
      { bookingId: 'booking-2' },
      'job-2',
    );

    await Promise.all([
      bookingReminderJob(job1),
      bookingReminderJob(job2),
    ]);

    expect(logSpy).toHaveBeenCalledTimes(2);

    const messages = logSpy.mock.calls.map((call) => String(call[0]));

    expect(messages.some((message) => message.includes('booking-1'))).toBe(
      true,
    );
    expect(messages.some((message) => message.includes('booking-2'))).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Consistency checks
// ─────────────────────────────────────────────────────────────

describe('job handlers — consistency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('both job handlers are distinct functions', () => {
    expect(pendingBookingExpirationJob).not.toBe(bookingReminderJob);
  });

  it('both job handlers are async functions', () => {
    expect(pendingBookingExpirationJob.constructor.name).toBe('AsyncFunction');
    expect(bookingReminderJob.constructor.name).toBe('AsyncFunction');
  });

  it('both handlers return promises', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const pending = pendingBookingExpirationJob(
      makeJob<PendingExpirationPayload>(JOB_NAMES.PENDING_EXPIRATION, {
        bookingId: 'pending-x',
      }),
    );

    const reminder = bookingReminderJob(
      makeJob<BookingReminderPayload>(JOB_NAMES.BOOKING_REMINDER, {
        bookingId: 'reminder-y',
      }),
    );

    expect(pending).toBeInstanceOf(Promise);
    expect(reminder).toBeInstanceOf(Promise);

    return Promise.all([pending, reminder]);
  });

  it('handlers do not share the same payload object', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const pendingData: PendingExpirationPayload = {
      bookingId: 'pending-booking',
    };

    const reminderData: BookingReminderPayload = {
      bookingId: 'reminder-booking',
    };

    const pendingJob = makeJob(
      JOB_NAMES.PENDING_EXPIRATION,
      pendingData,
    );

    const reminderJob = makeJob(
      JOB_NAMES.BOOKING_REMINDER,
      reminderData,
    );

    await Promise.all([
      pendingBookingExpirationJob(pendingJob),
      bookingReminderJob(reminderJob),
    ]);

    expect(pendingJob.data).toBe(pendingData);
    expect(reminderJob.data).toBe(reminderData);
    expect(pendingJob.data).not.toBe(reminderJob.data);
  });
});