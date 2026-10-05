import type { Service } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type {
  ListServicesOptions,
  ServiceRepository,
} from '../repositories/service.repository.js';
import { assertValidCursor } from './_cursor.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from './catalog.errors.js';

export interface ListServicesInput {
  actorId: string;
  businessId: string;
  locationId: string;
  cursor?: string;
  limit?: number;
}

export interface ListServicesOutput {
  items: Service[];
  nextCursor: string | null;
}

export class ListServicesUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
  ) {}

  async execute(input: ListServicesInput): Promise<ListServicesOutput> {
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

    assertValidCursor(input.cursor);

    const options: ListServicesOptions = {};
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.limit !== undefined) options.limit = input.limit;

    return this.serviceRepository.listByLocation(input.locationId, options);
  }
}