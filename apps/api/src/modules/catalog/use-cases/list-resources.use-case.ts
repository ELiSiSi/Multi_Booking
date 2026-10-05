import type { Resource } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type {
  ListResourcesOptions,
  ResourceRepository,
} from '../repositories/resource.repository.js';
import { assertValidCursor } from './_cursor.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from './catalog.errors.js';

export interface ListResourcesInput {
  actorId: string;
  businessId: string;
  locationId: string;
  cursor?: string;
  limit?: number;
}

export interface ListResourcesOutput {
  items: Resource[];
  nextCursor: string | null;
}

export class ListResourcesUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async execute(input: ListResourcesInput): Promise<ListResourcesOutput> {
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

    const options: ListResourcesOptions = {};
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.limit !== undefined) options.limit = input.limit;

    return this.resourceRepository.listByLocation(input.locationId, options);
  }
}