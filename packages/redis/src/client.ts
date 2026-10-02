import { Redis } from 'ioredis';

import { loadEnv } from '@reservio/config';

const env = loadEnv();

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis: Redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,

    retryStrategy(times: number) {
      return Math.min(times * 200, 2_000);
    },

    reconnectOnError(err: Error) {
      const targetErrors = ['READONLY', 'ETIMEDOUT'];
      return targetErrors.some((t) => err.message.includes(t));
    },
  });

redis.on('error', (err: Error) => {
  console.error('[redis] connection error:', err.message);
});

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}