import type { Resource } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ResourceRepository } from '../repositories/resource.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import {
  BusinessNotFoundError,
  EmptyNameError,
  LocationNotFoundError,
  ResourceNameAlreadyTakenError,
} from './catalog.errors.js';

export interface CreateResourceInput {
  actorId: string;
  businessId: string;
  locationId: string;
  name: string;
  bufferMinutes?: number;
}

export interface CreateResourceOutput {
  resource: Resource;
}

export class CreateResourceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async execute(input: CreateResourceInput): Promise<CreateResourceOutput> {
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

    const name = input.name.trim();

    if (name.length === 0) {
      throw new EmptyNameError();
    }

    const nameTaken = await this.resourceRepository.existsByNameAndLocation(
      name,
      input.locationId,
    );

    if (nameTaken) {
      throw new ResourceNameAlreadyTakenError(name);
    }

    try {
      const resource = await this.resourceRepository.create({
        locationId: input.locationId,
        name,
        ...(input.bufferMinutes !== undefined && {
          bufferMinutes: input.bufferMinutes,
        }),
      });

      return { resource };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ResourceNameAlreadyTakenError(name);
      }

      throw error;
    }
  }
}