import fp from 'fastify-plugin';
import { isAppError } from '@reservio/shared';

export default fp(
  async (app) => {
    app.setErrorHandler((error, request, reply) => {
      // ─── 1. AppError (our own errors) ────────────────────
      if (isAppError(error)) {
        const logLevel = error.httpStatus >= 500 ? 'error' : 'warn';

        request.log[logLevel](
          {
            code: error.code,
            httpStatus: error.httpStatus,
            details: error.details,
            err: error,
          },
          error.message,
        );

        return reply.code(error.httpStatus).send({
          error: {
            code: error.code,
            message: error.message,
            ...(error.details !== undefined && { details: error.details }),
          },
        });
      }

      // ─── 2. Normalize the remaining error into a known shape ─
      const fastifyError = error as Error & {
        validation?: unknown;
        statusCode?: number;
      };

      // ─── 3. Fastify validation errors ────────────────────
      if (fastifyError.validation) {
        request.log.warn(
          { err: fastifyError, validation: fastifyError.validation },
          'Request validation failed',
        );

        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: fastifyError.message,
            details: fastifyError.validation as Record<string, unknown>,
          },
        });
      }

      // ─── 4. Any error with explicit 4xx statusCode ───────
      if (
        fastifyError.statusCode !== undefined &&
        fastifyError.statusCode >= 400 &&
        fastifyError.statusCode < 500
      ) {
        request.log.warn({ err: fastifyError }, fastifyError.message);

        return reply.code(fastifyError.statusCode).send({
          error: {
            code: 'CLIENT_ERROR',
            message: fastifyError.message,
          },
        });
      }

      // ─── 5. Unknown errors ──────────────────────────────
      request.log.error({ err: fastifyError }, 'Unhandled error');

      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      });
    });

    app.setNotFoundHandler((request, reply) => {
      request.log.warn(
        { method: request.method, url: request.url },
        'Route not found',
      );

      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.url} not found.`,
        },
      });
    });
  },
  { name: 'error-handler' },
);
