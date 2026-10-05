import '@fastify/cookie';
import type { FastifyInstance } from 'fastify';

import type { IdentityModule } from '../identity.module.js';

export function registerUserRoutes(
  app: FastifyInstance,
  identity: IdentityModule,
): void {

  app.get(
    '/users/me',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const actor = request.actor!;
      const user = await identity.users.findById(actor.userId);

      if (!user) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required.',
          },
        });
      }

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
        },
      });
    },
  );
}
