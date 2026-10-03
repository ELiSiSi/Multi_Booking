import Fastify, { type FastifyInstance } from 'fastify';

import registerAuth from './plugins/auth.js';
import registerCookie from './plugins/cookie.js';
import registerCors from './plugins/cors.js';
import registerErrorHandler from './plugins/error-handler.js';
import registerHealth from './plugins/health.js';
import registerSwagger from './plugins/swagger.js';
import { registerIdentityModule } from './modules/identity/index.js';

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
  await registerCookie(app);
  await registerAuth(app);
  await registerSwagger(app);
  await registerErrorHandler(app);
  await registerHealth(app);

  // ─── Feature modules ─────────────────────────────────────
  await registerIdentityModule(app);

  return app;
}
