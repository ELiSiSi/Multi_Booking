import type { FastifyInstance } from 'fastify';

import { buildIdentityModule } from './identity.module.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerUserRoutes } from './routes/user.routes.js';

export async function registerIdentityModule(
  app: FastifyInstance,
): Promise<void> {
  const identity = await buildIdentityModule();

  await app.register(
    async (scoped) => {
      registerAuthRoutes(scoped, identity);
      registerUserRoutes(scoped, identity);
    },
    { prefix: '/api/v1' },
  );
}

export * from './identity.module.js';
