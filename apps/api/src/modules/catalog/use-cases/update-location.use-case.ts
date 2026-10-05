import type { Location } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type {
  LocationRepository,
  UpdateLocationInput,
} from '../repositories/location.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import { isValidIanaTimezone } from './_timezone.js';
import {
  BusinessNotFoundError,
  EmptyNameError,
  InvalidTimezoneError,
  LocationNameAlreadyTakenError,
  LocationNotFoundError,
} from './catalog.errors.js';

export interface UpdateLocationUseCaseInput {
  actorId: string;
  businessId: string;
  locationId: string;
  name?: string;
  timezone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface UpdateLocationOutput {
  location: Location;
}

export class UpdateLocationUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async execute(
    input: UpdateLocationUseCaseInput,
  ): Promise<UpdateLocationOutput> {
    const business = await this.businessRepository.findByIdAndOwner(
      input.businessId,
      input.actorId,
    );

    if (!business) {
      throw new BusinessNotFoundError(input.businessId);
    }

    const existing = await this.locationRepository.findByIdAndBusiness(
      input.locationId,
      input.businessId,
    );

    if (!existing) {
      throw new LocationNotFoundError(input.locationId);
    }

    const patch: UpdateLocationInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (name.length === 0) {
        throw new EmptyNameError();
      }

      const taken = await this.locationRepository.existsByNameAndBusiness(
        name,
        input.businessId,
      );
      if (taken && existing.name !== name) {
        throw new LocationNameAlreadyTakenError(name);
      }
      patch.name = name;
    }

    if (input.timezone !== undefined) {
      if (input.timezone === null) {
        patch.timezone = null;
      } else {
        const trimmed = input.timezone.trim();
        if (trimmed.length === 0) {
          patch.timezone = null;
        } else {
          if (!isValidIanaTimezone(trimmed)) {
            throw new InvalidTimezoneError(trimmed);
          }
          patch.timezone = trimmed;
        }
      }
    }

    if (input.address !== undefined) {
      if (input.address === null) {
        patch.address = null;
      } else {
        const trimmed = input.address.trim();
        patch.address = trimmed.length > 0 ? trimmed : null;
      }
    }

    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      const location = await this.locationRepository.update(
        input.locationId,
        patch,
      );

      return { location };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LocationNameAlreadyTakenError(patch.name ?? existing.name);
      }

      throw error;
    }
  }
}