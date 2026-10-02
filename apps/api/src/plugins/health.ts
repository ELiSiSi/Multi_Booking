import fp from 'fastify-plugin';

import { prisma } from '@reservio/database';
import { redis } from '@reservio/redis';

export default fp(
  async (app) => {
    app.get(
      '/',
      {
        schema: {
          tags: ['health'],
          summary: 'Service info',
          response: {
            200: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                version: { type: 'string' },
                docs: { type: 'string' },
              },
              required: ['name', 'version'],
            },
          },
        },
      },
      async () => ({
        name: 'reservio-api',
        version: '0.1.0',
        docs: '/docs',
      }),
    );

    app.get(
      '/health',
      {
        schema: {
          tags: ['health'],
          summary: 'Liveness probe',
          description:
            'Returns 200 if the process is alive. Does not check dependencies.',
          response: {
            200: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                timestamp: { type: 'string' },
              },
              required: ['status'],
            },
          },
        },
      },
      async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
      }),
    );

    app.get(
      '/ready',
      {
        schema: {
          tags: ['health'],
          summary: 'Readiness probe',
          description:
            'Checks PostgreSQL and Redis connectivity. Returns 503 if either is unreachable.',
          response: {
            200: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                checks: {
                  type: 'object',
                  properties: {
                    postgres: { type: 'boolean' },
                    redis: { type: 'boolean' },
                  },
                  required: ['postgres', 'redis'],
                },
              },
              required: ['status', 'checks'],
            },
            503: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                checks: {
                  type: 'object',
                  properties: {
                    postgres: { type: 'boolean' },
                    redis: { type: 'boolean' },
                  },
                  required: ['postgres', 'redis'],
                },
              },
              required: ['status', 'checks'],
            },
          },
        },
      },
      async (_req, reply) => {
        const checks = {
          postgres: false,
          redis: false,
        };

        try {
          await prisma.$queryRaw`SELECT 1`;
          checks.postgres = true;
        } catch (err) {
          app.log.error({ err }, 'Readiness check: Postgres unreachable');
        }

        try {
          const pong = await redis.ping();
          checks.redis = pong === 'PONG';
        } catch (err) {
          app.log.error({ err }, 'Readiness check: Redis unreachable');
        }

        const ready = checks.postgres && checks.redis;

        return reply.code(ready ? 200 : 503).send({
          status: ready ? 'ready' : 'not_ready',
          checks,
        });
      },
    );
  },
  { name: 'health' },
);
