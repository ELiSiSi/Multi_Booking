import { createHash } from 'node:crypto';

import {
  prisma,
  Prisma,
  type IdempotencyKey,
} from '@reservio/database';

export interface CreateIdempotencyRecordInput {
  key: string;
  actorId: string;
  endpoint: string;
  requestHash: string;
  responseBody: unknown;
  statusCode: number;
}

function lockIdFromActorAndKey(actorId: string, key: string): bigint {
  const hash = createHash('sha256').update(`${actorId}:${key}`).digest();
  const high = hash.readBigInt64BE(0);
  return high < 0n ? -high : high;
}

export class IdempotencyRepository {
  async findByActorAndKey(
    actorId: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return prisma.idempotencyKey.findUnique({
      where: { actorId_key: { actorId, key } },
    });
  }

  async create(
    input: CreateIdempotencyRecordInput,
  ): Promise<IdempotencyKey> {
    return prisma.idempotencyKey.create({
      data: {
        key: input.key,
        actorId: input.actorId,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        responseBody: input.responseBody as object,
        statusCode: input.statusCode,
      },
    });
  }

  async findByActorAndKeyTx(
    tx: Prisma.TransactionClient,
    actorId: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return tx.idempotencyKey.findUnique({
      where: { actorId_key: { actorId, key } },
    });
  }

  async createTx(
    tx: Prisma.TransactionClient,
    input: CreateIdempotencyRecordInput,
  ): Promise<IdempotencyKey> {
    return tx.idempotencyKey.create({
      data: {
        key: input.key,
        actorId: input.actorId,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        responseBody: input.responseBody as object,
        statusCode: input.statusCode,
      },
    });
  }

  async runExclusive<T>(
    actorId: string,
    key: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const lockId = lockIdFromActorAndKey(actorId, key);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
      return fn(tx);
    });
  }
}