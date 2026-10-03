import { type User } from '@reservio/database';

import type { PasswordHasher } from './_support.js';
import { EmailAlreadyRegisteredError } from './identity.errors.js';
import type { UserRepository } from '../repositories/user.repository.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  fullName: string;
}

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: RegisterUserInput): Promise<User> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.hasher.hash(input.password);

    try {
      return await this.users.create({
        email,
        passwordHash,
        fullName: input.fullName.trim(),
        role: 'customer',
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    );
  }
}
