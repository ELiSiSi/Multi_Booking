import type { BookingStatus } from './booking-status.js';

/**
 * The subset of a Booking that the booking-core cares about.
 * This decouples the core from Prisma/Infrastructure types.
 */
export interface Booking {
  id: string;
  businessId: string;
  resourceId: string;
  customerId: string;
  status: BookingStatus;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  /**
   * Snapshot of the point at which a pending booking may be expired by the
   * system. It is deliberately part of the core model so expiration is
   * protected by the domain layer, not only by the worker query.
   */
  pendingExpiresAt: Date | null;
}
