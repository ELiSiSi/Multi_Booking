import type { FastifyInstance } from 'fastify';

import { buildIdentityModule } from './identity.module.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerUserRoutes } from './routes/user.routes.js';

export async function registerIdentityModule(
  app: FastifyInstance,
): Promise<void> {
  const identity = await buildIdentityModule();

  registerAuthRoutes(app, identity);
  registerUserRoutes(app, identity);
}

export * from './identity.module.js';
