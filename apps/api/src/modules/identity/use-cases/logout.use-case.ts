import { sha256 } from './_support.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';

export interface LogoutInput {
  rawRefreshToken?: string;
}

export class LogoutUseCase {
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  async execute(input: LogoutInput): Promise<void> {
    if (!input.rawRefreshToken) return;

    const hash = sha256(input.rawRefreshToken);
    const stored = await this.refreshTokens.findByHash(hash);

    if (stored && stored.revokedAt === null) {
      await this.refreshTokens.revoke(stored.id);
    }
  }
}
