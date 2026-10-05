import type { FastifyInstance } from 'fastify';

import { AvailabilityCache } from './repositories/availability-cache.js';
import { AvailabilityRepository } from './repositories/availability.repository.js';
import { buildAvailabilityRoutes } from './routes/availability.routes.js';
import { GetAvailabilityUseCase } from './use-cases/get-availability.use-case.js';

export async function registerAvailabilityModule(
  app: FastifyInstance,
): Promise<void> {
  const availabilityRepository = new AvailabilityRepository();
  const availabilityCache = new AvailabilityCache();

  const getAvailability = new GetAvailabilityUseCase(
    availabilityRepository,
    availabilityCache,
  );

  await app.register(
    buildAvailabilityRoutes({
      getAvailability,
    }),
  );
}