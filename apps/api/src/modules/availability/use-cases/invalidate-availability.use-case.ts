import type { AvailabilityCache } from '../repositories/availability-cache.js';

export class InvalidateAvailabilityUseCase {
  constructor(private readonly availabilityCache: AvailabilityCache) {}

  async byResource(resourceId: string): Promise<void> {
    await this.availabilityCache.invalidateForResource(resourceId);
  }

  async byService(serviceId: string): Promise<void> {
    await this.availabilityCache.invalidateForService(serviceId);
  }
}