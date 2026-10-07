import type { AuditRepositoryPort } from './audit-repository.port.js';
import type { BookingRepositoryPort } from './booking-repository.port.js';
import type { BusinessRepositoryPort } from './business-repository.port.js';

export interface TransactionContext {
  bookings: BookingRepositoryPort;
  businesses: BusinessRepositoryPort;
  audit: AuditRepositoryPort;
  lockResource(resourceId: string): Promise<void>;
}

export interface UnitOfWorkPort {
  run<T>(
    fn: (tx: TransactionContext) => Promise<T>,
  ): Promise<T>;
}