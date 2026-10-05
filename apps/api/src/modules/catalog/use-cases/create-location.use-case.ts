import type { Location } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import { isValidIanaTimezone } from './_timezone.js';
import {
  BusinessNotFoundError,
  EmptyNameError,
  InvalidTimezoneError,
  LocationNameAlreadyTakenError,
} from './catalog.errors.js';

export interface CreateLocationInput {
  actorId: string;
  businessId: string;
  name: string;
  timezone?: string;
  address?: string;
}

export interface CreateLocationOutput {
  location: Location;
}

export class CreateLocationUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async execute(input: CreateLocationInput): Promise<CreateLocationOutput> {
    const business = await this.businessRepository.findByIdAndOwner(
      input.businessId,
      input.actorId,
    );

    if (!business) {
      throw new BusinessNotFoundError(input.businessId);
    }

    const name = input.name.trim();

    if (name.length === 0) {
      throw new EmptyNameError();
    }

    const nameTaken = await this.locationRepository.existsByNameAndBusiness(
      name,
      input.businessId,
    );

    if (nameTaken) {
      throw new LocationNameAlreadyTakenError(name);
    }

    let timezone: string | undefined;
    if (input.timezone !== undefined) {
      const trimmed = input.timezone.trim();
      if (trimmed.length > 0) {
        if (!isValidIanaTimezone(trimmed)) {
          throw new InvalidTimezoneError(trimmed);
        }
        timezone = trimmed;
      }
    }

    let address: string | undefined;
    if (input.address !== undefined) {
      const trimmed = input.address.trim();
      address = trimmed.length > 0 ? trimmed : undefined;
    }

    try {
      const location = await this.locationRepository.create({
        businessId: input.businessId,
        name,
        ...(timezone !== undefined && { timezone }),
        ...(address !== undefined && { address }),
      });

      return { location };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LocationNameAlreadyTakenError(name);
      }

      throw error;
    }
  }
}