import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

/**
 * Derives a stable bigint lock id from a resource UUID.
 * The same algorithm must be used by the API route handlers and
 * the Worker so both sides compete for the same PostgreSQL
 * advisory lock.
 */
export function advisoryLockIdFromResource(resourceId: string): bigint {
  const hash = createHash('sha256').update(resourceId).digest();
  const high = hash.readBigInt64BE(0);
  return high < 0n ? -high : high;
}

/**
 * Acquires a transaction-scoped PostgreSQL advisory lock on the
 * given resource. Released automatically when the surrounding
 * transaction commits or rolls back.
 */
export async function lockResource(
  tx: Prisma.TransactionClient,
  resourceId: string,
): Promise<void> {
  const lockId = advisoryLockIdFromResource(resourceId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
}