import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AuditRepositoryPort,
  RecordAuditEventInput,
} from '@reservio/booking-core';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export class PrismaAuditRepository implements AuditRepositoryPort {
  constructor(private readonly db: PrismaLike) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.db.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        ...(input.bookingId !== undefined && input.bookingId !== null
          ? { bookingId: input.bookingId }
          : {}),
        ...(input.metadata !== undefined && input.metadata !== null
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}