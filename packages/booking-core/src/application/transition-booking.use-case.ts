import type { Booking } from '../domain/booking.js';
import type { BookingStatus } from '../domain/booking-status.js';

import { canTransition } from '../domain/booking-state.js';
import {
  canAdminCancel,
  canComplete,
  canCustomerCancel,
  canMarkNoShow,
} from '../domain/booking-policy.js';
import {
  BookingCancellationClosedError,
  BookingNotFoundError,
  BookingNotStartedError,
  BookingNotYetCompletedError,
  CancellationWindowPassedError,
  ForbiddenRoleError,
  InvalidStateTransitionError,
} from '../domain/booking-errors.js';
import type {
  TransactionContext,
  UnitOfWorkPort,
} from './ports/transaction.port.js';

export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export type ActorRole = 'admin' | 'customer' | 'system';

export interface TransitionActor {
  userId: string;
  role: ActorRole;
}

export interface TransitionBookingInput {
  bookingId: string;
  actor: TransitionActor;
  to: BookingStatus;
  cancellationReason?: string;
}

export interface TransitionBookingOutput {
  booking: Booking;
}

export class TransitionBookingUseCase {
  constructor(private readonly uow: UnitOfWorkPort) {}

  async execute(
    input: TransitionBookingInput,
  ): Promise<TransitionBookingOutput> {
    return this.uow.run(async (tx) => {
      const initial = await tx.bookings.findById(input.bookingId);
      if (!initial) {
        throw new BookingNotFoundError(input.bookingId);
      }

      await tx.lockResource(initial.resourceId);

      const booking = await tx.bookings.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      this.assertAuthorized(input.actor, booking, input.to);

      if (!canTransition(booking.status, input.to)) {
        throw new InvalidStateTransitionError(booking.status, input.to);
      }

      const now = new Date();
      await this.assertTimingGuards(tx, booking, input, now);

      const patch =
        input.to === 'cancelled'
          ? {
              status: input.to,
              cancelledAt: now,
              cancellationReason: input.cancellationReason ?? null,
              expectedStatus: booking.status,
            }
          : {
              status: input.to,
              expectedStatus: booking.status,
            };

      const updated = await tx.bookings.updateStatus(booking.id, patch);
      if (!updated) {
        throw new InvalidStateTransitionError(booking.status, input.to);
      }

      await tx.audit.record({
        bookingId: updated.id,
        actorId: input.actor.userId,
        action: `booking.${input.to}`,
        metadata: {
          from: booking.status,
          to: input.to,
          ...(input.cancellationReason
            ? { reason: input.cancellationReason }
            : {}),
        },
      });

      return { booking: updated };
    });
  }

  private assertAuthorized(
    actor: TransitionActor,
    booking: Booking,
    to: BookingStatus,
  ): void {
    if (actor.role === 'system') {
      if (
        actor.userId !== SYSTEM_ACTOR_ID ||
        booking.status !== 'pending' ||
        to !== 'cancelled'
      ) {
        throw new ForbiddenRoleError();
      }

      return;
    }

    if (actor.role === 'admin') {
      return;
    }

    if (actor.role === 'customer') {
      if (booking.customerId !== actor.userId) {
        throw new BookingNotFoundError(booking.id);
      }
      return;
    }
  }

  private async assertTimingGuards(
    tx: TransactionContext,
    booking: Booking,
    input: TransitionBookingInput,
    now: Date,
  ): Promise<void> {
    if (input.to === 'completed') {
      if (!canComplete(booking, now)) {
        throw new BookingNotYetCompletedError();
      }
      return;
    }

    if (input.to === 'no_show') {
      if (!canMarkNoShow(booking, now)) {
        throw new BookingNotStartedError();
      }
      return;
    }

    if (input.to === 'cancelled') {
      if (input.actor.role === 'system') {
        return;
      }

      if (input.actor.role === 'admin') {
        if (!canAdminCancel(booking, now)) {
          throw new BookingCancellationClosedError();
        }
        return;
      }

      const business = await tx.businesses.findById(booking.businessId);

      if (!business) {
        throw new BookingNotFoundError(booking.id);
      }

      if (!canCustomerCancel(booking, business, now)) {
        throw new CancellationWindowPassedError();
      }
    }
  }
}