import { AppError, type AppErrorOptions } from './app-error.js';

/**
 * Errors that describe a failure in an external dependency
 * (database, Redis, queue, network). Usually transient and
 * therefore safe to retry.
 *
 * Defaults to HTTP 503 (Service Unavailable).
 */
export class InfraError extends AppError {
  constructor(
    opts: Omit<AppErrorOptions, 'httpStatus'> & { httpStatus?: number },
  ) {
    super({ httpStatus: 503, ...opts });
  }
}