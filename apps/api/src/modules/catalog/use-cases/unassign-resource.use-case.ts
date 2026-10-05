import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ResourceRepository } from '../repositories/resource.repository.js';
import type { ServiceRepository } from '../repositories/service.repository.js';
import type { ServiceResourceRepository } from '../repositories/service-resource.repository.js';
import {
  BusinessNotFoundError,
  LocationNotFoundError,
  ResourceNotFoundError,
  ServiceNotFoundError,
  ServiceResourceNotFoundError,
} from './catalog.errors.js';
import { isRecordNotFound } from './_prisma-errors.js';

export interface UnassignResourceInput {
  actorId: string;
  businessId: string;
  locationId: string;
  serviceId: string;
  resourceId: string;
}

export class UnassignResourceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly serviceResourceRepository: ServiceResourceRepository,
  ) {}

  async execute(input: UnassignResourceInput): Promise<void> {
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

    const service = await this.serviceRepository.findByIdAndLocation(
      input.serviceId,
      input.locationId,
    );

    if (!service) {
      throw new ServiceNotFoundError(input.serviceId);
    }

    const resource = await this.resourceRepository.findByIdAndLocation(
      input.resourceId,
      input.locationId,
    );

    if (!resource) {
      throw new ResourceNotFoundError(input.resourceId);
    }

    const existing = await this.serviceResourceRepository.findAssignment(
      input.serviceId,
      input.resourceId,
    );

    if (!existing) {
      throw new ServiceResourceNotFoundError(
        input.serviceId,
        input.resourceId,
      );
    }

    try {
      await this.serviceResourceRepository.unassign(
        input.serviceId,
        input.resourceId,
      );
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new ServiceResourceNotFoundError(
          input.serviceId,
          input.resourceId,
        );
      }
      throw error;
    }
  }
}