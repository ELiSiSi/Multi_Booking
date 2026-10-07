import { redis } from '@reservio/redis';

import type { LocalDate, Slot } from '../domain/types.js';

const TTL_SECONDS = 90;

export interface CachedAvailability {
  timezone: string;
  date: LocalDate;
  slots: { startAt: string; endAt: string }[];
}

function buildKey(
  businessId: string,
  resourceId: string,
  serviceId: string,
  date: LocalDate,
): string {
  return `slots:${businessId}:${resourceId}:${serviceId}:${date}`;
}

export class AvailabilityCache {
  async get(
    businessId: string,
    resourceId: string,
    serviceId: string,
    date: LocalDate,
  ): Promise<CachedAvailability | null> {
    const key = buildKey(businessId, resourceId, serviceId, date);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as CachedAvailability;
    } catch {
      return null;
    }
  }

  async set(
    businessId: string,
    resourceId: string,
    serviceId: string,
    date: LocalDate,
    timezone: string,
    slots: Slot[],
  ): Promise<void> {
    const key = buildKey(businessId, resourceId, serviceId, date);
    const payload: CachedAvailability = {
      timezone,
      date,
      slots: slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
      })),
    };

    await redis.set(key, JSON.stringify(payload), 'EX', TTL_SECONDS);
  }

  async invalidateForResource(resourceId: string): Promise<void> {
    let cursor = '0';
    const pattern = `slots:*:${resourceId}:*`;

    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      if (batch.length > 0) {
        await redis.del(...batch);
      }
      cursor = next;
    } while (cursor !== '0');
  }

  async invalidateForService(serviceId: string): Promise<void> {
    let cursor = '0';
    const pattern = `slots:*:*:${serviceId}:*`;

    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      if (batch.length > 0) {
        await redis.del(...batch);
      }
      cursor = next;
    } while (cursor !== '0');
  }
}