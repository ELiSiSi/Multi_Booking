import type { Business } from '@reservio/database';

import type {
  BusinessRepository,
  UpdateBusinessInput,
} from '../repositories/business.repository.js';
import { isValidIanaTimezone } from './_timezone.js';
import {
  BusinessNameAlreadyTakenError,
  BusinessNotFoundError,
  EmptyNameError,
  InvalidTimezoneError,
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
  reminderLeadTimeMinutes?: number;
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

      if (name.length === 0) {
        throw new EmptyNameError();
      }

      const taken = await this.businessRepository.existsByNameAndOwner(
        name,
        input.actorId,
      );
      if (taken && existing.name !== name) {
        throw new BusinessNameAlreadyTakenError(name);
      }
      patch.name = name;
    }

    if (input.timezone !== undefined) {
      const trimmed = input.timezone.trim();
      if (trimmed.length > 0) {
        if (!isValidIanaTimezone(trimmed)) {
          throw new InvalidTimezoneError(trimmed);
        }
        patch.timezone = trimmed;
      }
    }

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
    if (input.reminderLeadTimeMinutes !== undefined) {
      patch.reminderLeadTimeMinutes = input.reminderLeadTimeMinutes;
    }

    const business = await this.businessRepository.update(
      input.businessId,
      patch,
    );

    return { business };
  }
}