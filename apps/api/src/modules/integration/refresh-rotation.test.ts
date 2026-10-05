import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@reservio/database';

import { Argon2PasswordHasher, generateRefreshToken } from '../identity/use-cases/_support.js';
import { InvalidRefreshTokenError } from '../identity/use-cases/identity.errors.js';
import { RefreshTokenUseCase } from '../identity/use-cases/refresh-token.use-case.js';
import { UserRepository } from '../identity/repositories/user.repository.js';
import { RefreshTokenRepository } from '../identity/repositories/refresh-token.repository.js';

const TEST_PREFIX = 'test-rotate-';

describe('RefreshTokenUseCase — concurrent rotation (integration)', () => {
  const users = new UserRepository();
  const tokens = new RefreshTokenRepository();
  const hasher = new Argon2PasswordHasher();
  const useCase = new RefreshTokenUseCase(users, tokens);

  let userId: string;
  let tokenId: string;
  let rawToken: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { startsWith: TEST_PREFIX } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_PREFIX } },
    });

    const user = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}${Date.now()}@example.com`,
        passwordHash: await hasher.hash('pw'),
        fullName: 'Rotate Test',
        role: 'customer',
        status: 'ACTIVE',
      },
    });
    userId = user.id;

    const fresh = generateRefreshToken();
    rawToken = fresh.raw;

    const row = await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: fresh.hash,
        expiresAt: fresh.expiresAt,
      },
    });
    tokenId = row.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { startsWith: TEST_PREFIX } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_PREFIX } },
    });
    await prisma.$disconnect();
  });

  it('two concurrent refreshes of the same token → only one succeeds', async () => {
    const results = await Promise.allSettled([
      useCase.execute({ rawRefreshToken: rawToken }),
      useCase.execute({ rawRefreshToken: rawToken }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('after the race: old token revoked, exactly one replacement exists', async () => {
    await Promise.allSettled([
      useCase.execute({ rawRefreshToken: rawToken }),
      useCase.execute({ rawRefreshToken: rawToken }),
    ]);

    const old = await prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });
    expect(old).not.toBeNull();
    expect(old!.revokedAt).not.toBeNull();
    expect(old!.replacedById).not.toBeNull();

    const all = await prisma.refreshToken.findMany({
      where: { userId },
    });
    expect(all).toHaveLength(2);
  });

  it('sequential refresh: second call with same token → INVALID_REFRESH_TOKEN', async () => {
    await useCase.execute({ rawRefreshToken: rawToken });

    await expect(
      useCase.execute({ rawRefreshToken: rawToken }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('the returned replacement token can be used for the next refresh', async () => {
    const { newRefreshToken } = await useCase.execute({
      rawRefreshToken: rawToken,
    });

    const second = await useCase.execute({
      rawRefreshToken: newRefreshToken,
    });

    expect(second.user.id).toBe(userId);
    expect(second.newRefreshToken).toBeTruthy();
  });

  it('10 concurrent refreshes → exactly 1 succeeds, 9 fail', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        useCase.execute({ rawRefreshToken: rawToken }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expect(
      rejected.every(
        (r) =>
          (r as PromiseRejectedResult).reason instanceof
          InvalidRefreshTokenError,
      ),
    ).toBe(true);
  });
});
