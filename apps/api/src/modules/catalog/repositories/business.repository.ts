import { prisma, type Business } from '@reservio/database';

import { decodeCursor, encodeCursor } from './_cursor.js';

export interface CreateBusinessInput {
  ownerId: string;
  name: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
}

export interface UpdateBusinessInput {
  name?: string;
  timezone?: string;
  slotGranularityMinutes?: number;
  defaultBufferMinutes?: number;
  pendingTimeoutMinutes?: number;
  cancellationWindowMinutes?: number;
}

export interface ListBusinessesOptions {
  cursor?: string;
  limit?: number;
}

export interface ListBusinessesResult {
  items: Business[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export class BusinessRepository {
  async create(input: CreateBusinessInput): Promise<Business> {
    return prisma.business.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.slotGranularityMinutes !== undefined && {
          slotGranularityMinutes: input.slotGranularityMinutes,
        }),
        ...(input.defaultBufferMinutes !== undefined && {
          defaultBufferMinutes: input.defaultBufferMinutes,
        }),
        ...(input.pendingTimeoutMinutes !== undefined && {
          pendingTimeoutMinutes: input.pendingTimeoutMinutes,
        }),
        ...(input.cancellationWindowMinutes !== undefined && {
          cancellationWindowMinutes: input.cancellationWindowMinutes,
        }),
      },
    });
  }

  async findById(id: string): Promise<Business | null> {
    return prisma.business.findUnique({ where: { id } });
  }

  async findByIdAndOwner(
    id: string,
    ownerId: string,
  ): Promise<Business | null> {
    return prisma.business.findFirst({
      where: { id, ownerId },
    });
  }

  async existsByNameAndOwner(
    name: string,
    ownerId: string,
  ): Promise<boolean> {
    const found = await prisma.business.findFirst({
      where: { name, ownerId },
      select: { id: true },
    });
    return found !== null;
  }

  async listByOwner(
    ownerId: string,
    options: ListBusinessesOptions = {},
  ): Promise<ListBusinessesResult> {
    const limit = clampLimit(options.limit);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const rows = await prisma.business.findMany({
      where: {
        ownerId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              id: { lt: cursor.id },
            },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  async update(id: string, input: UpdateBusinessInput): Promise<Business> {
    return prisma.business.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.slotGranularityMinutes !== undefined && {
          slotGranularityMinutes: input.slotGranularityMinutes,
        }),
        ...(input.defaultBufferMinutes !== undefined && {
          defaultBufferMinutes: input.defaultBufferMinutes,
        }),
        ...(input.pendingTimeoutMinutes !== undefined && {
          pendingTimeoutMinutes: input.pendingTimeoutMinutes,
        }),
        ...(input.cancellationWindowMinutes !== undefined && {
          cancellationWindowMinutes: input.cancellationWindowMinutes,
        }),
      },
    });
  }
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (raw < MIN_LIMIT) return MIN_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return raw;
}