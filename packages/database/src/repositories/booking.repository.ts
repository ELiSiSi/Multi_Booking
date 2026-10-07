import type { Booking, Prisma, PrismaClient } from '@prisma/client';
import type {
  BookingRepositoryPort,
  UpdateBookingStatusInput,
} from '@reservio/booking-core';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export class PrismaBookingRepository implements BookingRepositoryPort {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: string): Promise<Booking | null> {
    return this.db.booking.findUnique({ where: { id } });
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

    return this.db.booking.findUnique({ where: { id } });
  }
}