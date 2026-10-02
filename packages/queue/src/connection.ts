import { loadEnv } from '@reservio/config';

const env = loadEnv();


export const connection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null as null,
};