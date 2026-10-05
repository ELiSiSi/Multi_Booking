import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@reservio/database';

import { buildApp } from '../src/app.js';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

const TEST_PASSWORD = 'TestPassword!123';

let app: FastifyInstance;
let adminA: TestUser;
let adminB: TestUser;
let customer: TestUser;

async function registerAndLogin(
  email: string,
  role: 'admin' | 'customer',
): Promise<TestUser> {
  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: TEST_PASSWORD,
      fullName: role === 'admin' ? 'Admin User' : 'Customer User',
    },
  });

  expect(registerRes.statusCode).toBe(201);

  const registerBody = registerRes.json() as {
    user: { id: string };
  };

  const userId = registerBody.user.id;

  if (role === 'admin') {
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });
  }

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: TEST_PASSWORD },
  });

  expect(loginRes.statusCode).toBe(200);

  const loginBody = loginRes.json() as {
    accessToken: string; user: { id: string };
  };

  return {
    id: userId,
    email,
    accessToken: loginBody.accessToken,
  };
}

function authHeader(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.accessToken}` };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const stamp = Date.now();

  adminA = await registerAndLogin(`admin-a-${stamp}@test.local`, 'admin');
  adminB = await registerAndLogin(`admin-b-${stamp}@test.local`, 'admin');
  customer = await registerAndLogin(`customer-${stamp}@test.local`, 'customer');
});

afterAll(async () => {
  await prisma.business.deleteMany({
    where: { ownerId: { in: [adminA.id, adminB.id] } },
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: { in: [adminA.id, adminB.id, customer.id] } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: [adminA.id, adminB.id, customer.id] } },
  });

  await app.close();
  await prisma.$disconnect();
});

describe('POST /businesses', () => {
  it('creates a business as admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: 'Alpha Salon' },
    });

    expect(res.statusCode).toBe(201);

    const body = res.json() as {
      data: { id: string; name: string; ownerId: string };
    };

    expect(body.data.name).toBe('Alpha Salon');
    expect(body.data.ownerId).toBe(adminA.id);
  });

  it('rejects creation by a customer (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(customer),
      payload: { name: 'Customer Biz' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects creation without authentication (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      payload: { name: 'Anon Biz' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a duplicate name for the same owner (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: 'Alpha Salon' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('allows different owners to use the same name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminB),
      payload: { name: 'Alpha Salon' },
    });

    expect(res.statusCode).toBe(201);
  });

  it('rejects an empty name (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('applies custom scheduling policy fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: {
        name: 'Beta Spa',
        timezone: 'Africa/Cairo',
        slotGranularityMinutes: 30,
        defaultBufferMinutes: 10,
      },
    });

    expect(res.statusCode).toBe(201);

    const body = res.json() as {
      data: {
        timezone: string;
        slotGranularityMinutes: number;
        defaultBufferMinutes: number;
      };
    };

    expect(body.data.timezone).toBe('Africa/Cairo');
    expect(body.data.slotGranularityMinutes).toBe(30);
    expect(body.data.defaultBufferMinutes).toBe(10);
  });
});

describe('GET /businesses/mine', () => {
  it('returns only businesses owned by the caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/businesses/mine',
      headers: authHeader(adminA),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      data: Array<{ ownerId: string; name: string }>;
    };

    expect(body.data.length).toBeGreaterThan(0);
    for (const biz of body.data) {
      expect(biz.ownerId).toBe(adminA.id);
    }
  });

  it("does not leak another admin's businesses", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/businesses/mine',
      headers: authHeader(adminB),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      data: Array<{ ownerId: string; name: string }>;
    };

    for (const biz of body.data) {
      expect(biz.ownerId).toBe(adminB.id);
    }
  });

  it('returns an empty list for an admin with no businesses', async () => {
    const stamp = Date.now();
    const lonely = await registerAndLogin(
      `lonely-${stamp}@test.local`,
      'admin',
    );

    const res = await app.inject({
      method: 'GET',
      url: '/businesses/mine',
      headers: authHeader(lonely),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: unknown[] };
    expect(body.data).toEqual([]);

    await prisma.refreshToken.deleteMany({ where: { userId: lonely.id } });
    await prisma.user.delete({ where: { id: lonely.id } });
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/businesses/mine',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /businesses/:id', () => {
  it('updates a business owned by the caller', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: 'Gamma Studio' },
    });

    const created = createRes.json() as { data: { id: string } };

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${created.data.id}`,
      headers: authHeader(adminA),
      payload: { name: 'Gamma Studio Updated' },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: { name: string } };
    expect(body.data.name).toBe('Gamma Studio Updated');
  });

  it('rejects cross-owner update (404, not 403)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: 'Delta Shop' },
    });

    const created = createRes.json() as { data: { id: string } };

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${created.data.id}`,
      headers: authHeader(adminB),
      payload: { name: 'Hijacked' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown business id (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/businesses/00000000-0000-0000-0000-000000000000',
      headers: authHeader(adminA),
      payload: { name: 'Ghost' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects an empty update body (400)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: 'Epsilon Co' },
    });

    const created = createRes.json() as { data: { id: string } };

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${created.data.id}`,
      headers: authHeader(adminA),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a customer update (403)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/businesses',
      headers: authHeader(adminA),
      payload: { name: 'Zeta Bar' },
    });

    const created = createRes.json() as { data: { id: string } };

    const res = await app.inject({
      method: 'PATCH',
      url: `/businesses/${created.data.id}`,
      headers: authHeader(customer),
      payload: { name: 'Nope' },
    });

    expect(res.statusCode).toBe(403);
  });
});