import cors from '@fastify/cors';
import fp from 'fastify-plugin';

import { loadEnv } from '@reservio/config';

const env = loadEnv();

export default fp(
  async (app) => {
    await app.register(cors, {
      origin: env.NODE_ENV === 'development' ? true : false,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86_400,
    });
  },
  { name: 'cors' },
);
