import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type { GetAvailabilityUseCase } from '../use-cases/get-availability.use-case.js';

export interface AvailabilityRoutesDeps {
  getAvailability: GetAvailabilityUseCase;
}

const availabilityParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'resourceId', 'serviceId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    resourceId: { type: 'string', format: 'uuid' },
    serviceId: { type: 'string', format: 'uuid' },
  },
} as const;

const availabilityQuerySchema = {
  type: 'object',
  required: ['date'],
  additionalProperties: false,
  properties: {
    date: { type: 'string', minLength: 10, maxLength: 10 },
  },
} as const;

interface AvailabilityParams {
  businessId: string;
  locationId: string;
  resourceId: string;
  serviceId: string;
}

interface AvailabilityQuery {
  date: string;
}

export function buildAvailabilityRoutes(
  deps: AvailabilityRoutesDeps,
): FastifyPluginAsync {
  return async function availabilityRoutes(
    app: FastifyInstance,
  ): Promise<void> {
    app.get<{ Params: AvailabilityParams; Querystring: AvailabilityQuery }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/services/:serviceId/availability',
      {
        schema: {
          params: availabilityParamsSchema,
          querystring: availabilityQuerySchema,
        },
      },
      async (request, reply) => {
        const params = request.params;
        const query = request.query;

        const result = await deps.getAvailability.execute({
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          serviceId: params.serviceId,
          date: query.date,
        });

        reply.code(200).send({
          data: {
            timezone: result.timezone,
            date: result.date,
            cached: result.cached,
            slots: result.slots.map((s) => ({
              startAt: s.startAt.toISOString(),
              endAt: s.endAt.toISOString(),
            })),
          },
        });
      },
    );
  };
}