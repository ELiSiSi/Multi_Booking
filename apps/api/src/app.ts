import Fastify, { type FastifyInstance } from 'fastify';

import registerCors from './plugins/cors.js';
import registerErrorHandler from './plugins/error-handler.js';
import registerHealth from './plugins/health.js';
import registerSwagger from './plugins/swagger.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    trustProxy: false,
  });

  
  await registerCors(app);
  await registerSwagger(app);
  await registerErrorHandler(app);
  await registerHealth(app);

  
 
 
 
 

  return app;
}
