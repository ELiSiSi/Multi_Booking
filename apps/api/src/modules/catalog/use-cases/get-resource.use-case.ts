import type { Resource } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ResourceRepository } from '../repositories/resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
  ResourceNotFoundError,
} from './catalog.errors.js';

export interface GetResourceInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
}

export interface GetResourceOutput {
  resource: Resource;
}

export class GetResourceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async execute(input: GetResourceInput): Promise<GetResourceOutput> {
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

    return { resource };
  }
}