import { prisma, type AvailabilityRule } from '@reservio/database';

export interface CreateRuleInput {
  resourceId: string;
  weekday: number;
  type: 'OPEN' | 'BREAK';
  startTime: string;
  endTime: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
}

export interface UpdateRuleInput {
  weekday?: number;
  type?: 'OPEN' | 'BREAK';
  startTime?: string;
  endTime?: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
}

export class AvailabilityRuleRepository {
  async create(input: CreateRuleInput): Promise<AvailabilityRule> {
    return prisma.availabilityRule.create({
      data: {
        resourceId: input.resourceId,
        weekday: input.weekday,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
        ...(input.effectiveFrom !== undefined && {
          effectiveFrom: input.effectiveFrom,
        }),
        ...(input.effectiveTo !== undefined && {
          effectiveTo: input.effectiveTo,
        }),
      },
    });
  }

  async findById(id: string): Promise<AvailabilityRule | null> {
    return prisma.availabilityRule.findUnique({ where: { id } });
  }

  async findByIdAndResource(
    id: string,
    resourceId: string,
  ): Promise<AvailabilityRule | null> {
    return prisma.availabilityRule.findFirst({
      where: { id, resourceId },
    });
  }

  async listByResource(resourceId: string): Promise<AvailabilityRule[]> {
    return prisma.availabilityRule.findMany({
      where: { resourceId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async update(
    id: string,
    input: UpdateRuleInput,
  ): Promise<AvailabilityRule> {
    return prisma.availabilityRule.update({
      where: { id },
      data: {
        ...(input.weekday !== undefined && { weekday: input.weekday }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.effectiveFrom !== undefined && {
          effectiveFrom: input.effectiveFrom,
        }),
        ...(input.effectiveTo !== undefined && {
          effectiveTo: input.effectiveTo,
        }),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.availabilityRule.delete({ where: { id } });
  }
}