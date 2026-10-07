import type { Business } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import { isValidIanaTimezone } from './_timezone.js';
import {
  BusinessNameAlreadyTakenError,
  EmptyNameError,
  InvalidTimezoneError,
} from './catalog.errors.js';

export interface CreateBusinessInput {
  actorId: string;
  name: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
  reminderLeadTimeMinutes?: number;
}

export interface CreateBusinessOutput {
  business: Business;
}

export class CreateBusinessUseCase {
  constructor(private readonly businessRepository: BusinessRepository) {}

  async execute(input: CreateBusinessInput): Promise<CreateBusinessOutput> {
    const name = input.name.trim();

    if (name.length === 0) {
      throw new EmptyNameError();
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

    const nameTaken = await this.businessRepository.existsByNameAndOwner(
      name,
      input.actorId,
    );

    if (nameTaken) {
      throw new BusinessNameAlreadyTakenError(name);
    }

    const business = await this.businessRepository.create({
      ownerId: input.actorId,
      name,
      ...(timezone !== undefined && { timezone }),
      ...(input.slotGranularityMinutes !== undefined && {
        slotGranularityMinutes: input.slotGranularityMinutes,
      }),
      ...(input.defaultBufferMinutes !== undefined && {
        defaultBufferMinutes: input.defaultBufferMinutes,
      }),
      ...(input.pendingTimeoutMinutes !== undefined && {
        pendingTimeoutMinutes: input.pendingTimeoutMinutes,
      }),
      ...(input.cancellationWindowMinutes !== undefined && {
        cancellationWindowMinutes: input.cancellationWindowMinutes,
      }),
      ...(input.reminderLeadTimeMinutes !== undefined && {
        reminderLeadTimeMinutes: input.reminderLeadTimeMinutes,
      }),
    });

    return { business };
  }
}