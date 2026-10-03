import { AppError } from '@reservio/shared';

// ─────────────────────────────────────────────────────────────
// Auth errors — all extend AppError from @reservio/shared.
//
// Codes are stable, machine-readable identifiers exposed to
// clients. They never change once published.
// ─────────────────────────────────────────────────────────────

/**
 * Registration: the email is already taken.
 * HTTP 409 Conflict.
 */
export class EmailAlreadyRegisteredError extends AppError {
  constructor() {
    super({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with this email already exists.',
      httpStatus: 409,
    });
  }
}

/**
 * Login: wrong email, wrong password, or suspended account.
 * Same error for all three cases to prevent account enumeration.
 * HTTP 401 Unauthorized.
 */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      httpStatus: 401,
    });
  }
}

/**
 * Refresh: the presented token is missing, expired, revoked,
 * unknown, or belongs to a user who is no longer ACTIVE.
 * HTTP 401 Unauthorized.
 */
export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token is invalid or has expired.',
      httpStatus: 401,
    });
  }
}

/**
 * Auth middleware: no access token, malformed token, expired
 * token, or a token whose subject no longer exists.
 * HTTP 401 Unauthorized.
 */
export class UnauthenticatedError extends AppError {
  constructor() {
    super({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
      httpStatus: 401,
    });
  }
}

/**
 * Authorization: the actor is authenticated but not permitted
 * to perform the operation.
 * HTTP 403 Forbidden.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action.') {
    super({
      code: 'FORBIDDEN',
      message,
      httpStatus: 403,
    });
  }
}
