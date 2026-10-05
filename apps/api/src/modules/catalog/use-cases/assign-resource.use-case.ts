import type { ServiceResource } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { ResourceRepository } from '../repositories/resource.repository.js';
import type { ServiceRepository } from '../repositories/service.repository.js';
import type { ServiceResourceRepository } from '../repositories/service-resource.repository.js';
import { isUniqueViolation } from './_prisma-errors.js';
import {
  BusinessNotFoundError,
  CrossLocationAssignmentError,
  LocationNotFoundError,
  ResourceInactiveError,
  ResourceNotFoundError,
  ServiceInactiveError,
  ServiceNotFoundError,
  ServiceResourceAlreadyAssignedError,
} from './catalog.errors.js';

export interface AssignResourceInput {
  actorId: string;
  businessId: string;
  locationId: string;
  serviceId: string;
  resourceId: string;
}

export interface AssignResourceOutput {
  assignment: ServiceResource;
}

export class AssignResourceUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly locationRepository: LocationRepository,
    private readonly serviceRepository: ServiceRepository,
    private readonly resourceRepository: ResourceRepository,
    private readonly serviceResourceRepository: ServiceResourceRepository,
  ) {}

  async execute(input: AssignResourceInput): Promise<AssignResourceOutput> {
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

    if (!service.isActive) {
      throw new ServiceInactiveError(input.serviceId);
    }

    const resource = await this.resourceRepository.findByIdAndLocation(
      input.resourceId,
      input.locationId,
    );

    if (!resource) {
      throw new ResourceNotFoundError(input.resourceId);
    }

    if (!resource.isActive) {
      throw new ResourceInactiveError(input.resourceId);
    }

    if (service.locationId !== resource.locationId) {
      throw new CrossLocationAssignmentError();
    }

    const existing = await this.serviceResourceRepository.findAssignment(
      input.serviceId,
      input.resourceId,
    );

    if (existing) {
      throw new ServiceResourceAlreadyAssignedError(
        input.serviceId,
        input.resourceId,
      );
    }

    try {
      const assignment = await this.serviceResourceRepository.assign({
        serviceId: input.serviceId,
        resourceId: input.resourceId,
      });

      return { assignment };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ServiceResourceAlreadyAssignedError(
          input.serviceId,
          input.resourceId,
        );
      }

      throw error;
    }
  }
}