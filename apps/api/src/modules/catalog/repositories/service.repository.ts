import { prisma, type Service } from '@reservio/database';

import { decodeCursor, encodeCursor } from './_cursor.js';

export interface CreateServiceInput {
  locationId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  currency?: string;
}

export interface UpdateServiceInput {
  name?: string;
  durationMinutes?: number;
  priceCents?: number;
  currency?: string;
  isActive?: boolean;
}

export interface ListServicesOptions {
  cursor?: string;
  limit?: number;
}

export interface ListServicesResult {
  items: Service[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export class ServiceRepository {
  async create(input: CreateServiceInput): Promise<Service> {
    return prisma.service.create({
      data: {
        locationId: input.locationId,
        name: input.name,
        durationMinutes: input.durationMinutes,
        priceCents: input.priceCents,
        ...(input.currency !== undefined && { currency: input.currency }),
      },
    });
  }

  async findById(id: string): Promise<Service | null> {
    return prisma.service.findUnique({ where: { id } });
  }

  async findByIdAndLocation(
    id: string,
    locationId: string,
  ): Promise<Service | null> {
    return prisma.service.findFirst({
      where: { id, locationId },
    });
  }

  async existsByNameAndLocation(
    name: string,
    locationId: string,
  ): Promise<boolean> {
    const found = await prisma.service.findFirst({
      where: { name, locationId },
      select: { id: true },
    });
    return found !== null;
  }

  async listByLocation(
    locationId: string,
    options: ListServicesOptions = {},
  ): Promise<ListServicesResult> {
    const limit = clampLimit(options.limit);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const rows = await prisma.service.findMany({
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

  async update(id: string, input: UpdateServiceInput): Promise<Service> {
    return prisma.service.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.durationMinutes !== undefined && {
          durationMinutes: input.durationMinutes,
        }),
        ...(input.priceCents !== undefined && {
          priceCents: input.priceCents,
        }),
        ...(input.currency !== undefined && { currency: input.currency }),
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