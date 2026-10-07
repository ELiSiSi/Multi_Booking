export { prisma } from './client.js';

export { Prisma, PrismaClient } from '@prisma/client';

export type {
  User,
  Business,
  RefreshToken,
  Location,
  Service,
  Resource,
  ServiceResource,
  AvailabilityRule,
  AvailabilityException,
  Booking,
  IdempotencyKey,
  AuditEvent,
  Role,
  UserStatus,
  BusinessStatus,
  AvailabilityRuleType,
  AvailabilityExceptionType,
  BookingStatus,
} from '@prisma/client';

// ─── Repositories & Locks ─────────────────────────────
export { advisoryLockIdFromResource, lockResource } from './locks.js';
export { PrismaBookingRepository } from './repositories/booking.repository.js';
export { PrismaAuditRepository } from './repositories/audit.repository.js';
export { PrismaBusinessRepository } from './repositories/business.repository.js';
export { PrismaUnitOfWork } from './unit-of-work.js';