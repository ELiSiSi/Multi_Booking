import type { AvailabilityException } from '@reservio/database';

import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type {
  AvailabilityExceptionRepository,
  UpdateExceptionInput,
} from '../repositories/availability-exception.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import {
  ExceptionNotFoundError,
  InvalidExceptionError,
  ResourceNotFoundError,
} from './availability.errors.js';

export interface UpdateExceptionUseCaseInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  exceptionId: string;
  type?: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export interface UpdateExceptionOutput {
  exception: AvailabilityException;
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export class UpdateExceptionUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityExceptionRepository: AvailabilityExceptionRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(
    input: UpdateExceptionUseCaseInput,
  ): Promise<UpdateExceptionOutput> {
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

    const existing =
      await this.availabilityExceptionRepository.findByIdAndResource(
        input.exceptionId,
        resource.id,
      );

    if (!existing) {
      throw new ExceptionNotFoundError(input.exceptionId);
    }

    const patch: UpdateExceptionInput = {};
    const nextType = input.type ?? existing.type;

    if (input.type !== undefined) {
      patch.type = input.type;
    }

    if (nextType === 'CLOSED') {
      if (input.startTime !== undefined && input.startTime !== null) {
        throw new InvalidExceptionError('CLOSED must not have startTime');
      }
      if (input.endTime !== undefined && input.endTime !== null) {
        throw new InvalidExceptionError('CLOSED must not have endTime');
      }
      patch.startTime = null;
      patch.endTime = null;
    } else {
      const nextStart =
        input.startTime !== undefined ? input.startTime : existing.startTime;
      const nextEnd =
        input.endTime !== undefined ? input.endTime : existing.endTime;

      if (nextStart === null || !TIME_RE.test(nextStart)) {
        throw new InvalidExceptionError(
          'startTime must be HH:mm for CUSTOM_HOURS and BREAK',
        );
      }
      if (nextEnd === null || !TIME_RE.test(nextEnd)) {
        throw new InvalidExceptionError(
          'endTime must be HH:mm for CUSTOM_HOURS and BREAK',
        );
      }
      if (nextStart >= nextEnd) {
        throw new InvalidExceptionError(
          'startTime must be earlier than endTime',
        );
      }

      if (input.startTime !== undefined) {
        patch.startTime = input.startTime;
      }
      if (input.endTime !== undefined) {
        patch.endTime = input.endTime;
      }
    }

    if (input.reason !== undefined) {
      patch.reason = input.reason;
    }

    const exception = await this.availabilityExceptionRepository.update(
      input.exceptionId,
      patch,
    );

    await this.availabilityCache.invalidateForResource(resource.id);

    return { exception };
  }
}