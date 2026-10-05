import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  CreateResourceUseCase,
  GetResourceUseCase,
  ListResourcesUseCase,
  UpdateResourceUseCase,
} from '../use-cases/index.js';

export interface ResourceRoutesDeps {
  createResource: CreateResourceUseCase;
  updateResource: UpdateResourceUseCase;
  getResource: GetResourceUseCase;
  listResources: ListResourcesUseCase;
}

const locationParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
  },
} as const;

const resourceParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'resourceId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    resourceId: { type: 'string', format: 'uuid' },
  },
} as const;

const createResourceBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    bufferMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
  },
} as const;

const updateResourceBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    bufferMinutes: { type: ['integer', 'null'], minimum: 0, maximum: 1440 },
    isActive: { type: 'boolean' },
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

interface LocationParams {
  businessId: string;
  locationId: string;
}

interface ResourceParams {
  businessId: string;
  locationId: string;
  resourceId: string;
}

interface CreateResourceBody {
  name: string;
  bufferMinutes?: number;
}

interface UpdateResourceBody {
  name?: string;
  bufferMinutes?: number | null;
  isActive?: boolean;
}

interface ListQuery {
  cursor?: string;
  limit?: string;
}

export function buildResourceRoutes(
  deps: ResourceRoutesDeps,
): FastifyPluginAsync {
  return async function resourceRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: CreateResourceBody; Params: LocationParams }>(
      '/businesses/:businessId/locations/:locationId/resources',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: locationParamsSchema,
          body: createResourceBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.createResource.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          name: body.name,
          ...(body.bufferMinutes !== undefined && {
            bufferMinutes: body.bufferMinutes,
          }),
        });

        reply.code(201).send({ data: result.resource });
      },
    );

    app.get<{ Params: LocationParams; Querystring: ListQuery }>(
      '/businesses/:businessId/locations/:locationId/resources',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: locationParamsSchema,
          querystring: listQuerySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const query = request.query;

        const result = await deps.listResources.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          ...(query.cursor !== undefined && { cursor: query.cursor }),
          ...(query.limit !== undefined && { limit: Number(query.limit) }),
        });

        reply.code(200).send({
          data: result.items,
          meta: { nextCursor: result.nextCursor },
        });
      },
    );

    app.get<{ Params: ResourceParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: resourceParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.getResource.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
        });

        reply.code(200).send({ data: result.resource });
      },
    );

    app.patch<{ Body: UpdateResourceBody; Params: ResourceParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: resourceParamsSchema,
          body: updateResourceBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.updateResource.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          ...(body.name !== undefined && { name: body.name }),
          ...(body.bufferMinutes !== undefined && {
            bufferMinutes: body.bufferMinutes,
          }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        });

        reply.code(200).send({ data: result.resource });
      },
    );
  };
}