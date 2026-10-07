import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  BusinessRepositoryPort,
  PolicyBusinessView,
} from '@reservio/booking-core';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export class PrismaBusinessRepository implements BusinessRepositoryPort {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: string): Promise<PolicyBusinessView | null> {
    const business = await this.db.business.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        cancellationWindowMinutes: true,
      },
    });

    return business;
  }
}