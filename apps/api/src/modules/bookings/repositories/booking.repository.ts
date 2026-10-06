import { prisma, type Booking, type BookingStatus } from '@reservio/database';

import { decodeCursor, encodeCursor } from '../../catalog/repositories/_cursor.js';
import { ACTIVE_BOOKING_STATUSES } from '../domain/booking-status.js';

export interface CreateBookingRecordInput {
  businessId: string;
  locationId: string;
  resourceId: string;
  serviceId: string;
  customerId: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  currency: string;
}

export interface TransitionUpdateInput {
  status: BookingStatus;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
}

export interface ListResult {
  items: Booking[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

function clampLimit(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (raw < MIN_LIMIT) return MIN_LIMIT;
  if (raw > MAX_LIMIT) return MAX_LIMIT;
  return raw;
}

export class BookingRepository {
  async create(input: CreateBookingRecordInput): Promise<Booking> {
    return prisma.booking.create({
      data: {
        businessId: input.businessId,
        locationId: input.locationId,
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        customerId: input.customerId,
        startAt: input.startAt,
        endAt: input.endAt,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        priceCents: input.priceCents,
        currency: input.currency,
      },
    });
  }

  async findById(id: string): Promise<Booking | null> {
    return prisma.booking.findUnique({ where: { id } });
  }

  async findByIdAndCustomer(
    id: string,
    customerId: string,
  ): Promise<Booking | null> {
    return prisma.booking.findFirst({ where: { id, customerId } });
  }

  async findByIdAndBusiness(
    id: string,
    businessId: string,
  ): Promise<Booking | null> {
    return prisma.booking.findFirst({ where: { id, businessId } });
  }

  async findActiveInRange(
    resourceId: string,
    from: Date,
    to: Date,
    excludeBookingId?: string,
  ): Promise<Booking[]> {
    return prisma.booking.findMany({
      where: {
        resourceId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(excludeBookingId && { id: { not: excludeBookingId } }),
      },
      orderBy: [{ startAt: 'asc' }],
    });
  }

  async listByCustomer(
    customerId: string,
    options: ListOptions = {},
  ): Promise<ListResult> {
    const limit = clampLimit(options.limit);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const rows = await prisma.booking.findMany({
      where: {
        customerId,
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

  async listByBusiness(
    businessId: string,
    options: ListOptions = {},
  ): Promise<ListResult> {
    const limit = clampLimit(options.limit);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;

    const rows = await prisma.booking.findMany({
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

  async transition(
    id: string,
    fromStatus: BookingStatus,
    input: TransitionUpdateInput,
  ): Promise<Booking | null> {
    const result = await prisma.booking.updateMany({
      where: { id, status: fromStatus },
      data: {
        status: input.status,
        ...(input.cancelledAt !== undefined && {
          cancelledAt: input.cancelledAt,
        }),
        ...(input.cancellationReason !== undefined && {
          cancellationReason: input.cancellationReason,
        }),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return prisma.booking.findUnique({ where: { id } });
  }

  async findPendingExpiredBefore(before: Date): Promise<Booking[]> {
    return prisma.booking.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: before },
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 100,
    });
  }

  async findConfirmedStartingBetween(
    from: Date,
    to: Date,
  ): Promise<Booking[]> {
    return prisma.booking.findMany({
      where: {
        status: 'confirmed',
        startAt: { gte: from, lte: to },
      },
      orderBy: [{ startAt: 'asc' }],
      take: 500,
    });
  }
}