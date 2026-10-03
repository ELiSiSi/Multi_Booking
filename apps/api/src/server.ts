import { loadEnv } from '@reservio/config';
import { prisma } from '@reservio/database';
import { redis } from '@reservio/redis';

import { buildApp } from './app.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  
  try {
    await app.listen({
      port: env.API_PORT,
      host: env.API_HOST,
    });

    app.log.info(
      `API listening on http://${env.API_HOST}:${env.API_PORT}`,
    );
    app.log.info(`Swagger UI: http://localhost:${env.API_PORT}/docs`);
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }

  
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      app.log.warn(`Received ${signal} again, ignoring`);
      return;
    }
    shuttingDown = true;

    app.log.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await app.close();
      app.log.info('HTTP server closed');

      await prisma.$disconnect();
      app.log.info('Postgres disconnected');

      await redis.quit();
      app.log.info('Redis disconnected');

      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    app.log.error({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

void main();
