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
  Role,
  UserStatus,
  BusinessStatus,
  AvailabilityRuleType,
  AvailabilityExceptionType,
} from '@prisma/client';