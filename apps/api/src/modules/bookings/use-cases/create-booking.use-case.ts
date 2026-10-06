import { DateTime } from 'luxon';
import { prisma, Prisma, type Booking } from '@reservio/database';

import { generateSlots } from '../../availability/domain/slot-engine.js';
import type { SlotEngineInput } from '../../availability/domain/types.js';
import type { AvailabilityRepository } from '../../availability/repositories/availability.repository.js';
import { advisoryLockIdFromResource } from './_lock.js';
import {
  BookingContextNotFoundError,
  InvalidBookingTimeError,
  ServiceResourceNotAssignedError,
  SlotUnavailableError,
  StartInPastError,
} from './booking.errors.js';

export interface CreateBookingInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
}

export interface CreateBookingOutput {
  booking: Booking;
}

function isExclusionViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const e = error as {
    code?: string;
    message?: string;
    meta?: { code?: string; message?: string };
  };

  if (e.code === '23P01') return true;
  if (e.meta?.code === '23P01') return true;

  const parts = [e.message, e.meta?.message, String(error)].filter(
    (v): v is string => typeof v === 'string',
  );

  return parts.some(
    (p) =>
      p.includes('23P01') ||
      p.includes('Booking_no_overlap_active') ||
      p.includes('exclusion constraint'),
  );
}

function resolveTimezone(
  locationTimezone: string | null,
  businessTimezone: string,
): string {
  if (locationTimezone && locationTimezone.length > 0) {
    return locationTimezone;
  }
  return businessTimezone;
}

export class CreateBookingUseCase {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
  ) {}

  async execute(
    input: CreateBookingInput,
    externalTx?: Prisma.TransactionClient,
  ): Promise<CreateBookingOutput> {
    const runAll = async (
      tx: Prisma.TransactionClient,
    ): Promise<Booking> => {
      const startAt = new Date(input.startAt);
      if (Number.isNaN(startAt.getTime())) {
        throw new InvalidBookingTimeError(
          `Invalid startAt ISO string: "${input.startAt}"`,
        );
      }

      if (startAt.getTime() <= Date.now()) {
        throw new StartInPastError();
      }

      // Pre-load using the SAME tx to avoid exhausting the pool.
      const context = await this.availabilityRepository.loadCatalogContext(
        input.businessId,
        input.locationId,
        input.resourceId,
        input.serviceId,
        tx,
      );

      if (!context) {
        throw new BookingContextNotFoundError();
      }

      const timezone = resolveTimezone(
        context.location.timezone,
        context.business.timezone,
      );

      const localDate = DateTime.fromJSDate(startAt, { zone: 'utc' })
        .setZone(timezone)
        .toISODate();

      if (!localDate) {
        throw new InvalidBookingTimeError('Could not resolve local date');
      }

      const dayStart = DateTime.fromISO(localDate, { zone: timezone })
        .startOf('day')
        .toUTC()
        .toJSDate();
      const dayEnd = DateTime.fromISO(localDate, { zone: timezone })
        .endOf('day')
        .toUTC()
        .toJSDate();

      const rules = await this.availabilityRepository.loadRules(
        context.resource.id,
        tx,
      );
      const exceptions = await this.availabilityRepository.loadExceptions(
        context.resource.id,
        localDate,
        tx,
      );
      const activeBookings =
        await this.availabilityRepository.loadActiveBookings(
          context.resource.id,
          dayStart,
          dayEnd,
          tx,
        );

      const engineInput: SlotEngineInput = {
        timezone,
        date: localDate,
        service: {
          id: context.service.id,
          durationMinutes: context.service.durationMinutes,
        },
        resource: {
          id: context.resource.id,
          bufferMinutes: context.resource.bufferMinutes,
        },
        business: {
          id: context.business.id,
          slotGranularityMinutes: context.business.slotGranularityMinutes,
          defaultBufferMinutes: context.business.defaultBufferMinutes,
        },
        rules,
        exceptions,
        bookings: activeBookings,
      };

      const slots = generateSlots(engineInput);
      const requestedTime = startAt.getTime();
      const isAvailable = slots.some(
        (s) => s.startAt.getTime() === requestedTime,
      );

      if (!isAvailable) {
        throw new SlotUnavailableError();
      }

      // Advisory lock — scoped to the tx.
      const lockId = advisoryLockIdFromResource(input.resourceId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;

      // Re-fetch context using tx (post-lock) to guarantee consistency.
      const location = await tx.location.findFirst({
        where: { id: input.locationId, businessId: input.businessId },
        include: { business: true },
      });
      if (!location) {
        throw new BookingContextNotFoundError();
      }

      const resource = await tx.resource.findFirst({
        where: { id: input.resourceId, locationId: location.id },
      });
      if (!resource || !resource.isActive) {
        throw new BookingContextNotFoundError();
      }

      const service = await tx.service.findFirst({
        where: { id: input.serviceId, locationId: location.id },
      });
      if (!service || !service.isActive) {
        throw new BookingContextNotFoundError();
      }

      const assignment = await tx.serviceResource.findUnique({
        where: {
          serviceId_resourceId: {
            serviceId: service.id,
            resourceId: resource.id,
          },
        },
      });
      if (!assignment) {
        throw new ServiceResourceNotAssignedError();
      }

      const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
      );
      const bufferMinutes =
        resource.bufferMinutes ?? location.business.defaultBufferMinutes;

      return tx.booking.create({
        data: {
          businessId: location.business.id,
          locationId: location.id,
          resourceId: resource.id,
          serviceId: service.id,
          customerId: input.actorId,
          startAt,
          endAt,
          durationMinutes: service.durationMinutes,
          bufferMinutes,
          priceCents: service.priceCents,
          currency: service.currency,
        },
      });
    };

    try {
      if (externalTx) {
        const booking = await runAll(externalTx);
        return { booking };
      }

      const booking = await prisma.$transaction(runAll);
      return { booking };
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new SlotUnavailableError();
      }
      throw error;
    }
  }
}