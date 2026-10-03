import { createHash, randomBytes } from 'node:crypto';

import { Argon2PasswordHasher } from './use-cases/_support.js';
import { RegisterUserUseCase } from './use-cases/register-user.use-case.js';
import { LoginUseCase } from './use-cases/login.use-case.js';
import { RefreshTokenUseCase } from './use-cases/refresh-token.use-case.js';
import { LogoutUseCase } from './use-cases/logout.use-case.js';
import { UserRepository } from './repositories/user.repository.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';

export interface IdentityModule {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  register: RegisterUserUseCase;
  login: LoginUseCase;
  refresh: RefreshTokenUseCase;
  logout: LogoutUseCase;
}

export async function buildIdentityModule(): Promise<IdentityModule> {
  const users = new UserRepository();
  const refreshTokens = new RefreshTokenRepository();
  const hasher = new Argon2PasswordHasher();

  // Precompute a dummy hash so login can run constant-time even
  // when the email does not exist.
  const dummyHash = createHash('sha256')
    .update(randomBytes(32))
    .digest('hex');
  const dummyArgonHash = await hasher.hash(dummyHash);

  return {
    users,
    refreshTokens,
    register: new RegisterUserUseCase(users, hasher),
    login: new LoginUseCase(users, hasher, dummyArgonHash),
    refresh: new RefreshTokenUseCase(users, refreshTokens),
    logout: new LogoutUseCase(refreshTokens),
  };
}
