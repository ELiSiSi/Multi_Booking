import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';

import {
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
  id = 'test-job-id',
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
      'pending-expiration',
      { bookingId: 'booking-001' },
      'pending-job-1',
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();
  });

  it('logs a message containing the bookingId', async () => {
    const job = makeJob<PendingExpirationPayload>(
      'pending-expiration',
      { bookingId: 'booking-xyz' },
      'pending-job-2',
    );

    await pendingBookingExpirationJob(job);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = logSpy.mock.calls[0][0] as string;
    expect(message).toContain('pending-expiration');
    expect(message).toContain('booking-xyz');
    expect(message).toContain('pending-job-2');
  });

  it('returns a Promise', () => {
    const job = makeJob<PendingExpirationPayload>(
      'pending-expiration',
      { bookingId: 'booking-promise' },
    );

    const result = pendingBookingExpirationJob(job);
    expect(result).toBeInstanceOf(Promise);

    return result;
  });

  it('does not throw for any string bookingId', async () => {
    const job = makeJob<PendingExpirationPayload>(
      'pending-expiration',
      { bookingId: '' },
    );

    await expect(pendingBookingExpirationJob(job)).resolves.toBeUndefined();
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
      'booking-reminder',
      { bookingId: 'booking-002' },
      'reminder-job-1',
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();
  });

  it('logs a message containing the bookingId', async () => {
    const job = makeJob<BookingReminderPayload>(
      'booking-reminder',
      { bookingId: 'booking-abc' },
      'reminder-job-2',
    );

    await bookingReminderJob(job);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = logSpy.mock.calls[0][0] as string;
    expect(message).toContain('booking-reminder');
    expect(message).toContain('booking-abc');
    expect(message).toContain('reminder-job-2');
  });

  it('returns a Promise', () => {
    const job = makeJob<BookingReminderPayload>(
      'booking-reminder',
      { bookingId: 'booking-promise' },
    );

    const result = bookingReminderJob(job);
    expect(result).toBeInstanceOf(Promise);

    return result;
  });

  it('does not throw for any string bookingId', async () => {
    const job = makeJob<BookingReminderPayload>(
      'booking-reminder',
      { bookingId: '' },
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();
  });

  it('does not throw when bookingId contains special characters', async () => {
    const job = makeJob<BookingReminderPayload>(
      'booking-reminder',
      { bookingId: 'booking-with-🎉-emoji' },
    );

    await expect(bookingReminderJob(job)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Consistency checks
// ─────────────────────────────────────────────────────────────

describe('job handlers — consistency', () => {
  it('both job handlers are distinct functions', () => {
    expect(pendingBookingExpirationJob).not.toBe(bookingReminderJob);
  });

  it('both job handlers are async (return Promise)', async () => {
    const pending = pendingBookingExpirationJob(
      makeJob<PendingExpirationPayload>('pending-expiration', {
        bookingId: 'x',
      }),
    );
    const reminder = bookingReminderJob(
      makeJob<BookingReminderPayload>('booking-reminder', {
        bookingId: 'y',
      }),
    );

    expect(pending).toBeInstanceOf(Promise);
    expect(reminder).toBeInstanceOf(Promise);

    // Silence console noise from the handlers.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await Promise.all([pending, reminder]);
    vi.restoreAllMocks();
  });
});
