import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type { AvailabilityRuleRepository } from '../repositories/availability-rule.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import { isRecordNotFound } from '../../catalog/use-cases/_prisma-errors.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import {
  ResourceNotFoundError,
  RuleNotFoundError,
} from './availability.errors.js';

export interface DeleteRuleInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  ruleId: string;
}

export class DeleteRuleUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityRuleRepository: AvailabilityRuleRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(input: DeleteRuleInput): Promise<void> {
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

    const existing = await this.availabilityRuleRepository.findByIdAndResource(
      input.ruleId,
      resource.id,
    );

    if (!existing) {
      throw new RuleNotFoundError(input.ruleId);
    }

    try {
      await this.availabilityRuleRepository.delete(input.ruleId);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new RuleNotFoundError(input.ruleId);
      }
      throw error;
    }

    await this.availabilityCache.invalidateForResource(resource.id);
  }
}