import type { Business } from '@reservio/database';

import type { BusinessRepository } from '../repositories/business.repository.js';
import { BusinessNameAlreadyTakenError } from './catalog.errors.js';



export interface CreateBusinessInput {
  actorId: string;
  name: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
}

export interface CreateBusinessOutput {
  business: Business;
}



export class CreateBusinessUseCase {
  constructor(private readonly businessRepository: BusinessRepository) {}

  async execute(input: CreateBusinessInput): Promise<CreateBusinessOutput> {
    const name = input.name.trim();

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
      ...(input.timezone !== undefined && { timezone: input.timezone }),
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
    });

    return { business };
  }
}