import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { loadEnv } from '@reservio/config';
import {
  ForbiddenError,
  UnauthenticatedError,
} from '../modules/identity/use-cases/identity.errors.js';
import type { Actor, Role } from '../modules/identity/use-cases/_support.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    requireRole: (
      role: Role,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    actor: Actor;
  }
}

const env = loadEnv();

export default fp(
  async (app) => {
    await app.register(fastifyJwt, {
      secret: {
        private: env.ACCESS_TOKEN_PRIVATE_KEY,
        public: env.ACCESS_TOKEN_PUBLIC_KEY,
      },
      sign: {
        algorithm: 'EdDSA',
        iss: env.JWT_ISSUER,
        aud: env.JWT_AUDIENCE,
        expiresIn: '15m',
      },
      verify: {
        algorithms: ['EdDSA'],
        allowedIss: env.JWT_ISSUER,
        allowedAud: env.JWT_AUDIENCE,
      },
    });

    app.decorate(
      'authenticate',
      async (request: FastifyRequest, _reply: FastifyReply) => {
        try {
          const payload = await request.jwtVerify<{ sub: string; role: Role }>();
          request.actor = { userId: payload.sub, role: payload.role };
        } catch {
          throw new UnauthenticatedError();
        }
      },
    );

    app.decorate(
      'requireRole',
      (role: Role) =>
        async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
          await app.authenticate(request, reply);

          if (request.actor.role !== role) {
            throw new ForbiddenError();
          }
        },
    );
  },
  { name: 'auth' },
);