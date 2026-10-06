import type { AvailabilityRule } from '@reservio/database';

import type { AvailabilityCache } from '../repositories/availability-cache.js';
import type {
  AvailabilityRuleRepository,
  UpdateRuleInput,
} from '../repositories/availability-rule.repository.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { LocationRepository } from '../../catalog/repositories/location.repository.js';
import type { ResourceRepository } from '../../catalog/repositories/resource.repository.js';
import { isWeekday } from '../domain/_weekday.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
} from '../../catalog/use-cases/catalog.errors.js';
import {
  InvalidRuleError,
  ResourceNotFoundError,
  RuleNotFoundError,
} from './availability.errors.js';

export interface UpdateRuleUseCaseInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  ruleId: string;
  weekday?: number;
  type?: 'OPEN' | 'BREAK';
  startTime?: string;
  endTime?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface UpdateRuleOutput {
  rule: AvailabilityRule;
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateRuleUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly availabilityRuleRepository: AvailabilityRuleRepository,
    private readonly availabilityCache: AvailabilityCache,
  ) {}

  async execute(input: UpdateRuleUseCaseInput): Promise<UpdateRuleOutput> {
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

    const patch: UpdateRuleInput = {};

    if (input.weekday !== undefined) {
      if (!isWeekday(input.weekday)) {
        throw new InvalidRuleError('weekday must be an integer between 1 and 7');
      }
      patch.weekday = input.weekday;
    }

    if (input.type !== undefined) {
      patch.type = input.type;
    }

    const nextStart = input.startTime ?? existing.startTime;
    const nextEnd = input.endTime ?? existing.endTime;

    if (input.startTime !== undefined) {
      if (!TIME_RE.test(input.startTime)) {
        throw new InvalidRuleError('startTime must be HH:mm (00:00–23:59)');
      }
      patch.startTime = input.startTime;
    }

    if (input.endTime !== undefined) {
      if (!TIME_RE.test(input.endTime)) {
        throw new InvalidRuleError('endTime must be HH:mm (00:00–23:59)');
      }
      patch.endTime = input.endTime;
    }

    if (nextStart >= nextEnd) {
      throw new InvalidRuleError('startTime must be earlier than endTime');
    }

    if (input.effectiveFrom !== undefined) {
      if (input.effectiveFrom === null) {
        patch.effectiveFrom = null;
      } else {
        if (!DATE_RE.test(input.effectiveFrom)) {
          throw new InvalidRuleError('effectiveFrom must be YYYY-MM-DD');
        }
        patch.effectiveFrom = new Date(
          `${input.effectiveFrom}T00:00:00.000Z`,
        );
      }
    }

    if (input.effectiveTo !== undefined) {
      if (input.effectiveTo === null) {
        patch.effectiveTo = null;
      } else {
        if (!DATE_RE.test(input.effectiveTo)) {
          throw new InvalidRuleError('effectiveTo must be YYYY-MM-DD');
        }
        patch.effectiveTo = new Date(`${input.effectiveTo}T00:00:00.000Z`);
      }
    }

    const nextFrom =
      patch.effectiveFrom !== undefined
        ? patch.effectiveFrom
        : existing.effectiveFrom;
    const nextTo =
      patch.effectiveTo !== undefined
        ? patch.effectiveTo
        : existing.effectiveTo;

    if (
      nextFrom !== null &&
      nextTo !== null &&
      nextFrom.getTime() > nextTo.getTime()
    ) {
      throw new InvalidRuleError(
        'effectiveFrom must be earlier than or equal to effectiveTo',
      );
    }

    const rule = await this.availabilityRuleRepository.update(
      input.ruleId,
      patch,
    );

    await this.availabilityCache.invalidateForResource(resource.id);

    return { rule };
  }
}