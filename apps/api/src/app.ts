import Fastify, { type FastifyInstance } from 'fastify';

import registerAuth from './plugins/auth.js';
import registerCookie from './plugins/cookie.js';
import registerCors from './plugins/cors.js';
import registerErrorHandler from './plugins/error-handler.js';
import registerHealth from './plugins/health.js';
import registerSwagger from './plugins/swagger.js';
import { registerIdentityModule } from './modules/identity/index.js';
import { registerCatalogModule } from './modules/catalog/index.js';
import { registerAvailabilityModule } from './modules/availability/index.js';
import { registerBookingModule } from './modules/bookings/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      process.env.VITEST === 'true'
        ? false
        : {
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
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: true,
        allErrors: false,
      },
    },
  });

  await registerCors(app);
  await registerCookie(app);
  await registerAuth(app);
  await registerSwagger(app);
  await registerErrorHandler(app);
  await registerHealth(app);

  await registerIdentityModule(app);
  await registerCatalogModule(app);
  await registerAvailabilityModule(app);
  await registerBookingModule(app);

  return app;
}