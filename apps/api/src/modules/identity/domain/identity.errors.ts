import { AppError } from '@reservio/shared';

export class EmailAlreadyRegisteredError extends AppError {
  constructor() {
    super({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with this email already exists.',
      httpStatus: 409,
    });
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      httpStatus: 401,
    });
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token is invalid or has expired.',
      httpStatus: 401,
    });
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
      httpStatus: 401,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action.') {
    super({
      code: 'FORBIDDEN',
      message,
      httpStatus: 403,
    });
  }
}

export class NotBookingOwnerError extends AppError {
  constructor() {
    super({
      code: 'NOT_BOOKING_OWNER',
      message: 'You do not own this booking.',
      httpStatus: 403,
    });
  }
}
