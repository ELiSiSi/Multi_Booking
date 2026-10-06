export const JOB_NAMES = {
  PENDING_EXPIRATION: 'pending-expiration',
  BOOKING_REMINDER: 'booking-reminder',
  IDEMPOTENCY_CLEANUP: 'idempotency-cleanup',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface PendingExpirationPayload {
  // The handler scans all pending bookings — no per-job data needed.
}

export interface BookingReminderPayload {
  // The handler scans upcoming bookings — no per-job data needed.
}

export interface IdempotencyCleanupPayload {
  // Reserved for Post-V1.
}

export interface JobPayloadMap {
  [JOB_NAMES.PENDING_EXPIRATION]: PendingExpirationPayload;
  [JOB_NAMES.BOOKING_REMINDER]: BookingReminderPayload;
  [JOB_NAMES.IDEMPOTENCY_CLEANUP]: IdempotencyCleanupPayload;
}

export type JobPayload<N extends JobName> = JobPayloadMap[N];