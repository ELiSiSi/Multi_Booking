import { type User } from '@reservio/database';

import { generateRefreshToken, sha256 } from './_support.js';
import { InvalidRefreshTokenError } from './identity.errors.js';
import type { UserRepository } from '../repositories/user.repository.js';
import {
  RefreshTokenRotationConflictError,
  type RefreshTokenRepository,
} from '../repositories/refresh-token.repository.js';

export interface RefreshTokenInput {
  rawRefreshToken: string;
  userAgent?: string;
}

export interface RefreshTokenOutput {
  user: User;
  newRefreshToken: string;
}

export class RefreshTokenUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenOutput> {
    const presentedHash = sha256(input.rawRefreshToken);
    const stored = await this.refreshTokens.findByHash(presentedHash);

    if (!stored || stored.revokedAt !== null) {
      throw new InvalidRefreshTokenError();
    }

    if (stored.expiresAt <= new Date()) {
      throw new InvalidRefreshTokenError();
    }

    const user = await this.users.findById(stored.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new InvalidRefreshTokenError();
    }

    const next = generateRefreshToken();

    try {
      await this.refreshTokens.rotate({
        oldId: stored.id,
        newToken: {
          userId: user.id,
          tokenHash: next.hash,
          expiresAt: next.expiresAt,
          userAgent: input.userAgent,
        },
      });
    } catch (error) {
      if (error instanceof RefreshTokenRotationConflictError) {
        throw new InvalidRefreshTokenError();
      }
      throw error;
    }

    return {
      user,
      newRefreshToken: next.raw,
    };
  }
}
