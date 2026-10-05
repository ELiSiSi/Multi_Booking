import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@reservio/database';

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

export interface TestBusiness {
  id: string;
}

export interface TestLocation {
  id: string;
}

export interface TestService {
  id: string;
}

export interface TestResource {
  id: string;
}

export const TEST_PASSWORD = 'TestPassword!123';

export interface CatalogFixtures {
  adminA: TestUser;
  adminB: TestUser;
  customer: TestUser;
  businessA: TestBusiness;
  businessB: TestBusiness;
  locationA: TestLocation;
  locationB: TestLocation;
  serviceA1: TestService;
  serviceB1: TestService;
  resourceA1: TestResource;
  resourceB1: TestResource;
}

export function authHeader(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.accessToken}` };
}

async function registerAndLogin(
  app: FastifyInstance,
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

  const userId = (registerRes.json() as { user: { id: string } }).user.id;

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

  const accessToken = (loginRes.json() as { accessToken: string }).accessToken;

  return { id: userId, email, accessToken };
}

export async function buildFixtures(
  app: FastifyInstance,
  suffix: string,
): Promise<CatalogFixtures> {
  const stamp = `${Date.now()}-${suffix}`;

  const adminA = await registerAndLogin(app, `adm-a-${stamp}@test.local`, 'admin');
  const adminB = await registerAndLogin(app, `adm-b-${stamp}@test.local`, 'admin');
  const customer = await registerAndLogin(app, `cust-${stamp}@test.local`, 'customer');

  const bizARes = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(adminA),
    payload: { name: `Biz A ${stamp}` },
  });
  expect(bizARes.statusCode).toBe(201);
  const businessA = bizARes.json().data as TestBusiness;

  const bizBRes = await app.inject({
    method: 'POST',
    url: '/businesses',
    headers: authHeader(adminB),
    payload: { name: `Biz B ${stamp}` },
  });
  expect(bizBRes.statusCode).toBe(201);
  const businessB = bizBRes.json().data as TestBusiness;

  const locARes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessA.id}/locations`,
    headers: authHeader(adminA),
    payload: { name: 'Main A' },
  });
  expect(locARes.statusCode).toBe(201);
  const locationA = locARes.json().data as TestLocation;

  const locBRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessB.id}/locations`,
    headers: authHeader(adminB),
    payload: { name: 'Main B' },
  });
  expect(locBRes.statusCode).toBe(201);
  const locationB = locBRes.json().data as TestLocation;

  const svcARes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessA.id}/locations/${locationA.id}/services`,
    headers: authHeader(adminA),
    payload: { name: 'Svc A1', durationMinutes: 30, priceCents: 10000 },
  });
  expect(svcARes.statusCode).toBe(201);
  const serviceA1 = svcARes.json().data as TestService;

  const svcBRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessB.id}/locations/${locationB.id}/services`,
    headers: authHeader(adminB),
    payload: { name: 'Svc B1', durationMinutes: 30, priceCents: 10000 },
  });
  expect(svcBRes.statusCode).toBe(201);
  const serviceB1 = svcBRes.json().data as TestService;

  const resARes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessA.id}/locations/${locationA.id}/resources`,
    headers: authHeader(adminA),
    payload: { name: 'Res A1' },
  });
  expect(resARes.statusCode).toBe(201);
  const resourceA1 = resARes.json().data as TestResource;

  const resBRes = await app.inject({
    method: 'POST',
    url: `/businesses/${businessB.id}/locations/${locationB.id}/resources`,
    headers: authHeader(adminB),
    payload: { name: 'Res B1' },
  });
  expect(resBRes.statusCode).toBe(201);
  const resourceB1 = resBRes.json().data as TestResource;

  return {
    adminA,
    adminB,
    customer,
    businessA,
    businessB,
    locationA,
    locationB,
    serviceA1,
    serviceB1,
    resourceA1,
    resourceB1,
  };
}

export async function cleanupFixtures(f: CatalogFixtures): Promise<void> {
  const businessIds = [f.businessA.id, f.businessB.id];

  await prisma.serviceResource.deleteMany({
    where: { service: { location: { businessId: { in: businessIds } } } },
  });
  await prisma.service.deleteMany({
    where: { location: { businessId: { in: businessIds } } },
  });
  await prisma.resource.deleteMany({
    where: { location: { businessId: { in: businessIds } } },
  });
  await prisma.location.deleteMany({
    where: { businessId: { in: businessIds } },
  });
  await prisma.business.deleteMany({
    where: { id: { in: businessIds } },
  });

  const userIds = [f.adminA.id, f.adminB.id, f.customer.id];

  await prisma.refreshToken.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
}