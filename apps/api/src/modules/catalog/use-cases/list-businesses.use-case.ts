import type { Business } from '@reservio/database';

import type {
  BusinessRepository,
  ListBusinessesOptions,
} from '../repositories/business.repository.js';
import { assertValidCursor } from './_cursor.js';

export interface ListBusinessesInput {
  actorId: string;
  cursor?: string;
  limit?: number;
}

export interface ListBusinessesOutput {
  items: Business[];
  nextCursor: string | null;
}

export class ListBusinessesUseCase {
  constructor(private readonly businessRepository: BusinessRepository) {}

  async execute(
    input: ListBusinessesInput,
  ): Promise<ListBusinessesOutput> {
    assertValidCursor(input.cursor);

    const options: ListBusinessesOptions = {};
    if (input.cursor !== undefined) options.cursor = input.cursor;
    if (input.limit !== undefined) options.limit = input.limit;

    return this.businessRepository.listByOwner(input.actorId, options);
  }
}