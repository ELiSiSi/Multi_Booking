import type { Location } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type {
  ListLocationsOptions,
  LocationRepository,
} from '../repositories/location.repository.js';
import { assertValidCursor } from './_cursor.js';
import { BusinessNotFoundError } from './catalog.errors.js';

export interface ListLocationsInput {
  actorId: string;
  businessId: string;
  cursor?: string;
  limit?: number;
}

export interface ListLocationsOutput {
  items: Location[];
  nextCursor: string | null;
}

export class ListLocationsUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async execute(input: ListLocationsInput): Promise<ListLocationsOutput> {
    const business = await this.businessRepository.findByIdAndOwner(
      input.businessId,
      input.actorId,
    );

    if (!business) {
      throw new BusinessNotFoundError(input.businessId);
    }

    assertValidCursor(input.cursor);

    const options: ListLocationsOptions = {};
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.limit !== undefined) options.limit = input.limit;

    return this.locationRepository.listByBusiness(input.businessId, options);
  }
}