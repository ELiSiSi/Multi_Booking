import { createHash } from 'node:crypto';

import type { Prisma } from '@reservio/database';

import type { IdempotencyRepository } from '../repositories/idempotency.repository.js';
import type { CreateBookingUseCase } from './create-booking.use-case.js';
import { IdempotencyConflictError } from './booking.errors.js';

export interface ExecuteWithIdempotencyInput {
  actorId: string;
  idempotencyKey: string;
  endpoint: string;
  requestBody: unknown;
  handler: (
    tx: Prisma.TransactionClient,
  ) => Promise<{ statusCode: number; body: unknown }>;
}

export interface ExecuteWithIdempotencyOutput {
  statusCode: number;
  body: unknown;
  replayed: boolean;
}

function hashBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex');
}

export class IdempotencyService {
  constructor(private readonly idempotencyRepository: IdempotencyRepository) {}

  async execute(
    input: ExecuteWithIdempotencyInput,
  ): Promise<ExecuteWithIdempotencyOutput> {
    const requestHash = hashBody(input.requestBody);

    return this.idempotencyRepository.runExclusive(
      input.actorId,
      input.idempotencyKey,
      async (tx) => {
        const existing = await this.idempotencyRepository.findByActorAndKeyTx(
          tx,
          input.actorId,
          input.idempotencyKey,
        );

        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new IdempotencyConflictError();
          }
          return {
            statusCode: existing.statusCode,
            body: existing.responseBody,
            replayed: true,
          };
        }

        const result = await input.handler(tx);

        await this.idempotencyRepository.createTx(tx, {
          key: input.idempotencyKey,
          actorId: input.actorId,
          endpoint: input.endpoint,
          requestHash,
          responseBody: result.body,
          statusCode: result.statusCode,
        });

        return {
          statusCode: result.statusCode,
          body: result.body,
          replayed: false,
        };
      },
    );
  }
}

export type { CreateBookingUseCase };