import { prisma, type AuditEvent } from '@reservio/database';

export interface CreateAuditEventInput {
  bookingId?: string | null;
  actorId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}

export class AuditRepository {
  async create(input: CreateAuditEventInput): Promise<AuditEvent> {
    return prisma.auditEvent.create({
      data: {
        ...(input.bookingId !== undefined && { bookingId: input.bookingId }),
        actorId: input.actorId,
        action: input.action,
        ...(input.metadata !== undefined && {
          metadata: input.metadata as object,
        }),
      },
    });
  }

  async listByBooking(bookingId: string): Promise<AuditEvent[]> {
    return prisma.auditEvent.findMany({
      where: { bookingId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }
}