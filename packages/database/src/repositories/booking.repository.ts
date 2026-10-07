import type { Booking as PrismaBooking, Prisma, PrismaClient } from '@prisma/client';
import type {
  Booking,
  BookingRepositoryPort,
  UpdateBookingStatusInput,
} from '@reservio/booking-core';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

function toCore(row: PrismaBooking): Booking {
  return {
    id: row.id,
    businessId: row.businessId,
    resourceId: row.resourceId,
    customerId: row.customerId,
    status: row.status as Booking['status'],
    startAt: row.startAt,
    endAt: row.endAt,
    bufferMinutes: row.bufferMinutes,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    pendingExpiresAt: row.pendingExpiresAt,
  };
}

export class PrismaBookingRepository implements BookingRepositoryPort {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: string): Promise<Booking | null> {
    const row = await this.db.booking.findUnique({ where: { id } });
    return row ? toCore(row) : null;
  }

  async updateStatus(
    id: string,
    input: UpdateBookingStatusInput,
  ): Promise<Booking | null> {
    const data: Prisma.BookingUpdateManyMutationInput = {
      status: input.status,
    };

    if (input.cancelledAt !== undefined) {
      data.cancelledAt = input.cancelledAt;
    }

    if (input.cancellationReason !== undefined) {
      data.cancellationReason = input.cancellationReason;
    }

    const result = await this.db.booking.updateMany({
      where: {
        id,
        status: input.expectedStatus,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.booking.findUnique({ where: { id } });
    return row ? toCore(row) : null;
  }
}