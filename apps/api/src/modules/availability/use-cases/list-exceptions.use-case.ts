import type { AvailabilityException } from '@reservio/database';

import type { AvailabilityExceptionRepository } from '../repositories/availability-exception.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import { ResourceNotFoundError } from './availability.errors.js';

export interface ListExceptionsInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
}

export interface ListExceptionsOutput {
  items: AvailabilityException[];
}

export class ListExceptionsUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityExceptionRepository: AvailabilityExceptionRepository,
  ) {}

  async execute(input: ListExceptionsInput): Promise<ListExceptionsOutput> {
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

    const items = await this.availabilityExceptionRepository.listByResource(
      resource.id,
    );

    return { items };
  }
}