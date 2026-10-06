import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type { AvailabilityExceptionRepository } from '../repositories/availability-exception.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import { isRecordNotFound } from '../../catalog/use-cases/_prisma-errors.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import {
  ExceptionNotFoundError,
  ResourceNotFoundError,
} from './availability.errors.js';

export interface DeleteExceptionInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  exceptionId: string;
}

export class DeleteExceptionUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityExceptionRepository: AvailabilityExceptionRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(input: DeleteExceptionInput): Promise<void> {
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

    try {
      await this.availabilityExceptionRepository.delete(input.exceptionId);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new ExceptionNotFoundError(input.exceptionId);
      }
      throw error;
    }

    await this.availabilityCache.invalidateForResource(resource.id);
  }
}