import { describe, expect, it } from 'vitest';

import {
  BookingNotYetExpiredError,
  SYSTEM_ACTOR_ID,
  TransitionBookingUseCase,
  type Booking,
  type TransactionContext,
  type UnitOfWorkPort,
} from '../src/index.js';

function makeBooking(pendingExpiresAt: Date | null): Booking {
  return {
    id: 'booking-1',
    businessId: 'business-1',
    resourceId: 'resource-1',
    customerId: 'customer-1',
    status: 'pending',
    startAt: new Date('2026-10-08T10:00:00.000Z'),
    endAt: new Date('2026-10-08T10:30:00.000Z'),
    bufferMinutes: 0,
    cancelledAt: null,
    cancellationReason: null,
    pendingExpiresAt,
  };
}

function makeUseCase(booking: Booking): TransitionBookingUseCase {
  const context: TransactionContext = {
    bookings: {
      findById: async () => booking,
      updateStatus: async () => ({
        ...booking,
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'EXPIRATION_TIMEOUT',
      }),
    },
    businesses: { findById: async () => null },
    audit: { record: async () => undefined },
    lockResource: async () => undefined,
  };
  const uow: UnitOfWorkPort = { run: async (fn) => fn(context) };
  return new TransitionBookingUseCase(uow);
}

describe('TransitionBookingUseCase system expiration guard', () => {
  it('rejects system expiration before the snapshotted pendingExpiresAt', async () => {
    const useCase = makeUseCase(
      makeBooking(new Date(Date.now() + 60_000)),
    );

    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        actor: { userId: SYSTEM_ACTOR_ID, role: 'system' },
        to: 'cancelled',
        cancellationReason: 'EXPIRATION_TIMEOUT',
      }),
    ).rejects.toBeInstanceOf(BookingNotYetExpiredError);
  });

  it('rejects system expiration when pendingExpiresAt is null', async () => {
    const useCase = makeUseCase(
      makeBooking(null),
    );

    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        actor: { userId: SYSTEM_ACTOR_ID, role: 'system' },
        to: 'cancelled',
        cancellationReason: 'EXPIRATION_TIMEOUT',
      }),
    ).rejects.toBeInstanceOf(BookingNotYetExpiredError);
  });

  it('allows system expiration at or after the snapshotted pendingExpiresAt', async () => {
    const useCase = makeUseCase(
      makeBooking(new Date(Date.now() - 1_000)),
    );

    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        actor: { userId: SYSTEM_ACTOR_ID, role: 'system' },
        to: 'cancelled',
        cancellationReason: 'EXPIRATION_TIMEOUT',
      }),
    ).resolves.toMatchObject({
      booking: { status: 'cancelled' },
    });
  });
});
