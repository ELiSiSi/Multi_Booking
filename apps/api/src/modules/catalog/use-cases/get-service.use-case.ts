import type { Service } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ServiceRepository } from '../repositories/service.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
  ServiceNotFoundError,
} from './catalog.errors.js';

export interface GetServiceInput {
  actorId: string;
  businessId: string;
  locationId: string;
  serviceId: string;
}

export interface GetServiceOutput {
  service: Service;
}

export class GetServiceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
  ) {}

  async execute(input: GetServiceInput): Promise<GetServiceOutput> {
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

    return { service };
  }
}