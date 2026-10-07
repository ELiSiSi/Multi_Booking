import { AppError } from '@reservio/shared';

import type { BookingStatus } from './booking-status.js';

export class BookingNotFoundError extends AppError {
  constructor(bookingId: string) {
    super({
      code: 'BOOKING_NOT_FOUND',
      message: `Booking not found: ${bookingId}`,
      httpStatus: 404,
    });
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(from: BookingStatus, to: BookingStatus) {
    super({
      code: 'INVALID_STATE_TRANSITION',
      message: `Cannot transition booking from ${from} to ${to}`,
      httpStatus: 409,
    });
  }
}

export class CancellationWindowPassedError extends AppError {
  constructor() {
    super({
      code: 'CANCELLATION_WINDOW_PASSED',
      message: 'Cancellation window has passed for this booking',
      httpStatus: 409,
    });
  }
}

export class BookingCancellationClosedError extends AppError {
  constructor() {
    super({
      code: 'BOOKING_CANCELLATION_CLOSED',
      message: 'This booking can no longer be cancelled',
      httpStatus: 409,
    });
  }
}

export class BookingNotYetCompletedError extends AppError {
  constructor() {
    super({
      code: 'BOOKING_NOT_YET_COMPLETED',
      message:
        'Booking cannot be completed until its protected interval has elapsed',
      httpStatus: 409,
    });
  }
}

export class BookingNotStartedError extends AppError {
  constructor() {
    super({
      code: 'BOOKING_NOT_STARTED',
      message:
        'A booking cannot be marked as no-show before its start time',
      httpStatus: 409,
    });
  }
}

export class ForbiddenRoleError extends AppError {
  constructor() {
    super({
      code: 'FORBIDDEN_ROLE',
      message: 'This actor is not permitted to perform this transition',
      httpStatus: 403,
    });
  }
}