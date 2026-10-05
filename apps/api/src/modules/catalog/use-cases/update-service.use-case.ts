import type { Service } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type {
  ServiceRepository,
  UpdateServiceInput,
} from '../repositories/service.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import {
  BusinessNotFoundError,
  EmptyNameError,
  LocationNotFoundError,
  ServiceNameAlreadyTakenError,
  ServiceNotFoundError,
} from './catalog.errors.js';

export interface UpdateServiceUseCaseInput {
  actorId: string;
  businessId: string;
  locationId: string;
  serviceId: string;
  name?: string;
  durationMinutes?: number;
  priceCents?: number;
  currency?: string;
  isActive?: boolean;
}

export interface UpdateServiceOutput {
  service: Service;
}

export class UpdateServiceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
  ) {}

  async execute(
    input: UpdateServiceUseCaseInput,
  ): Promise<UpdateServiceOutput> {
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

    const existing = await this.serviceRepository.findByIdAndLocation(
      input.serviceId,
      input.locationId,
    );

    if (!existing) {
      throw new ServiceNotFoundError(input.serviceId);
    }

    const patch: UpdateServiceInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (name.length === 0) {
        throw new EmptyNameError();
      }

      const taken = await this.serviceRepository.existsByNameAndLocation(
        name,
        input.locationId,
      );
      if (taken && existing.name !== name) {
        throw new ServiceNameAlreadyTakenError(name);
      }
      patch.name = name;
    }

    if (input.durationMinutes !== undefined) {
      patch.durationMinutes = input.durationMinutes;
    }
    if (input.priceCents !== undefined) patch.priceCents = input.priceCents;
    if (input.currency !== undefined) {
      patch.currency = input.currency.trim().toUpperCase();
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      const service = await this.serviceRepository.update(
        input.serviceId,
        patch,
      );

      return { service };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ServiceNameAlreadyTakenError(patch.name ?? existing.name);
      }

      throw error;
    }
  }
}