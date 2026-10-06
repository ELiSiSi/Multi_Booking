import type { AvailabilityException } from '@reservio/database';

import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type { AvailabilityExceptionRepository } from '../repositories/availability-exception.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import {
  InvalidExceptionError,
  ResourceNotFoundError,
} from './availability.errors.js';

export interface CreateExceptionInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  date: string;
  type: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export interface CreateExceptionOutput {
  exception: AvailabilityException;
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateExceptionUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityExceptionRepository: AvailabilityExceptionRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(input: CreateExceptionInput): Promise<CreateExceptionOutput> {
    const business = await this.businessRepository.findByIdAndOwner(
      input.businessId,
      input.actorId,
    );

    if (!business) {
      throw new BusinessNotFoundError(input.businessId);
    }

    const location = await this.locationRepository.findByIdAndBusiness(
      input.locationId,
      input.businessId,
    );

    if (!location) {
      throw new LocationNotFoundError(input.locationId);
    }

    const resource = await this.resourceRepository.findByIdAndLocation(
      input.resourceId,
      input.locationId,
    );

    if (!resource) {
      throw new ResourceNotFoundError(input.resourceId);
    }

    if (!DATE_RE.test(input.date)) {
      throw new InvalidExceptionError('date must be YYYY-MM-DD');
    }

    let startTime: string | null = null;
    let endTime: string | null = null;

    if (input.type === 'CLOSED') {
      if (input.startTime !== undefined && input.startTime !== null) {
        throw new InvalidExceptionError('CLOSED must not have startTime');
      }
      if (input.endTime !== undefined && input.endTime !== null) {
        throw new InvalidExceptionError('CLOSED must not have endTime');
      }
    } else {
      if (
        input.startTime === undefined ||
        input.startTime === null ||
        !TIME_RE.test(input.startTime)
      ) {
        throw new InvalidExceptionError(
          'startTime must be HH:mm for CUSTOM_HOURS and BREAK',
        );
      }
      if (
        input.endTime === undefined ||
        input.endTime === null ||
        !TIME_RE.test(input.endTime)
      ) {
        throw new InvalidExceptionError(
          'endTime must be HH:mm for CUSTOM_HOURS and BREAK',
        );
      }
      if (input.startTime >= input.endTime) {
        throw new InvalidExceptionError(
          'startTime must be earlier than endTime',
        );
      }
      startTime = input.startTime;
      endTime = input.endTime;
    }

    const exception = await this.availabilityExceptionRepository.create({
      resourceId: resource.id,
      date: new Date(`${input.date}T00:00:00.000Z`),
      type: input.type,
      startTime,
      endTime,
      reason: input.reason ?? null,
    });

    await this.availabilityCache.invalidateForResource(resource.id);

    return { exception };
  }
}