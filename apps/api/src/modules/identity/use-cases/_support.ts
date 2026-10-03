import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

export type Role = 'admin' | 'customer';

export interface Actor {
  userId: string;
  role: Role;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export class AuthorizationPolicy {
  canAsAdmin(
    actor: Actor,
    businessId: string,
    ownedBusinessIds: Set<string>,
  ): boolean {
    return actor.role === 'admin' && ownedBusinessIds.has(businessId);
  }
}

export class Argon2PasswordHasher implements PasswordHasher {
  private readonly opts = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.opts);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}

const REFRESH_TOKEN_BYTES = 48;

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_S = REFRESH_TOKEN_TTL_MS / 1000;

export function generateRefreshToken(): {
  raw: string;
  hash: string;
  expiresAt: Date;
} {
  const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  const hash = sha256(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return { raw, hash, expiresAt };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
