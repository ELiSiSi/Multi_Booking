import Fastify, { type FastifyInstance } from 'fastify';

import registerCors from './plugins/cors.js';
import registerErrorHandler from './plugins/error-handler.js';
import registerHealth from './plugins/health.js';
import registerSwagger from './plugins/swagger.js';

/**
 * Build and configure the Fastify application.
 *
 * This function does NOT start the server. It only wires the
 * application together, so it can be reused in tests via
 * `app.inject(...)` without binding to a port.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    trustProxy: false,
  });

  // ─── Plugins (order matters) ─────────────────────────────
  await registerCors(app);
  await registerSwagger(app);
  await registerErrorHandler(app);
  await registerHealth(app);

  // ─── Feature modules (added in later phases) ─────────────
  // await app.register(identityModule, { prefix: '/api/v1' });
  // await app.register(catalogModule, { prefix: '/api/v1' });
  // await app.register(availabilityModule, { prefix: '/api/v1' });
  // await app.register(bookingsModule, { prefix: '/api/v1' });

  return app;
}
