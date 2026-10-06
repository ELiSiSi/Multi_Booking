import type { Booking } from '@reservio/database';

import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { BookingRepository } from '../repositories/booking.repository.js';
import { BookingNotFoundError } from './booking.errors.js';

export interface GetBookingInput {
  actorId: string;
  actorRole: 'admin' | 'customer';
  bookingId: string;
}

export interface GetBookingOutput {
  booking: Booking;
}

export class GetBookingUseCase {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async execute(input: GetBookingInput): Promise<GetBookingOutput> {
    const booking = await this.bookingRepository.findById(input.bookingId);

    if (!booking) {
      throw new BookingNotFoundError(input.bookingId);
    }

    if (input.actorRole === 'admin') {
      const business = await this.businessRepository.findByIdAndOwner(
        booking.businessId,
        input.actorId,
      );
      if (!business) {
        throw new BookingNotFoundError(input.bookingId);
      }
    } else {
      if (booking.customerId !== input.actorId) {
        throw new BookingNotFoundError(input.bookingId);
      }
    }

    return { booking };
  }
}