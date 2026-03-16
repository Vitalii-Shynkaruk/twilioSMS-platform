import prisma from '../src/config/database';

// Disconnect Prisma after ALL tests
export async function teardown() {
  await prisma.$disconnect();
}
