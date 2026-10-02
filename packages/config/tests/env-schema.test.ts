import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/env.schema.js';

describe('envSchema', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    ACCESS_TOKEN_PRIVATE_KEY: 'private-key',
    ACCESS_TOKEN_PUBLIC_KEY: 'public-key',
  };

  it('accepts a minimal valid environment with defaults applied', () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.API_PORT).toBe(3000);
    expect(result.data.API_HOST).toBe('0.0.0.0');
    expect(result.data.JWT_ISSUER).toBe('reservio');
    expect(result.data.JWT_AUDIENCE).toBe('reservio-api');
    expect(result.data.WORKER_CONCURRENCY).toBe(5);
  });

  it('coerces numeric strings to numbers', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      API_PORT: '4000',
      WORKER_CONCURRENCY: '10',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.API_PORT).toBe(4000);
    expect(result.data.WORKER_CONCURRENCY).toBe(10);
  });

  it('rejects an invalid DATABASE_URL', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      DATABASE_URL: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid REDIS_URL', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      REDIS_URL: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...incomplete } = validEnv;
    const result = envSchema.safeParse(incomplete);

    expect(result.success).toBe(false);
  });

  it('rejects an empty ACCESS_TOKEN_PRIVATE_KEY', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      ACCESS_TOKEN_PRIVATE_KEY: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown NODE_ENV value', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'staging',
    });

    expect(result.success).toBe(false);
  });
});