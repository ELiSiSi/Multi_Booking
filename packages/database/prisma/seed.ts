import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const SEED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@reservio.local';
const SEED_ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD ?? 'AdminPassword!123';

const SEED_CUSTOMER_EMAIL =
  process.env.SEED_CUSTOMER_EMAIL ?? 'customer@reservio.local';
const SEED_CUSTOMER_PASSWORD =
  process.env.SEED_CUSTOMER_PASSWORD ?? 'CustomerPassword!123';

function assertProductionSeedConfig(): void {
  if (!IS_PRODUCTION) return;

  if (!process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set when NODE_ENV=production',
    );
  }

  if (!process.env.SEED_CUSTOMER_PASSWORD) {
    throw new Error(
      'SEED_CUSTOMER_PASSWORD must be set when NODE_ENV=production',
    );
  }
}

async function upsertUser(
  email: string,
  password: string,
  fullName: string,
  role: 'admin' | 'customer',
): Promise<{ id: string }> {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, fullName, role, status: 'ACTIVE' },
    create: { email, passwordHash, fullName, role, status: 'ACTIVE' },
    select: { id: true },
  });
}

async function seedAdmin(): Promise<string> {
  const admin = await upsertUser(
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    'System Admin',
    'admin',
  );
  return admin.id;
}

async function seedCustomer(): Promise<string> {
  const customer = await upsertUser(
    SEED_CUSTOMER_EMAIL,
    SEED_CUSTOMER_PASSWORD,
    'Sample Customer',
    'customer',
  );
  return customer.id;
}

// Mon–Fri 09:00–17:00 with a 13:00–14:00 lunch break.
async function seedWeekdayRules(resourceId: string): Promise<void> {
  const weekdays = [1, 2, 3, 4, 5];

  for (const weekday of weekdays) {
    await prisma.availabilityRule.create({
      data: {
        resourceId,
        weekday,
        type: 'OPEN',
        startTime: '09:00',
        endTime: '17:00',
      },
    });

    await prisma.availabilityRule.create({
      data: {
        resourceId,
        weekday,
        type: 'BREAK',
        startTime: '13:00',
        endTime: '14:00',
      },
    });
  }
}

async function seedSalon(ownerId: string): Promise<void> {
  const existing = await prisma.business.findFirst({
    where: { ownerId, name: 'Demo Salon' },
  });

  if (existing) {
    console.log('   ↳ Demo Salon already exists — skipping');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        ownerId,
        name: 'Demo Salon',
        timezone: 'Africa/Cairo',
        slotGranularityMinutes: 15,
        defaultBufferMinutes: 0,
      },
    });

    const location = await tx.location.create({
      data: {
        businessId: business.id,
        name: 'Main Branch',
        address: '12 Nile Street, Cairo',
      },
    });

    const haircut = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Haircut',
        durationMinutes: 30,
        priceCents: 15000,
        currency: 'EGP',
      },
    });

    const beardTrim = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Beard Trim',
        durationMinutes: 15,
        priceCents: 5000,
        currency: 'EGP',
      },
    });

    const ahmed = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Ahmed',
        bufferMinutes: 5,
      },
    });

    const mohamed = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Mohamed',
      },
    });

    await tx.serviceResource.createMany({
      data: [
        { serviceId: haircut.id, resourceId: ahmed.id },
        { serviceId: haircut.id, resourceId: mohamed.id },
        { serviceId: beardTrim.id, resourceId: ahmed.id },
      ],
    });
  });

  const business = await prisma.business.findFirstOrThrow({
    where: { ownerId, name: 'Demo Salon' },
    include: { locations: { include: { resources: true } } },
  });

  for (const location of business.locations) {
    for (const resource of location.resources) {
      await seedWeekdayRules(resource.id);
    }
  }

  console.log(
    '   ↳ Demo Salon: 1 location, 2 services, 2 resources, 3 assignments, weekday rules',
  );
}

async function seedClinic(ownerId: string): Promise<void> {
  const existing = await prisma.business.findFirst({
    where: { ownerId, name: 'Demo Clinic' },
  });

  if (existing) {
    console.log('   ↳ Demo Clinic already exists — skipping');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        ownerId,
        name: 'Demo Clinic',
        timezone: 'Africa/Cairo',
        slotGranularityMinutes: 30,
        defaultBufferMinutes: 10,
        pendingTimeoutMinutes: 20,
        cancellationWindowMinutes: 240,
      },
    });

    const location = await tx.location.create({
      data: {
        businessId: business.id,
        name: 'Giza Branch',
        address: '45 El-Haram Street, Giza',
        timezone: 'Africa/Cairo',
      },
    });

    const checkup = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'General Checkup',
        durationMinutes: 30,
        priceCents: 30000,
        currency: 'EGP',
      },
    });

    const dentalCleaning = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Dental Cleaning',
        durationMinutes: 45,
        priceCents: 50000,
        currency: 'EGP',
      },
    });

    const consultation = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Specialist Consultation',
        durationMinutes: 60,
        priceCents: 80000,
        currency: 'EGP',
      },
    });

    const drHassan = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Dr. Hassan',
        bufferMinutes: 15,
      },
    });

    const drLayla = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Dr. Layla',
      },
    });

    await tx.serviceResource.createMany({
      data: [
        { serviceId: checkup.id, resourceId: drHassan.id },
        { serviceId: checkup.id, resourceId: drLayla.id },
        { serviceId: consultation.id, resourceId: drHassan.id },
        { serviceId: consultation.id, resourceId: drLayla.id },
        { serviceId: dentalCleaning.id, resourceId: drLayla.id },
      ],
    });
  });

  const business = await prisma.business.findFirstOrThrow({
    where: { ownerId, name: 'Demo Clinic' },
    include: { locations: { include: { resources: true } } },
  });

  for (const location of business.locations) {
    for (const resource of location.resources) {
      await seedWeekdayRules(resource.id);
    }
  }

  console.log(
    '   ↳ Demo Clinic: 1 location, 3 services, 2 resources, 5 assignments, weekday rules',
  );
}

async function seedSportsCenter(ownerId: string): Promise<void> {
  const existing = await prisma.business.findFirst({
    where: { ownerId, name: 'Demo Sports Center' },
  });

  if (existing) {
    console.log('   ↳ Demo Sports Center already exists — skipping');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        ownerId,
        name: 'Demo Sports Center',
        timezone: 'Africa/Cairo',
        slotGranularityMinutes: 30,
        defaultBufferMinutes: 5,
      },
    });

    const location = await tx.location.create({
      data: {
        businessId: business.id,
        name: 'Nasr City Branch',
        address: '8 Abbas El-Akkad, Nasr City, Cairo',
      },
    });

    const tennisCourt = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Tennis Court Rental',
        durationMinutes: 60,
        priceCents: 20000,
        currency: 'EGP',
      },
    });

    const personalTraining = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Personal Training',
        durationMinutes: 60,
        priceCents: 35000,
        currency: 'EGP',
      },
    });

    const yogaClass = await tx.service.create({
      data: {
        locationId: location.id,
        name: 'Yoga Class',
        durationMinutes: 90,
        priceCents: 12000,
        currency: 'EGP',
      },
    });

    const courtA = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Court A',
        bufferMinutes: 10,
      },
    });

    const courtB = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Court B',
      },
    });

    const coachOmar = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Coach Omar',
      },
    });

    const studioRoom = await tx.resource.create({
      data: {
        locationId: location.id,
        name: 'Studio Room',
      },
    });

    await tx.serviceResource.createMany({
      data: [
        { serviceId: tennisCourt.id, resourceId: courtA.id },
        { serviceId: tennisCourt.id, resourceId: courtB.id },
        { serviceId: personalTraining.id, resourceId: coachOmar.id },
        { serviceId: yogaClass.id, resourceId: studioRoom.id },
      ],
    });
  });

  const business = await prisma.business.findFirstOrThrow({
    where: { ownerId, name: 'Demo Sports Center' },
    include: { locations: { include: { resources: true } } },
  });

  for (const location of business.locations) {
    for (const resource of location.resources) {
      await seedWeekdayRules(resource.id);
    }
  }

  console.log(
    '   ↳ Demo Sports Center: 1 location, 3 services, 4 resources, 4 assignments, weekday rules',
  );
}

async function main(): Promise<void> {
  assertProductionSeedConfig();

  console.log('🌱 Seeding database...');

  console.log('👤 Creating users...');
  const adminId = await seedAdmin();
  const customerId = await seedCustomer();
  console.log(`   ↳ admin:    ${SEED_ADMIN_EMAIL} (id: ${adminId})`);
  console.log(`   ↳ customer: ${SEED_CUSTOMER_EMAIL} (id: ${customerId})`);

  console.log('🏢 Creating sample verticals...');
  await seedSalon(adminId);
  await seedClinic(adminId);
  await seedSportsCenter(adminId);

  console.log('✅ Seed complete.\n');

  if (!IS_PRODUCTION) {
    console.log('Credentials (development only):');
    console.log(
      `   Admin    → email: ${SEED_ADMIN_EMAIL}, password: ${SEED_ADMIN_PASSWORD}`,
    );
    console.log(
      `   Customer → email: ${SEED_CUSTOMER_EMAIL}, password: ${SEED_CUSTOMER_PASSWORD}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });