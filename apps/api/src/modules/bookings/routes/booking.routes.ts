import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@reservio/database';
import type { TransitionBookingUseCase } from '@reservio/booking-core';

import type { AvailabilityCache } from '../../availability/repositories/availability-cache.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { BookingRepository } from '../repositories/booking.repository.js';
import type {
  CreateBookingUseCase,
  GetBookingUseCase,
  IdempotencyService,
  ListBusinessBookingsUseCase,
  ListMyBookingsUseCase,
} from '../use-cases/index.js';
import { BookingNotFoundError } from '../use-cases/booking.errors.js';

export interface BookingRoutesDeps {
  createBooking: CreateBookingUseCase;
  transitionBooking: TransitionBookingUseCase;
  getBooking: GetBookingUseCase;
  listMyBookings: ListMyBookingsUseCase;
  listBusinessBookings: ListBusinessBookingsUseCase;
  idempotency: IdempotencyService;
  availabilityCache: AvailabilityCache;
  bookingRepository: BookingRepository;
  businessRepository: BusinessRepository;
}

const bookingIdParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

const businessIdParamsSchema = {
  type: 'object',
  required: ['businessId'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
  },
} as const;

const createBookingBodySchema = {
  type: 'object',
  required: ['businessId', 'locationId', 'resourceId', 'serviceId', 'startAt'],
  additionalProperties: false,
  properties: {
    businessId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    resourceId: { type: 'string', format: 'uuid' },
    serviceId: { type: 'string', format: 'uuid' },
    startAt: { type: 'string', minLength: 20, maxLength: 40 },
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

const cancelBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string', maxLength: 500 },
  },
} as const;

interface BookingIdParams {
  id: string;
}

interface BusinessIdParams {
  businessId: string;
}

interface CreateBookingBody {
  businessId: string;
  locationId: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
}

interface ListQuery {
  cursor?: string;
  limit?: string;
}

interface CancelBody {
  reason?: string;
}

async function assertCanTransition(
  deps: BookingRoutesDeps,
  actorId: string,
  actorRole: 'admin' | 'customer',
  bookingId: string,
): Promise<void> {
  if (actorRole !== 'admin') return;

  const booking = await deps.bookingRepository.findById(bookingId);
  if (!booking) {
    throw new BookingNotFoundError(bookingId);
  }

  const business = await deps.businessRepository.findByIdAndOwner(
    booking.businessId,
    actorId,
  );

  if (!business) {
    throw new BookingNotFoundError(bookingId);
  }
}

export function buildBookingRoutes(deps: BookingRoutesDeps): FastifyPluginAsync {
  return async function bookingRoutes(app: FastifyInstance): Promise<void> {
    // ─── POST /bookings ─────────────────────────────────────
    app.post<{ Body: CreateBookingBody }>(
      '/bookings',
      {
        onRequest: [app.authenticate],
        schema: { body: createBookingBodySchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const body = request.body;
        const idempotencyKey = request.headers['idempotency-key'];

        const handler = async (
          tx: Prisma.TransactionClient,
        ): Promise<{ statusCode: number; body: unknown }> => {
          const result = await deps.createBooking.execute(
            {
              actorId: actor.userId,
              businessId: body.businessId,
              locationId: body.locationId,
              resourceId: body.resourceId,
              serviceId: body.serviceId,
              startAt: body.startAt,
            },
            tx,
          );
          return { statusCode: 201, body: { data: result.booking } };
        };

        if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
          const replay = await deps.idempotency.execute({
            actorId: actor.userId,
            idempotencyKey,
            endpoint: 'POST /bookings',
            requestBody: body,
            handler,
          });

          await deps.availabilityCache.invalidateForResource(body.resourceId);
          reply.code(replay.statusCode).send(replay.body);
          return;
        }

        const fresh = await deps.createBooking.execute({
          actorId: actor.userId,
          businessId: body.businessId,
          locationId: body.locationId,
          resourceId: body.resourceId,
          serviceId: body.serviceId,
          startAt: body.startAt,
        });
        await deps.availabilityCache.invalidateForResource(body.resourceId);
        reply.code(201).send({ data: fresh.booking });
      },
    );

    // ─── GET /bookings/mine ─────────────────────────────────
    app.get<{ Querystring: ListQuery }>(
      '/bookings/mine',
      {
        onRequest: [app.authenticate],
        schema: { querystring: listQuerySchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const query = request.query;

        const result = await deps.listMyBookings.execute({
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

    // ─── GET /businesses/:businessId/bookings ───────────────
    app.get<{ Params: BusinessIdParams; Querystring: ListQuery }>(
      '/businesses/:businessId/bookings',
      {
        onRequest: [app.requireRole('admin')],
        schema: {
          params: businessIdParamsSchema,
          querystring: listQuerySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const query = request.query;

        const result = await deps.listBusinessBookings.execute({
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

    // ─── GET /bookings/:id ──────────────────────────────────
    app.get<{ Params: BookingIdParams }>(
      '/bookings/:id',
      {
        onRequest: [app.authenticate],
        schema: { params: bookingIdParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        const result = await deps.getBooking.execute({
          actorId: actor.userId,
          actorRole: actor.role,
          bookingId: params.id,
        });

        reply.code(200).send({ data: result.booking });
      },
    );

    // ─── POST /bookings/:id/confirm ─────────────────────────
    app.post<{ Params: BookingIdParams }>(
      '/bookings/:id/confirm',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: bookingIdParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        await assertCanTransition(deps, actor.userId, actor.role, params.id);

        const result = await deps.transitionBooking.execute({
          bookingId: params.id,
          actor: { userId: actor.userId, role: actor.role },
          to: 'confirmed',
        });

        await deps.availabilityCache.invalidateForResource(
          result.booking.resourceId,
        );
        reply.code(200).send({ data: result.booking });
      },
    );

    // ─── POST /bookings/:id/cancel ──────────────────────────
    app.post<{ Body: CancelBody; Params: BookingIdParams }>(
      '/bookings/:id/cancel',
      {
        onRequest: [app.authenticate],
        schema: {
          params: bookingIdParamsSchema,
          body: cancelBodySchema,
        },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;
        const body = request.body;

        await assertCanTransition(deps, actor.userId, actor.role, params.id);

        const result = await deps.transitionBooking.execute({
          bookingId: params.id,
          actor: { userId: actor.userId, role: actor.role },
          to: 'cancelled',
          ...(body.reason !== undefined && {
            cancellationReason: body.reason,
          }),
        });

        await deps.availabilityCache.invalidateForResource(
          result.booking.resourceId,
        );
        reply.code(200).send({ data: result.booking });
      },
    );

    // ─── POST /bookings/:id/complete ────────────────────────
    app.post<{ Params: BookingIdParams }>(
      '/bookings/:id/complete',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: bookingIdParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        await assertCanTransition(deps, actor.userId, actor.role, params.id);

        const result = await deps.transitionBooking.execute({
          bookingId: params.id,
          actor: { userId: actor.userId, role: actor.role },
          to: 'completed',
        });

        await deps.availabilityCache.invalidateForResource(
          result.booking.resourceId,
        );
        reply.code(200).send({ data: result.booking });
      },
    );

    // ─── POST /bookings/:id/no-show ─────────────────────────
    app.post<{ Params: BookingIdParams }>(
      '/bookings/:id/no-show',
      {
        onRequest: [app.requireRole('admin')],
        schema: { params: bookingIdParamsSchema },
      },
      async (request, reply) => {
        const actor = request.actor;
        const params = request.params;

        await assertCanTransition(deps, actor.userId, actor.role, params.id);

        const result = await deps.transitionBooking.execute({
          bookingId: params.id,
          actor: { userId: actor.userId, role: actor.role },
          to: 'no_show',
        });

        await deps.availabilityCache.invalidateForResource(
          result.booking.resourceId,
        );
        reply.code(200).send({ data: result.booking });
      },
    );
  };
}