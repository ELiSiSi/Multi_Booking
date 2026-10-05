import type { Service } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ServiceRepository } from '../repositories/service.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import {
  BusinessNotFoundError,
  EmptyNameError,
  LocationNotFoundError,
  ServiceNameAlreadyTakenError,
} from './catalog.errors.js';

export interface CreateServiceInput {
  actorId: string;
  businessId: string;
  locationId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  currency?: string;
}

export interface CreateServiceOutput {
  service: Service;
}

export class CreateServiceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
  ) {}

  async execute(input: CreateServiceInput): Promise<CreateServiceOutput> {
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

    const nameTaken = await this.serviceRepository.existsByNameAndLocation(
      name,
      input.locationId,
    );

    if (nameTaken) {
      throw new ServiceNameAlreadyTakenError(name);
    }

    const currency =
      input.currency !== undefined
        ? input.currency.trim().toUpperCase()
        : undefined;

    try {
      const service = await this.serviceRepository.create({
        locationId: input.locationId,
        name,
        durationMinutes: input.durationMinutes,
        priceCents: input.priceCents,
        ...(currency !== undefined && { currency }),
      });

      return { service };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ServiceNameAlreadyTakenError(name);
      }

      throw error;
    }
  }
}