import type { Booking } from '@reservio/database';

import type { BookingRepository } from '../repositories/booking.repository.js';
import { assertValidCursor } from '../../catalog/use-cases/_cursor.js';
import { BusinessNotFoundError } from '../../catalog/use-cases/catalog.errors.js';
import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';

export interface ListMyBookingsInput {
  actorId: string;
  cursor?: string;
  limit?: number;
}

export interface ListBusinessBookingsInput {
  actorId: string;
  businessId: string;
  cursor?: string;
  limit?: number;
}

export interface ListBookingsOutput {
  items: Booking[];
  nextCursor: string | null;
}

export class ListMyBookingsUseCase {
  constructor(private readonly bookingRepository: BookingRepository) {}

  async execute(input: ListMyBookingsInput): Promise<ListBookingsOutput> {
    assertValidCursor(input.cursor);

    return this.bookingRepository.listByCustomer(input.actorId, {
      ...(input.cursor !== undefined && { cursor: input.cursor }),
      ...(input.limit !== undefined && { limit: input.limit }),
    });
  }
}

export class ListBusinessBookingsUseCase {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly bookingRepository: BookingRepository,
  ) {}

  async execute(
    input: ListBusinessBookingsInput,
  ): Promise<ListBookingsOutput> {
    const business = await this.businessRepository.findByIdAndOwner(
      input.businessId,
      input.actorId,
    );

    if (!business) {
      throw new BusinessNotFoundError(input.businessId);
    }

    assertValidCursor(input.cursor);

    return this.bookingRepository.listByBusiness(input.businessId, {
      ...(input.cursor !== undefined && { cursor: input.cursor }),
      ...(input.limit !== undefined && { limit: input.limit }),
    });
  }
}