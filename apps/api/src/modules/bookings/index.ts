import type { FastifyInstance } from 'fastify';

import { AvailabilityCache } from '../availability/repositories/availability-cache.js';
import { AvailabilityRepository } from '../availability/repositories/availability.repository.js';
import { BusinessRepository } from '../catalog/repositories/business.repository.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { BookingRepository } from './repositories/booking.repository.js';
import { IdempotencyRepository } from './repositories/idempotency.repository.js';
import { buildBookingRoutes } from './routes/booking.routes.js';
import {
  CreateBookingUseCase,
  GetBookingUseCase,
  IdempotencyService,
  ListBusinessBookingsUseCase,
  ListMyBookingsUseCase,
  TransitionBookingUseCase,
} from './use-cases/index.js';

export async function registerBookingModule(
  app: FastifyInstance,
): Promise<void> {
  const bookingRepository = new BookingRepository();
  const auditRepository = new AuditRepository();
  const idempotencyRepository = new IdempotencyRepository();
  const businessRepository = new BusinessRepository();
  const availabilityCache = new AvailabilityCache();
  const availabilityRepository = new AvailabilityRepository();

  const createBooking = new CreateBookingUseCase(availabilityRepository);

  const transitionBooking = new TransitionBookingUseCase(
    bookingRepository,
    auditRepository,
    businessRepository,
  );

  const getBooking = new GetBookingUseCase(
    bookingRepository,
    businessRepository,
  );

  const listMyBookings = new ListMyBookingsUseCase(bookingRepository);

  const listBusinessBookings = new ListBusinessBookingsUseCase(
    businessRepository,
    bookingRepository,
  );

  const idempotency = new IdempotencyService(idempotencyRepository);

  await app.register(
    buildBookingRoutes({
      createBooking,
      transitionBooking,
      getBooking,
      listMyBookings,
      listBusinessBookings,
      idempotency,
      availabilityCache,
    }),
  );
}