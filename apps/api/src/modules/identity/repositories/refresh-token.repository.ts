import { prisma, type RefreshToken } from '@reservio/database';

export class RefreshTokenRotationConflictError extends Error {
  constructor() {
    super('Refresh token rotation conflict');
    this.name = 'RefreshTokenRotationConflictError';
  }
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
}

export interface RotateRefreshTokenInput {
  oldId: string;
  newToken: CreateRefreshTokenInput;
}

export class RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
      },
    });
  }

  async rotate(input: RotateRefreshTokenInput): Promise<RefreshToken> {
    return prisma.$transaction(async (tx) => {
      const newToken = await tx.refreshToken.create({
        data: {
          userId: input.newToken.userId,
          tokenHash: input.newToken.tokenHash,
          expiresAt: input.newToken.expiresAt,
          userAgent: input.newToken.userAgent,
        },
      });

      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: input.oldId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          replacedById: newToken.id,
        },
      });

      if (revoked.count !== 1) {
        throw new RefreshTokenRotationConflictError();
      }

      return newToken;
    });
  }

  async revoke(id: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
