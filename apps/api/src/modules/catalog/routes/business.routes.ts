import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  CreateBusinessUseCase,
  ListBusinessesUseCase,
  UpdateBusinessUseCase,
} from '../use-cases/index.js';

export interface BusinessRoutesDeps {
  createBusiness: CreateBusinessUseCase;
  updateBusiness: UpdateBusinessUseCase;
  listBusinesses: ListBusinessesUseCase;
}

const createBusinessBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    timezone: { type: 'string', minLength: 1, maxLength: 64 },
    slotGranularityMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    defaultBufferMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
    pendingTimeoutMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    cancellationWindowMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
    reminderLeadTimeMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
  },
} as const;

const updateBusinessBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    timezone: { type: 'string', minLength: 1, maxLength: 64 },
    slotGranularityMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    defaultBufferMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
    pendingTimeoutMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    cancellationWindowMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
    reminderLeadTimeMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
  },
} as const;

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', minLength: 1 },
    limit: { type: 'string', pattern: '^(?:[1-9][0-9]?|100)$' },
  },
} as const;

const businessIdParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

interface CreateBusinessBody {
  name: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
  reminderLeadTimeMinutes?: number;
}

interface UpdateBusinessBody {
  name?: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
  reminderLeadTimeMinutes?: number;
}

interface ListQuery {
  cursor?: string;
  limit?: string;
}

interface BusinessIdParams {
  id: string;
}

export function buildBusinessRoutes(
  deps: BusinessRoutesDeps,
): FastifyPluginAsync {
  return async function businessRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: CreateBusinessBody }>(
      '/businesses',
      {
        onRequest: [app.requireRole('admin')],
        schema: { body: createBusinessBodySchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const body = request.body;

        const result = await deps.createBusiness.execute({
          actorId: actor.userId,
          name: body.name,
          ...(body.timezone !== undefined && { timezone: body.timezone }),
          ...(body.slotGranularityMinutes !== undefined && {
            slotGranularityMinutes: body.slotGranularityMinutes,
          }),
          ...(body.defaultBufferMinutes !== undefined && {
            defaultBufferMinutes: body.defaultBufferMinutes,
          }),
          ...(body.pendingTimeoutMinutes !== undefined && {
            pendingTimeoutMinutes: body.pendingTimeoutMinutes,
          }),
          ...(body.cancellationWindowMinutes !== undefined && {
            cancellationWindowMinutes: body.cancellationWindowMinutes,
          }),
          ...(body.reminderLeadTimeMinutes !== undefined && {
            reminderLeadTimeMinutes: body.reminderLeadTimeMinutes,
          }),
        });

        reply.code(201).send({ data: result.business });
      },
    );

    app.patch<{ Body: UpdateBusinessBody; Params: BusinessIdParams }>(
      '/businesses/:id',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: businessIdParamsSchema,
          body: updateBusinessBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.updateBusiness.execute({
          actorId: actor.userId,
          businessId: params.id,
          ...(body.name !== undefined && { name: body.name }),
          ...(body.timezone !== undefined && { timezone: body.timezone }),
          ...(body.slotGranularityMinutes !== undefined && {
            slotGranularityMinutes: body.slotGranularityMinutes,
          }),
          ...(body.defaultBufferMinutes !== undefined && {
            defaultBufferMinutes: body.defaultBufferMinutes,
          }),
          ...(body.pendingTimeoutMinutes !== undefined && {
            pendingTimeoutMinutes: body.pendingTimeoutMinutes,
          }),
          ...(body.cancellationWindowMinutes !== undefined && {
            cancellationWindowMinutes: body.cancellationWindowMinutes,
          }),
          ...(body.reminderLeadTimeMinutes !== undefined && {
            reminderLeadTimeMinutes: body.reminderLeadTimeMinutes,
          }),
        });

        reply.code(200).send({ data: result.business });
      },
    );

    app.get<{ Querystring: ListQuery }>(
      '/businesses/mine',
      {
        onRequest: [app.authenticate],
        schema: { querystring: listQuerySchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const query = request.query;

        const result = await deps.listBusinesses.execute({
          actorId: actor.userId,
          ...(query.cursor !== undefined && { cursor: query.cursor }),
          ...(query.limit !== undefined && { limit: Number(query.limit) }),
        });

        reply.code(200).send({
          data: result.items,
          meta: { nextCursor: result.nextCursor },
        });
      },
    );
  };
}