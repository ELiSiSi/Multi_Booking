import { config } from 'dotenv';
import { resolve } from 'node:path';

config({
  path: resolve(process.cwd(), '.env'),
});

// Use Redis DB 1 for tests to isolate them from the running worker
// container (which uses DB 0). Without this, the worker picks up
// test jobs before assertions can run.
if (process.env.REDIS_URL) {
  const base = process.env.REDIS_URL.replace(/\/\d+$/, '');
  process.env.REDIS_URL = `${base}/1`;
}
