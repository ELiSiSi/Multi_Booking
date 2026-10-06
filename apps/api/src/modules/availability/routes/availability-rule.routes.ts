import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type {
  CreateRuleUseCase,
  DeleteRuleUseCase,
  ListRulesUseCase,
  UpdateRuleUseCase,
} from '../use-cases/index.js';

export interface AvailabilityRuleRoutesDeps {
  createRule: CreateRuleUseCase;
  updateRule: UpdateRuleUseCase;
  deleteRule: DeleteRuleUseCase;
  listRules: ListRulesUseCase;
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

const ruleParamsSchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'resourceId', 'ruleId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    resourceId: { type: 'string', format: 'uuid' },
    ruleId: { type: 'string', format: 'uuid' },
  },
} as const;

const createRuleBodySchema = {
  type: 'object',
  required: ['weekday', 'type', 'startTime', 'endTime'],
  additionalProperties: false,
  properties: {
    weekday: { type: 'integer', minimum: 1, maximum: 7 },
    type: { type: 'string', enum: ['OPEN', 'BREAK'] },
    startTime: { type: 'string', minLength: 5, maxLength: 5 },
    endTime: { type: 'string', minLength: 5, maxLength: 5 },
    effectiveFrom: { type: ['string', 'null'], minLength: 10, maxLength: 10 },
    effectiveTo: { type: ['string', 'null'], minLength: 10, maxLength: 10 },
  },
} as const;

const updateRuleBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    weekday: { type: 'integer', minimum: 1, maximum: 7 },
    type: { type: 'string', enum: ['OPEN', 'BREAK'] },
    startTime: { type: 'string', minLength: 5, maxLength: 5 },
    endTime: { type: 'string', minLength: 5, maxLength: 5 },
    effectiveFrom: { type: ['string', 'null'], minLength: 10, maxLength: 10 },
    effectiveTo: { type: ['string', 'null'], minLength: 10, maxLength: 10 },
  },
} as const;

interface ResourceParams {
  businessId: string;
  locationId: string;
  resourceId: string;
}

interface RuleParams {
  businessId: string;
  locationId: string;
  resourceId: string;
  ruleId: string;
}

interface CreateRuleBody {
  weekday: number;
  type: 'OPEN' | 'BREAK';
  startTime: string;
  endTime: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

interface UpdateRuleBody {
  weekday?: number;
  type?: 'OPEN' | 'BREAK';
  startTime?: string;
  endTime?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export function buildAvailabilityRuleRoutes(
  deps: AvailabilityRuleRoutesDeps,
): FastifyPluginAsync {
  return async function availabilityRuleRoutes(
    app: FastifyInstance,
  ): Promise<void> {
    app.post<{ Body: CreateRuleBody; Params: ResourceParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-rules',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: resourceParamsSchema,
          body: createRuleBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.createRule.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          weekday: body.weekday,
          type: body.type,
          startTime: body.startTime,
          endTime: body.endTime,
          ...(body.effectiveFrom !== undefined && {
            effectiveFrom: body.effectiveFrom,
          }),
          ...(body.effectiveTo !== undefined && {
            effectiveTo: body.effectiveTo,
          }),
        });

        reply.code(201).send({ data: result.rule });
      },
    );

    app.get<{ Params: ResourceParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-rules',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: resourceParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.listRules.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
        });

        reply.code(200).send({ data: result.items });
      },
    );

    app.patch<{ Body: UpdateRuleBody; Params: RuleParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-rules/:ruleId',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: ruleParamsSchema,
          body: updateRuleBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        const result = await deps.updateRule.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          ruleId: params.ruleId,
          ...(body.weekday !== undefined && { weekday: body.weekday }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.startTime !== undefined && { startTime: body.startTime }),
          ...(body.endTime !== undefined && { endTime: body.endTime }),
          ...(body.effectiveFrom !== undefined && {
            effectiveFrom: body.effectiveFrom,
          }),
          ...(body.effectiveTo !== undefined && {
            effectiveTo: body.effectiveTo,
          }),
        });

        reply.code(200).send({ data: result.rule });
      },
    );

    app.delete<{ Params: RuleParams }>(
      '/businesses/:businessId/locations/:locationId/resources/:resourceId/availability-rules/:ruleId',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: ruleParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        await deps.deleteRule.execute({
          actorId: actor.userId,
          businessId: params.businessId,
          locationId: params.locationId,
          resourceId: params.resourceId,
          ruleId: params.ruleId,
        });

        reply.code(204).send();
      },
    );
  };
}