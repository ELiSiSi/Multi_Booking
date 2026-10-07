import type { Booking } from '../../domain/booking.js';
import type { BookingStatus } from '../../domain/booking-status.js';

export interface UpdateBookingStatusInput {
  status: BookingStatus;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  expectedStatus: BookingStatus;
}

export interface BookingRepositoryPort {
  findById(id: string): Promise<Booking | null>;

  updateStatus(
    id: string,
    input: UpdateBookingStatusInput,
  ): Promise<Booking | null>;
}