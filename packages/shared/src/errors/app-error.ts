export interface AppErrorOptions {
  code: string;
  message: string;
  httpStatus?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Base class for every error the application throws deliberately.
 *
 * `code` is the stable, machine-readable identifier the API exposes
 * to clients. It never changes once published.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(opts: AppErrorOptions) {
    super(
      opts.message,
      opts.cause !== undefined ? { cause: opts.cause } : undefined,
    );

    this.name = this.constructor.name;
    this.code = opts.code;
    this.httpStatus = opts.httpStatus ?? 500;
    this.details = opts.details;

    Error.captureStackTrace?.(this, this.constructor);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}