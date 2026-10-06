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