import { type User } from '@reservio/database';

import type { PasswordHasher } from './_support.js';
import { InvalidCredentialsError } from './identity.errors.js';
import type { UserRepository } from '../repositories/user.repository.js';

export interface LoginInput {
  email: string;
  password: string;
}

export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly dummyHash: string,
  ) {}

  async execute(input: LoginInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    const ok = user
      ? await this.hasher.verify(input.password, user.passwordHash)
      : await this.hasher.verify(input.password, this.dummyHash);

    if (!user || !ok || user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    return user;
  }
}
