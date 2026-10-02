import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';

import { loadEnv } from '@reservio/config';

const env = loadEnv();

export default fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Reservio API',
          description:
            'Multi-business booking platform — Backend Engineering Assessment.',
          version: '0.1.0',
        },
        servers: [
          {
            url: `http://localhost:${env.API_PORT}`,
            description: 'Local development',
          },
        ],
        tags: [
          { name: 'health', description: 'Health and readiness checks' },
          { name: 'auth', description: 'Authentication and session management' },
          { name: 'businesses', description: 'Business management' },
          { name: 'locations', description: 'Location management' },
          { name: 'services', description: 'Service catalog' },
          { name: 'resources', description: 'Bookable resources' },
          { name: 'availability', description: 'Availability and slot lookup' },
          { name: 'bookings', description: 'Booking lifecycle' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
      staticCSP: true,
    });
  },
  { name: 'swagger' },
);
