import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  CreateServiceUseCase,
  GetServiceUseCase,
  ListServicesUseCase,
  UpdateServiceUseCase,
} from '../use-cases/index.js';

export interface ServiceRoutesDeps {
  createService: CreateServiceUseCase;
  updateService: UpdateServiceUseCase;
  getService: GetServiceUseCase;
  listServices: ListServicesUseCase;
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

const serviceParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'serviceId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    serviceId: { type: 'string', format: 'uuid' },
  },
} as const;

const createServiceBodySchema = {
  type: 'object',
  required: ['name', 'durationMinutes', 'priceCents'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    priceCents: { type: 'integer', minimum: 0, maximum: 100_000_000 },
    currency: {
      type: 'string',
      minLength: 3,
      maxLength: 3,
      pattern: '^[A-Za-z]{3}$',
    },
  },
} as const;

const updateServiceBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    priceCents: { type: 'integer', minimum: 0, maximum: 100_000_000 },
    currency: {
      type: 'string',
      minLength: 3,
      maxLength: 3,
      pattern: '^[A-Za-z]{3}$',
    },
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

interface ServiceParams {
  businessId: string;
  locationId: string;
  serviceId: string;
}

interface CreateServiceBody {
  name: string;
  durationMinutes: number;
  priceCents: number;
  currency?: string;
}

interface UpdateServiceBody {
  name?: string;
  durationMinutes?: number;
  priceCents?: number;
  currency?: string;
  isActive?: boolean;
}

interface ListQuery {
  cursor?: string;
  limit?: string;
}

export function buildServiceRoutes(
  deps: ServiceRoutesDeps,
): FastifyPluginAsync {
  return async function serviceRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: CreateServiceBody; Params: LocationParams }>(
      '/businesses/:businessId/locations/:locationId/services',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: locationParamsSchema,
          body: createServiceBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.createService.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          name: body.name,
          durationMinutes: body.durationMinutes,
          priceCents: body.priceCents,
          ...(body.currency !== undefined && { currency: body.currency }),
        });

        reply.code(201).send({ data: result.service });
      },
    );

    app.get<{ Params: LocationParams; Querystring: ListQuery }>(
      '/businesses/:businessId/locations/:locationId/services',
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

        const result = await deps.listServices.execute({
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

    app.get<{ Params: ServiceParams }>(
      '/businesses/:businessId/locations/:locationId/services/:serviceId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: serviceParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.getService.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          serviceId: params.serviceId,
        });

        reply.code(200).send({ data: result.service });
      },
    );

    app.patch<{ Body: UpdateServiceBody; Params: ServiceParams }>(
      '/businesses/:businessId/locations/:locationId/services/:serviceId',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: serviceParamsSchema,
          body: updateServiceBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.updateService.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          serviceId: params.serviceId,
          ...(body.name !== undefined && { name: body.name }),
          ...(body.durationMinutes !== undefined && {
            durationMinutes: body.durationMinutes,
          }),
          ...(body.priceCents !== undefined && {
            priceCents: body.priceCents,
          }),
          ...(body.currency !== undefined && { currency: body.currency }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        });

        reply.code(200).send({ data: result.service });
      },
    );
  };
}