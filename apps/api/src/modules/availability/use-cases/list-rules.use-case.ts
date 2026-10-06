import type { AvailabilityRule } from '@reservio/database';

import type { AvailabilityRuleRepository } from '../repositories/availability-rule.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import { ResourceNotFoundError } from './availability.errors.js';

export interface ListRulesInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
}

export interface ListRulesOutput {
  items: AvailabilityRule[];
}

export class ListRulesUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityRuleRepository: AvailabilityRuleRepository,
  ) {}

  async execute(input: ListRulesInput): Promise<ListRulesOutput> {
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

    const items = await this.availabilityRuleRepository.listByResource(
      resource.id,
    );

    return { items };
  }
}