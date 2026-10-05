import { prisma, type Location } from '@reservio/database';

import { decodeCursor, encodeCursor } from './_cursor.js';

export interface CreateLocationInput {
  businessId: string;
  name: string;
  timezone?: string;
  address?: string;
}

export interface UpdateLocationInput {
  name?: string;
  timezone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface ListLocationsOptions {
  cursor?: string;
  limit?: number;
}

export interface ListLocationsResult {
  items: Location[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export class LocationRepository {
  async create(input: CreateLocationInput): Promise<Location> {
    return prisma.location.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.address !== undefined && { address: input.address }),
      },
    });
  }

  async findById(id: string): Promise<Location | null> {
    return prisma.location.findUnique({ where: { id } });
  }

  async findByIdAndBusiness(
    id: string,
    businessId: string,
  ): Promise<Location | null> {
    return prisma.location.findFirst({
      where: { id, businessId },
    });
  }

  async existsByNameAndBusiness(
    name: string,
    businessId: string,
  ): Promise<boolean> {
    const found = await prisma.location.findFirst({
      where: { name, businessId },
      select: { id: true },
    });
    return found !== null;
  }

  async listByBusiness(
    businessId: string,
    options: ListLocationsOptions = {},
  ): Promise<ListLocationsResult> {
    const limit = clampLimit(options.limit);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const rows = await prisma.location.findMany({
      where: {
        businessId,
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

  async update(id: string, input: UpdateLocationInput): Promise<Location> {
    return prisma.location.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.address !== undefined && { address: input.address }),
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