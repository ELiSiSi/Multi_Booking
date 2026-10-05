import type { Resource } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type {
  ResourceRepository,
  UpdateResourceInput,
} from '../repositories/resource.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import {
  BusinessNotFoundError,
  EmptyNameError,
  LocationNotFoundError,
  ResourceNameAlreadyTakenError,
  ResourceNotFoundError,
} from './catalog.errors.js';

export interface UpdateResourceUseCaseInput {
  actorId: string;
  businessId: string;
  locationId: string;
  resourceId: string;
  name?: string;
  bufferMinutes?: number | null;
  isActive?: boolean;
}

export interface UpdateResourceOutput {
  resource: Resource;
}

export class UpdateResourceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async execute(
    input: UpdateResourceUseCaseInput,
  ): Promise<UpdateResourceOutput> {
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

    const existing = await this.resourceRepository.findByIdAndLocation(
      input.resourceId,
      input.locationId,
    );

    if (!existing) {
      throw new ResourceNotFoundError(input.resourceId);
    }

    const patch: UpdateResourceInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (name.length === 0) {
        throw new EmptyNameError();
      }

      const taken = await this.resourceRepository.existsByNameAndLocation(
        name,
        input.locationId,
      );
      if (taken && existing.name !== name) {
        throw new ResourceNameAlreadyTakenError(name);
      }
      patch.name = name;
    }

    if (input.bufferMinutes !== undefined) {
      patch.bufferMinutes = input.bufferMinutes;
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      const resource = await this.resourceRepository.update(
        input.resourceId,
        patch,
      );

      return { resource };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ResourceNameAlreadyTakenError(
          patch.name ?? existing.name,
        );
      }

      throw error;
    }
  }
}