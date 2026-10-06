import type { FastifyInstance } from 'fastify';

import {
  BusinessRepository,
  LocationRepository,
  ResourceRepository,
} from '../catalog/repositories/index.js';
import { AvailabilityCache } from './repositories/availability-cache.js';
import { AvailabilityExceptionRepository } from './repositories/availability-exception.repository.js';
import { AvailabilityRepository } from './repositories/availability.repository.js';
import { AvailabilityRuleRepository } from './repositories/availability-rule.repository.js';
import { buildAvailabilityExceptionRoutes } from './routes/availability-exception.routes.js';
import { buildAvailabilityRuleRoutes } from './routes/availability-rule.routes.js';
import { buildAvailabilityRoutes } from './routes/availability.routes.js';
import {
  CreateExceptionUseCase,
  CreateRuleUseCase,
  DeleteExceptionUseCase,
  DeleteRuleUseCase,
  GetAvailabilityUseCase,
  ListExceptionsUseCase,
  ListRulesUseCase,
  UpdateExceptionUseCase,
  UpdateRuleUseCase,
} from './use-cases/index.js';

export async function registerAvailabilityModule(
  app: FastifyInstance,
): Promise<void> {
  // ─── Repositories ────────────────────────────────────────────
  const businessRepository = new BusinessRepository();
  const locationRepository = new LocationRepository();
  const resourceRepository = new ResourceRepository();

  const availabilityRepository = new AvailabilityRepository();
  const availabilityCache = new AvailabilityCache();
  const availabilityRuleRepository = new AvailabilityRuleRepository();
  const availabilityExceptionRepository =
    new AvailabilityExceptionRepository();

  // ─── Use cases ───────────────────────────────────────────────
  const getAvailability = new GetAvailabilityUseCase(
    availabilityRepository,
    availabilityCache,
  );

  const createRule = new CreateRuleUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityRuleRepository,
    availabilityCache,
  );

  const updateRule = new UpdateRuleUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityRuleRepository,
    availabilityCache,
  );

  const deleteRule = new DeleteRuleUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityRuleRepository,
    availabilityCache,
  );

  const listRules = new ListRulesUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityRuleRepository,
  );

  const createException = new CreateExceptionUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityExceptionRepository,
    availabilityCache,
  );

  const updateException = new UpdateExceptionUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityExceptionRepository,
    availabilityCache,
  );

  const deleteException = new DeleteExceptionUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityExceptionRepository,
    availabilityCache,
  );

  const listExceptions = new ListExceptionsUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
    availabilityExceptionRepository,
  );

  // ─── Routes ──────────────────────────────────────────────────
  await app.register(
    buildAvailabilityRoutes({
      getAvailability,
    }),
  );

  await app.register(
    buildAvailabilityRuleRoutes({
      createRule,
      updateRule,
      deleteRule,
      listRules,
    }),
  );

  await app.register(
    buildAvailabilityExceptionRoutes({
      createException,
      updateException,
      deleteException,
      listExceptions,
    }),
  );
}