import type { ServiceResource } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ServiceRepository } from '../repositories/service.repository.js';
import type { ServiceResourceRepository } from '../repositories/service-resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
  ServiceNotFoundError,
} from './catalog.errors.js';

export interface ListServiceResourcesInput {
  actorId: string;
  businessId: string;
  locationId: string;
  serviceId: string;
}

export interface ListServiceResourcesOutput {
  items: ServiceResource[];
}

export class ListServiceResourcesUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
    private readonly serviceResourceRepository: ServiceResourceRepository,
  ) {}

  async execute(
    input: ListServiceResourcesInput,
  ): Promise<ListServiceResourcesOutput> {
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

    const service = await this.serviceRepository.findByIdAndLocation(
      input.serviceId,
      input.locationId,
    );

    if (!service) {
      throw new ServiceNotFoundError(input.serviceId);
    }

    const items = await this.serviceResourceRepository.listByService(
      input.serviceId,
    );

    return { items };
  }
}