import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  CreateLocationUseCase,
  GetLocationUseCase,
  ListLocationsUseCase,
  UpdateLocationUseCase,
} from '../use-cases/index.js';

export interface LocationRoutesDeps {
  createLocation: CreateLocationUseCase;
  updateLocation: UpdateLocationUseCase;
  getLocation: GetLocationUseCase;
  listLocations: ListLocationsUseCase;
}

const businessParamsSchema = {
  type: 'object',
  required: ['businessId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
  },
} as const;

const locationParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
  },
} as const;

const createLocationBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    timezone: { type: 'string', maxLength: 64 },
    address: { type: 'string', maxLength: 500 },
  },
} as const;

const updateLocationBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    timezone: { type: ['string', 'null'], maxLength: 64 },
    address: { type: ['string', 'null'], maxLength: 500 },
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

interface BusinessParams {
  businessId: string;
}

interface LocationParams {
  businessId: string;
  locationId: string;
}

interface CreateLocationBody {
  name: string;
  timezone?: string;
  address?: string;
}

interface UpdateLocationBody {
  name?: string;
  timezone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

interface ListQuery {
  cursor?: string;
  limit?: string;
}

export function buildLocationRoutes(
  deps: LocationRoutesDeps,
): FastifyPluginAsync {
  return async function locationRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: CreateLocationBody; Params: BusinessParams }>(
      '/businesses/:businessId/locations',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: businessParamsSchema,
          body: createLocationBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.createLocation.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          name: body.name,
          ...(body.timezone !== undefined && { timezone: body.timezone }),
          ...(body.address !== undefined && { address: body.address }),
        });

        reply.code(201).send({ data: result.location });
      },
    );

    app.get<{ Params: BusinessParams; Querystring: ListQuery }>(
      '/businesses/:businessId/locations',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: businessParamsSchema,
          querystring: listQuerySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const query = request.query;

        const result = await deps.listLocations.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          ...(query.cursor !== undefined && { cursor: query.cursor }),
          ...(query.limit !== undefined && { limit: Number(query.limit) }),
        });

        reply.code(200).send({
          data: result.items,
          meta: { nextCursor: result.nextCursor },
        });
      },
    );

    app.get<{ Params: LocationParams }>(
      '/businesses/:businessId/locations/:locationId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: locationParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.getLocation.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
        });

        reply.code(200).send({ data: result.location });
      },
    );

    app.patch<{ Body: UpdateLocationBody; Params: LocationParams }>(
      '/businesses/:businessId/locations/:locationId',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: locationParamsSchema,
          body: updateLocationBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.updateLocation.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          ...(body.name !== undefined && { name: body.name }),
          ...(body.timezone !== undefined && { timezone: body.timezone }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        });

        reply.code(200).send({ data: result.location });
      },
    );
  };
}