import { DateTime } from 'luxon';

import { generateSlots } from '../domain/slot-engine.js';
import type {
  LocalDate,
  Slot,
  SlotEngineInput,
} from '../domain/types.js';
import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type {
  AvailabilityRepository,
  CatalogContext,
} from '../repositories/availability.repository.js';
import {
  AvailabilityContextNotFoundError,
  InvalidDateError,
} from './availability.errors.js';

export interface GetAvailabilityInput {
  businessId: string;
  locationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
}

export interface GetAvailabilityOutput {
  timezone: string;
  date: LocalDate;
  slots: Slot[];
  cached: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class GetAvailabilityUseCase {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(
    input: GetAvailabilityInput,
  ): Promise<GetAvailabilityOutput> {
    if (!DATE_RE.test(input.date)) {
      throw new InvalidDateError(input.date);
    }

    const parsed = DateTime.fromISO(input.date, { zone: 'utc' });
    if (!parsed.isValid) {
      throw new InvalidDateError(input.date);
    }

    const cached = await this.availabilityCache.get(
      input.businessId,
      input.resourceId,
      input.serviceId,
      input.date,
    );

    if (cached) {
      return {
        timezone: cached.timezone,
        date: cached.date,
        slots: cached.slots.map((s) => ({
          startAt: new Date(s.startAt),
          endAt: new Date(s.endAt),
        })),
        cached: true,
      };
    }

    const context = await this.availabilityRepository.loadCatalogContext(
      input.businessId,
      input.locationId,
      input.resourceId,
      input.serviceId,
    );

    if (!context) {
      throw new AvailabilityContextNotFoundError();
    }

    const timezone = resolveTimezone(context);

    const [rules, exceptions, activeBookings] = await Promise.all([
      this.availabilityRepository.loadRules(context.resource.id),
      this.availabilityRepository.loadExceptions(context.resource.id, input.date),
      this.availabilityRepository.loadActiveBookings(
        context.resource.id,
        parsed.startOf('day').toJSDate(),
        parsed.endOf('day').toJSDate(),
      ),
    ]);

    const engineInput: SlotEngineInput = {
      timezone,
      date: input.date,
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

    await this.availabilityCache.set(
      input.businessId,
      input.resourceId,
      input.serviceId,
      input.date,
      timezone,
      slots,
    );

    return {
      timezone,
      date: input.date,
      slots,
      cached: false,
    };
  }
}

function resolveTimezone(context: CatalogContext): string {
  if (context.location.timezone && context.location.timezone.length > 0) {
    return context.location.timezone;
  }
  return context.business.timezone;
}