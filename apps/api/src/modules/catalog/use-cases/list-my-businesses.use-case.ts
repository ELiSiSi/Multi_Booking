import type { Business } from '@reservio/database';

import type {
  BusinessRepository,
  ListBusinessesOptions,
} from '../repositories/business.repository.js';

export interface ListMyBusinessesInput {
  actorId: string;
  cursor?: string;
  limit?: number;
}

export interface ListMyBusinessesOutput {
  items: Business[];
  nextCursor: string | null;
}

export class ListMyBusinessesUseCase {
  constructor(private readonly businessRepository: BusinessRepository) {}

  async execute(
    input: ListMyBusinessesInput,
  ): Promise<ListMyBusinessesOutput> {
    const options: ListBusinessesOptions = {};
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.limit !== undefined) options.limit = input.limit;

    return this.businessRepository.listByOwner(input.actorId, options);
  }
}