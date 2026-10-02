import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seed — Phase 1 skeleton (no fixtures yet)');
  // Real seed data is added in Phase 3.
}

main()
  .catch((error: unknown) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });