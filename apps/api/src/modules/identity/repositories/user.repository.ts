import { prisma, type User, type Role } from '@reservio/database';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  role?: Role;
}

export class UserRepository {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { email } });
    return count > 0;
  }

  create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        role: input.role ?? 'customer',
      },
    });
  }

  async ownedBusinessIds(userId: string): Promise<Set<string>> {
    const rows = await prisma.business.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}
