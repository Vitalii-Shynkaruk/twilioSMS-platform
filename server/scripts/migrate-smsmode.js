const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  const old = await prisma.systemSetting.findUnique({ where: { key: 'testMode' } });
  const oldTwilio = await prisma.systemSetting.findUnique({ where: { key: 'twilioTestMode' } });
  
  let mode = 'live';
  if (old?.value === 'true' || old?.value === true) mode = 'simulation';
  else if (oldTwilio?.value === 'true' || oldTwilio?.value === true) mode = 'twilio_test';

  await prisma.systemSetting.upsert({
    where: { key: 'smsMode' },
    create: { key: 'smsMode', value: mode },
    update: { value: mode },
  });
  console.log('smsMode set to:', mode);

  await prisma.systemSetting.deleteMany({ where: { key: { in: ['testMode', 'twilioTestMode'] } } });
  console.log('Removed old testMode + twilioTestMode settings');

  await prisma.$disconnect();
}

migrate().catch(console.error);
