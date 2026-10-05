import { prisma, type Resource } from '@reservio/database';

import { decodeCursor, encodeCursor } from './_cursor.js';

export interface CreateResourceInput {
  locationId: string;
  name: string;
  bufferMinutes?: number;
}

export interface UpdateResourceInput {
  name?: string;
  bufferMinutes?: number | null;
  isActive?: boolean;
}

export interface ListResourcesOptions {
  cursor?: string;
  limit?: number;
}

export interface ListResourcesResult {
  items: Resource[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export class ResourceRepository {
  async create(input: CreateResourceInput): Promise<Resource> {
    return prisma.resource.create({
      data: {
        locationId: input.locationId,
        name: input.name,
        ...(input.bufferMinutes !== undefined && {
          bufferMinutes: input.bufferMinutes,
        }),
      },
    });
  }

  async findById(id: string): Promise<Resource | null> {
    return prisma.resource.findUnique({ where: { id } });
  }

  async findByIdAndLocation(
    id: string,
    locationId: string,
  ): Promise<Resource | null> {
    return prisma.resource.findFirst({
      where: { id, locationId },
    });
  }

  async existsByNameAndLocation(
    name: string,
    locationId: string,
  ): Promise<boolean> {
    const found = await prisma.resource.findFirst({
      where: { name, locationId },
      select: { id: true },
    });
    return found !== null;
  }

  async listByLocation(
    locationId: string,
    options: ListResourcesOptions = {},
  ): Promise<ListResourcesResult> {
    const limit = clampLimit(options.limit);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const rows = await prisma.resource.findMany({
      where: {
        locationId,
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

  async update(id: string, input: UpdateResourceInput): Promise<Resource> {
    return prisma.resource.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bufferMinutes !== undefined && {
          bufferMinutes: input.bufferMinutes,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
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