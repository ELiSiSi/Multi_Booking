import type { Location } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from './catalog.errors.js';

export interface GetLocationInput {
  actorId: string;
  businessId: string;
  locationId: string;
}

export interface GetLocationOutput {
  location: Location;
}

export class GetLocationUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async execute(input: GetLocationInput): Promise<GetLocationOutput> {
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

    return { location };
  }
}