import { createHash } from 'node:crypto';

export function advisoryLockIdFromResource(resourceId: string): bigint {
  const hash = createHash('sha256').update(resourceId).digest();
  const high = hash.readBigInt64BE(0);
  return high < 0n ? -high : high;
}