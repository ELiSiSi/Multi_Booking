import type { AvailabilityRule } from '@reservio/database';

import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type { AvailabilityRuleRepository } from '../repositories/availability-rule.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import { isWeekday } from '../domain/_weekday.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
  ResourceNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import { InvalidRuleError } from './availability.errors.js';

export interface CreateRuleInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  weekday: number;
  type: 'OPEN' | 'BREAK';
  startTime: string;
  endTime: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface CreateRuleOutput {
  rule: AvailabilityRule;
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRuleUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityRuleRepository: AvailabilityRuleRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(input: CreateRuleInput): Promise<CreateRuleOutput> {
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

    if (!isWeekday(input.weekday)) {
      throw new InvalidRuleError('weekday must be an integer between 1 and 7');
    }

    if (!TIME_RE.test(input.startTime)) {
      throw new InvalidRuleError('startTime must be HH:mm (00:00–23:59)');
    }

    if (!TIME_RE.test(input.endTime)) {
      throw new InvalidRuleError('endTime must be HH:mm (00:00–23:59)');
    }

    if (input.startTime >= input.endTime) {
      throw new InvalidRuleError('startTime must be earlier than endTime');
    }

    let effectiveFrom: Date | null = null;
    let effectiveTo: Date | null = null;

    if (input.effectiveFrom !== undefined && input.effectiveFrom !== null) {
      if (!DATE_RE.test(input.effectiveFrom)) {
        throw new InvalidRuleError('effectiveFrom must be YYYY-MM-DD');
      }
      effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
    }

    if (input.effectiveTo !== undefined && input.effectiveTo !== null) {
      if (!DATE_RE.test(input.effectiveTo)) {
        throw new InvalidRuleError('effectiveTo must be YYYY-MM-DD');
      }
      effectiveTo = new Date(`${input.effectiveTo}T00:00:00.000Z`);
    }

    if (
      effectiveFrom !== null &&
      effectiveTo !== null &&
      effectiveFrom.getTime() > effectiveTo.getTime()
    ) {
      throw new InvalidRuleError(
        'effectiveFrom must be earlier than or equal to effectiveTo',
      );
    }

    const rule = await this.availabilityRuleRepository.create({
      resourceId: resource.id,
      weekday: input.weekday,
      type: input.type,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveFrom,
      effectiveTo,
    });

    await this.availabilityCache.invalidateForResource(resource.id);

    return { rule };
  }
}