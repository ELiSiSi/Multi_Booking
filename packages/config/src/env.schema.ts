import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  REDIS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), {
      message: 'REDIS_URL must be a Redis connection string',
    }),

  ACCESS_TOKEN_PRIVATE_KEY: z.string().min(1),
  ACCESS_TOKEN_PUBLIC_KEY: z.string().min(1),
  JWT_ISSUER: z.string().default('reservio'),
  JWT_AUDIENCE: z.string().default('reservio-api'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;