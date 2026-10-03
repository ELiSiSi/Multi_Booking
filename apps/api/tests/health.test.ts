import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';

describe('API — health and info endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Ensure Redis is actually connected before running /ready checks.
    const { redis } = await import('@reservio/redis');
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 5_000);
        redis.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /', () => {
    it('returns service info with name, version, and docs path', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('reservio-api');
      expect(body.version).toBe('0.1.0');
      expect(body.docs).toBe('/docs');
    });

    it('returns JSON content-type', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
    });

    it('includes a valid ISO timestamp', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(body.timestamp).toBeDefined();
      const parsed = new Date(body.timestamp);
      expect(parsed.toISOString()).toBe(body.timestamp);
    });

    it('does not require database connectivity', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /ready', () => {
    it('returns ready with postgres and redis checks true', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ready');
      expect(body.checks).toBeDefined();
      expect(body.checks.postgres).toBe(true);
      expect(body.checks.redis).toBe(true);
    });

    it('returns a checks object with exactly postgres and redis keys', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      const body = res.json();
      expect(Object.keys(body.checks).sort()).toEqual(['postgres', 'redis']);
    });
  });

  describe('404 handler', () => {
    it('returns unified error shape for unknown GET route', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/this-route-does-not-exist',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('GET');
      expect(body.error.message).toContain('/this-route-does-not-exist');
    });

    it('returns 404 for unknown POST route', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/unknown-endpoint',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('POST');
    });

    it('never leaks stack traces in the 404 body', async () => {
      const res = await app.inject({ method: 'GET', url: '/nope' });
      const body = res.json();
      expect(body).not.toHaveProperty('stack');
      expect(JSON.stringify(body)).not.toMatch(/at\s+.*\.ts:/);
    });
  });

  describe('OpenAPI contract', () => {
    it('serves /docs/json with a valid OpenAPI spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(res.statusCode).toBe(200);
      const spec = res.json();
      expect(spec.openapi).toBeDefined();
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('Reservio API');
      expect(spec.info.version).toBe('0.1.0');
    });

    it('includes the health endpoints in the OpenAPI spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      const spec = res.json();
      expect(spec.paths).toBeDefined();
      expect(spec.paths['/health']).toBeDefined();
      expect(spec.paths['/ready']).toBeDefined();
      expect(spec.paths['/']).toBeDefined();
    });

    it('declares the bearer JWT security scheme', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      const spec = res.json();
      expect(spec.components).toBeDefined();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });
  });
});
