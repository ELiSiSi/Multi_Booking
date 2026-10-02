import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../src/index.js';

describe('database client', () => {
  // ─────────────────────────────────────────────────────────
  // Setup / teardown
  // ─────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Make sure we can reach the database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test data before disconnecting
    await prisma.business.deleteMany({
      where: { owner: { email: { startsWith: 'test-' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'test-' } },
    });

    await prisma.$disconnect();
  });

  // ─────────────────────────────────────────────────────────
  // Connection
  // ─────────────────────────────────────────────────────────

  it('connects to PostgreSQL', async () => {
    const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    expect(result[0].result).toBe(1);
  });

  it('has the User table', async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('User', 'Business', '_prisma_migrations')
    `;
    const names = tables.map((t) => t.tablename).sort();
    expect(names).toEqual(['Business', 'User', '_prisma_migrations'].sort());
  });

  // ─────────────────────────────────────────────────────────
  // User CRUD
  // ─────────────────────────────────────────────────────────

  it('creates a User', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test-create@example.com',
        passwordHash: 'hash',
        fullName: 'Test User',
        role: 'admin',
      },
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test-create@example.com');
    expect(user.role).toBe('admin');
    expect(user.status).toBe('ACTIVE');
  });

  it('reads a User by email', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'test-create@example.com' },
    });
    expect(user).not.toBeNull();
    expect(user?.fullName).toBe('Test User');
  });

  it('rejects duplicate email (unique constraint)', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: 'test-create@example.com',
          passwordHash: 'hash',
          fullName: 'Duplicate',
          role: 'customer',
        },
      }),
    ).rejects.toThrow();
  });

  it('defaults role to customer when omitted', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test-default-role@example.com',
        passwordHash: 'hash',
        fullName: 'Default Role',
      },
    });
    expect(user.role).toBe('customer');
  });

  // ─────────────────────────────────────────────────────────
  // Business + relations
  // ─────────────────────────────────────────────────────────

  it('creates a Business owned by a User', async () => {
    const owner = await prisma.user.findUnique({
      where: { email: 'test-create@example.com' },
    });
    expect(owner).not.toBeNull();

    const business = await prisma.business.create({
      data: {
        ownerId: owner!.id,
        name: 'Test Clinic',
        timezone: 'Africa/Cairo',
        slotGranularityMinutes: 15,
        defaultBufferMinutes: 5,
      },
    });

    expect(business.id).toBeDefined();
    expect(business.ownerId).toBe(owner!.id);
    expect(business.timezone).toBe('Africa/Cairo');
    expect(business.slotGranularityMinutes).toBe(15);
    expect(business.defaultBufferMinutes).toBe(5);
  });

  it('loads a User with their Businesses (relation)', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'test-create@example.com' },
      include: { businesses: true },
    });

    expect(user).not.toBeNull();
    expect(user!.businesses.length).toBeGreaterThanOrEqual(1);
    expect(user!.businesses[0].name).toBe('Test Clinic');
  });

  it('applies Business default policy values', async () => {
    const owner = await prisma.user.findUnique({
      where: { email: 'test-default-role@example.com' },
    });

    const business = await prisma.business.create({
      data: {
        ownerId: owner!.id,
        name: 'Default Policy Business',
      },
    });

    expect(business.timezone).toBe('UTC');
    expect(business.slotGranularityMinutes).toBe(15);
    expect(business.defaultBufferMinutes).toBe(0);
    expect(business.pendingTimeoutMinutes).toBe(15);
    expect(business.cancellationWindowMinutes).toBe(120);
    expect(business.status).toBe('ACTIVE');
  });

  // ─────────────────────────────────────────────────────────
  // Cascade delete
  // ─────────────────────────────────────────────────────────

  it('cascades delete from User to their Businesses', async () => {
    const owner = await prisma.user.findUnique({
      where: { email: 'test-create@example.com' },
    });
    expect(owner).not.toBeNull();

    const before = await prisma.business.count({
      where: { ownerId: owner!.id },
    });
    expect(before).toBeGreaterThanOrEqual(1);

    await prisma.user.delete({ where: { id: owner!.id } });

    const after = await prisma.business.count({
      where: { ownerId: owner!.id },
    });
    expect(after).toBe(0);
  });

  // ─────────────────────────────────────────────────────────
  // Transaction support
  // ─────────────────────────────────────────────────────────

  it('supports transactions with rollback', async () => {
    const countBefore = await prisma.user.count();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            email: 'test-tx-rollback@example.com',
            passwordHash: 'hash',
            fullName: 'TX User',
          },
        });

        // Force a rollback
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    const countAfter = await prisma.user.count();
    expect(countAfter).toBe(countBefore);
  });
});