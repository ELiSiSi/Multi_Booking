import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  CreateExceptionUseCase,
  DeleteExceptionUseCase,
  ListExceptionsUseCase,
  UpdateExceptionUseCase,
} from '../use-cases/index.js';

export interface AvailabilityExceptionRoutesDeps {
  createException: CreateExceptionUseCase;
  updateException: UpdateExceptionUseCase;
  deleteException: DeleteExceptionUseCase;
  listExceptions: ListExceptionsUseCase;
}

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

const exceptionParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'resourceId', 'exceptionId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    resourceId: { type: 'string', format: 'uuid' },
    exceptionId: { type: 'string', format: 'uuid' },
  },
} as const;

const createExceptionBodySchema = {
  type: 'object',
  required: ['date', 'type'],
  additionalProperties: false,
  properties: {
    date: { type: 'string', minLength: 10, maxLength: 10 },
    type: { type: 'string', enum: ['CLOSED', 'CUSTOM_HOURS', 'BREAK'] },
    startTime: { type: ['string', 'null'], minLength: 5, maxLength: 5 },
    endTime: { type: ['string', 'null'], minLength: 5, maxLength: 5 },
    reason: { type: ['string', 'null'], maxLength: 500 },
  },
} as const;

const updateExceptionBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    type: { type: 'string', enum: ['CLOSED', 'CUSTOM_HOURS', 'BREAK'] },
    startTime: { type: ['string', 'null'], minLength: 5, maxLength: 5 },
    endTime: { type: ['string', 'null'], minLength: 5, maxLength: 5 },
    reason: { type: ['string', 'null'], maxLength: 500 },
  },
} as const;

interface ResourceParams {
  businessId: string;
  locationId: string;
  resourceId: string;
}

interface ExceptionParams {
  businessId: string;
  locationId: string;
  resourceId: string;
  exceptionId: string;
}

interface CreateExceptionBody {
  date: string;
  type: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

interface UpdateExceptionBody {
  type?: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export function buildAvailabilityExceptionRoutes(
  deps: AvailabilityExceptionRoutesDeps,
): FastifyPluginAsync {
  return async function availabilityExceptionRoutes(
    app: FastifyInstance,
  ): Promise<void> {
    app.post<{ Body: CreateExceptionBody; Params: ResourceParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-exceptions',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: resourceParamsSchema,
          body: createExceptionBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.createException.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          date: body.date,
          type: body.type,
          ...(body.startTime !== undefined && { startTime: body.startTime }),
          ...(body.endTime !== undefined && { endTime: body.endTime }),
          ...(body.reason !== undefined && { reason: body.reason }),
        });

        reply.code(201).send({ data: result.exception });
      },
    );

    app.get<{ Params: ResourceParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-exceptions',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: resourceParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.listExceptions.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
        });

        reply.code(200).send({ data: result.items });
      },
    );

    app.patch<{ Body: UpdateExceptionBody; Params: ExceptionParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-exceptions/:exceptionId',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: exceptionParamsSchema,
          body: updateExceptionBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.updateException.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          exceptionId: params.exceptionId,
          ...(body.type !== undefined && { type: body.type }),
          ...(body.startTime !== undefined && { startTime: body.startTime }),
          ...(body.endTime !== undefined && { endTime: body.endTime }),
          ...(body.reason !== undefined && { reason: body.reason }),
        });

        reply.code(200).send({ data: result.exception });
      },
    );

    app.delete<{ Params: ExceptionParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-exceptions/:exceptionId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: exceptionParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        await deps.deleteException.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          exceptionId: params.exceptionId,
        });

        reply.code(204).send();
      },
    );
  };
}