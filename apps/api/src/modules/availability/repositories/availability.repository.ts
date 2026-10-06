import { prisma, type Prisma } from '@reservio/database';

import type { Weekday } from '../domain/_weekday.js';
import type {
  ActiveBooking,
  DateException,
  LocalDate,
  RecurringRule,
} from '../domain/types.js';

export interface CatalogContext {
  business: {
    id: string;
    timezone: string;
    slotGranularityMinutes: number;
    defaultBufferMinutes: number;
  };
  location: {
    id: string;
    timezone: string | null;
  };
  resource: {
    id: string;
    bufferMinutes: number | null;
  };
  service: {
    id: string;
    durationMinutes: number;
  };
}

type DbClient = typeof prisma | Prisma.TransactionClient;

export class AvailabilityRepository {
  async loadCatalogContext(
    businessId: string,
    locationId: string,
    resourceId: string,
    serviceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CatalogContext | null> {
    const client: DbClient = tx ?? prisma;

    const location = await client.location.findFirst({
      where: { id: locationId, businessId },
      include: { business: true },
    });

    if (!location) return null;

    const resource = await client.resource.findFirst({
      where: { id: resourceId, locationId },
    });

    if (!resource) return null;

    const service = await client.service.findFirst({
      where: { id: serviceId, locationId },
    });

    if (!service) return null;

    return {
      business: {
        id: location.business.id,
        timezone: location.business.timezone,
        slotGranularityMinutes: location.business.slotGranularityMinutes,
        defaultBufferMinutes: location.business.defaultBufferMinutes,
      },
      location: {
        id: location.id,
        timezone: location.timezone,
      },
      resource: {
        id: resource.id,
        bufferMinutes: resource.bufferMinutes,
      },
      service: {
        id: service.id,
        durationMinutes: service.durationMinutes,
      },
    };
  }

  async loadRules(
    resourceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RecurringRule[]> {
    const client: DbClient = tx ?? prisma;

    const rows = await client.availabilityRule.findMany({
      where: { resourceId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      weekday: r.weekday as Weekday,
      type: r.type,
      startTime: r.startTime,
      endTime: r.endTime,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
  }

  async loadExceptions(
    resourceId: string,
    date: LocalDate,
    tx?: Prisma.TransactionClient,
  ): Promise<DateException[]> {
    const client: DbClient = tx ?? prisma;
    const dateObj = new Date(`${date}T00:00:00.000Z`);

    const rows = await client.availabilityException.findMany({
      where: { resourceId, date: dateObj },
      orderBy: [{ startTime: 'asc' }],
    });

    return rows.map((e) => ({
      id: e.id,
      resourceId: e.resourceId,
      date: e.date,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
      reason: e.reason,
    }));
  }

  async loadActiveBookings(
    _resourceId: string,
    _from: Date,
    _to: Date,
    _tx?: Prisma.TransactionClient,
  ): Promise<ActiveBooking[]> {
    return [];
  }
}