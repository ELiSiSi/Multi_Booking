import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  AssignResourceUseCase,
  ListServiceResourcesUseCase,
  UnassignResourceUseCase,
} from '../use-cases/index.js';

export interface ServiceResourceRoutesDeps {
  assignResource: AssignResourceUseCase;
  unassignResource: UnassignResourceUseCase;
  listServiceResources: ListServiceResourcesUseCase;
}

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

const assignmentParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'serviceId', 'resourceId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    serviceId: { type: 'string', format: 'uuid' },
    resourceId: { type: 'string', format: 'uuid' },
  },
} as const;

interface ServiceParams {
  businessId: string;
  locationId: string;
  serviceId: string;
}

interface AssignmentParams {
  businessId: string;
  locationId: string;
  serviceId: string;
  resourceId: string;
}

export function buildServiceResourceRoutes(
  deps: ServiceResourceRoutesDeps,
): FastifyPluginAsync {
  return async function serviceResourceRoutes(
    app: FastifyInstance,
  ): Promise<void> {
    app.post<{ Params: AssignmentParams }>(
      '/businesses/:businessId/locations/:locationId/services/:serviceId/resources/:resourceId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: assignmentParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.assignResource.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          serviceId: params.serviceId,
          resourceId: params.resourceId,
        });

        reply.code(201).send({ data: result.assignment });
      },
    );

    app.delete<{ Params: AssignmentParams }>(
      '/businesses/:businessId/locations/:locationId/services/:serviceId/resources/:resourceId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: assignmentParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        await deps.unassignResource.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          serviceId: params.serviceId,
          resourceId: params.resourceId,
        });

        reply.code(204).send();
      },
    );

    app.get<{ Params: ServiceParams }>(
      '/businesses/:businessId/locations/:locationId/services/:serviceId/resources',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: serviceParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.listServiceResources.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          serviceId: params.serviceId,
        });

        reply.code(200).send({ data: result.items });
      },
    );
  };
}