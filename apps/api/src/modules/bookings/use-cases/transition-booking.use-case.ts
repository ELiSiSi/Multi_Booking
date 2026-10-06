import type { Booking, BookingStatus } from '@reservio/database';

import type { BusinessRepository } from '../../catalog/repositories/business.repository.js';
import type { AuditRepository } from '../repositories/audit.repository.js';
import type { BookingRepository } from '../repositories/booking.repository.js';
import { canTransition } from '../domain/booking-status.js';
import {
  BookingNotFoundError,
  CancellationWindowClosedError,
  InvalidTransitionError,
  NoShowTooEarlyError,
} from './booking.errors.js';

export interface TransitionBookingInput {
  actorId: string;
  actorRole: 'admin' | 'customer';
  bookingId: string;
  target: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  cancellationReason?: string;
}

export interface TransitionBookingOutput {
  booking: Booking;
}

export class TransitionBookingUseCase {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly auditRepository: AuditRepository,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async execute(
    input: TransitionBookingInput,
  ): Promise<TransitionBookingOutput> {
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

    const from = booking.status;
    const to = input.target as BookingStatus;

    if (!canTransition(from, to)) {
      throw new InvalidTransitionError(from, to);
    }

    if (
      to === 'cancelled' &&
      from === 'confirmed' &&
      input.actorRole !== 'admin'
    ) {
      const business = await this.businessRepository.findById(
        booking.businessId,
      );
      if (business) {
        const cutoff = new Date(
          booking.startAt.getTime() -
            business.cancellationWindowMinutes * 60_000,
        );
        if (Date.now() > cutoff.getTime()) {
          throw new CancellationWindowClosedError();
        }
      }
    }

    if (to === 'no_show') {
      if (Date.now() < booking.startAt.getTime()) {
        throw new NoShowTooEarlyError();
      }
    }

    const patch: {
      status: BookingStatus;
      cancelledAt?: Date | null;
      cancellationReason?: string | null;
    } = { status: to };

    if (to === 'cancelled') {
      patch.cancelledAt = new Date();
      patch.cancellationReason = input.cancellationReason ?? null;
    }

    const updated = await this.bookingRepository.transition(
      input.bookingId,
      from,
      patch,
    );

    if (!updated) {
      throw new InvalidTransitionError(from, to);
    }

    await this.auditRepository.create({
      bookingId: updated.id,
      actorId: input.actorId,
      action: `booking.${to}`,
      metadata: {
        from,
        to,
        ...(input.cancellationReason
          ? { reason: input.cancellationReason }
          : {}),
      },
    });

    return { booking: updated };
  }
}