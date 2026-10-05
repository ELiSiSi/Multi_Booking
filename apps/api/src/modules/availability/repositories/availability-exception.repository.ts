import { prisma, type AvailabilityException } from '@reservio/database';

export interface CreateExceptionInput {
  resourceId: string;
  date: Date;
  type: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export interface UpdateExceptionInput {
  type?: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export class AvailabilityExceptionRepository {
  async create(
    input: CreateExceptionInput,
  ): Promise<AvailabilityException> {
    return prisma.availabilityException.create({
      data: {
        resourceId: input.resourceId,
        date: input.date,
        type: input.type,
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.reason !== undefined && { reason: input.reason }),
      },
    });
  }

  async findById(id: string): Promise<AvailabilityException | null> {
    return prisma.availabilityException.findUnique({ where: { id } });
  }

  async findByIdAndResource(
    id: string,
    resourceId: string,
  ): Promise<AvailabilityException | null> {
    return prisma.availabilityException.findFirst({
      where: { id, resourceId },
    });
  }

  async listByResource(
    resourceId: string,
  ): Promise<AvailabilityException[]> {
    return prisma.availabilityException.findMany({
      where: { resourceId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async update(
    id: string,
    input: UpdateExceptionInput,
  ): Promise<AvailabilityException> {
    return prisma.availabilityException.update({
      where: { id },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.reason !== undefined && { reason: input.reason }),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.availabilityException.delete({ where: { id } });
  }
}