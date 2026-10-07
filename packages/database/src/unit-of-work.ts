import type { PrismaClient } from '@prisma/client';
import type {
  TransactionContext,
  UnitOfWorkPort,
} from '@reservio/booking-core';

import { lockResource } from './locks.js';
import { PrismaAuditRepository } from './repositories/audit.repository.js';
import { PrismaBookingRepository } from './repositories/booking.repository.js';
import { PrismaBusinessRepository } from './repositories/business.repository.js';

export class PrismaUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly prisma: PrismaClient) {}

  async run<T>(
    fn: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const ctx: TransactionContext = {
        bookings: new PrismaBookingRepository(tx),
        businesses: new PrismaBusinessRepository(tx),
        audit: new PrismaAuditRepository(tx),
        lockResource: (resourceId: string) => lockResource(tx, resourceId),
      };

      return fn(ctx);
    });
  }
}