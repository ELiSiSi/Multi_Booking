import { AppError } from '@reservio/shared';

export class BookingNotFoundError extends AppError {
  constructor(bookingId: string) {
    super({
      code: 'BOOKING_NOT_FOUND',
      message: `Booking not found: ${bookingId}`,
      httpStatus: 404,
    });
  }
}

export class BookingContextNotFoundError extends AppError {
  constructor() {
    super({
      code: 'BOOKING_CONTEXT_NOT_FOUND',
      message: 'Business, location, resource, or service not found',
      httpStatus: 404,
    });
  }
}

export class SlotUnavailableError extends AppError {
  constructor() {
    super({
      code: 'SLOT_UNAVAILABLE',
      message: 'The requested time slot is no longer available',
      httpStatus: 409,
    });
  }
}

export class ServiceResourceNotAssignedError extends AppError {
  constructor() {
    super({
      code: 'SERVICE_RESOURCE_NOT_ASSIGNED',
      message: 'The requested service is not offered by this resource',
      httpStatus: 400,
    });
  }
}

export class InvalidBookingTimeError extends AppError {
  constructor(message: string) {
    super({
      code: 'INVALID_BOOKING_TIME',
      message,
      httpStatus: 400,
    });
  }
}

export class StartInPastError extends AppError {
  constructor() {
    super({
      code: 'START_IN_PAST',
      message: 'Booking start time must be in the future',
      httpStatus: 400,
    });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super({
      code: 'IDEMPOTENCY_CONFLICT',
      message:
        'The Idempotency-Key was already used with a different request body',
      httpStatus: 409,
    });
  }
}