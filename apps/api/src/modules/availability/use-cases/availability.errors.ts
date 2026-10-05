import { AppError } from '@reservio/shared';

export class AvailabilityContextNotFoundError extends AppError {
  constructor() {
    super({
      code: 'AVAILABILITY_CONTEXT_NOT_FOUND',
      message: 'Business, location, resource, or service not found',
      httpStatus: 404,
    });
  }
}

export class InvalidDateError extends AppError {
  constructor(date: string) {
    super({
      code: 'INVALID_DATE',
      message: `Invalid date: "${date}". Expected YYYY-MM-DD`,
      httpStatus: 400,
    });
  }
}