import type { Business } from '@reservio/database';

import type {
  BusinessRepository,
  UpdateBusinessInput,
} from '../repositories/business.repository.js';
import {
  BusinessNameAlreadyTakenError,
  BusinessNotFoundError,
} from './catalog.errors.js';

export interface UpdateBusinessUseCaseInput {
  actorId: string;
  businessId: string;
  name?: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
}

export interface UpdateBusinessOutput {
  business: Business;
}

export class UpdateBusinessUseCase {
  constructor(private readonly businessRepository: BusinessRepository) {}

  async execute(
    input: UpdateBusinessUseCaseInput,
  ): Promise<UpdateBusinessOutput> {
    const existing = await this.businessRepository.findByIdAndOwner(
      input.businessId,
      input.actorId,
    );

    if (!existing) {
      throw new BusinessNotFoundError(input.businessId);
    }

    const patch: UpdateBusinessInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      const taken = await this.businessRepository.existsByNameAndOwner(
        name,
        input.actorId,
      );
      if (taken && existing.name !== name) {
        throw new BusinessNameAlreadyTakenError(name);
      }
      patch.name = name;
    }

    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.slotGranularityMinutes !== undefined) {
      patch.slotGranularityMinutes = input.slotGranularityMinutes;
    }
    if (input.defaultBufferMinutes !== undefined) {
      patch.defaultBufferMinutes = input.defaultBufferMinutes;
    }
    if (input.pendingTimeoutMinutes !== undefined) {
      patch.pendingTimeoutMinutes = input.pendingTimeoutMinutes;
    }
    if (input.cancellationWindowMinutes !== undefined) {
      patch.cancellationWindowMinutes = input.cancellationWindowMinutes;
    }

    const business = await this.businessRepository.update(
      input.businessId,
      patch,
    );

    return { business };
  }
}