const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Find lead by phone
  const lead = await p.lead.findUnique({
    where: { phone: '+14322342508' },
    select: { id: true, firstName: true, lastName: true, phone: true, status: true, assignedRepId: true, company: true }
  });
  console.log('Lead:', lead || 'NOT FOUND');

  if (lead) {
    // Check deal linked to this lead
    const deal = await p.deal.findFirst({ where: { leadId: lead.id }, select: { id: true, stage: true, stageLabel: true, assignedRepId: true, clientId: true, createdAt: true } });
    console.log('Deal by leadId:', deal || 'NONE');

    // Check conversation
    const conv = await p.conversation.findFirst({ where: { leadId: lead.id }, select: { id: true, leadId: true, assignedRepId: true } });
    console.log('Conversation:', conv || 'NONE');
  }

  // Check client by phone
  const client = await p.client.findFirst({ where: { phone: '+14322342508' } });
  console.log('Client by phone:', client ? { id: client.id, businessName: client.businessName, phone: client.phone } : 'NONE');
  if (client) {
    const deals = await p.deal.findMany({ where: { clientId: client.id }, select: { id: true, stage: true, leadId: true, assignedRepId: true } });
    console.log('Deals for client:', deals);
  }

  // Stuart's recent deals (last 5)
  const stuart = await p.user.findFirst({ where: { firstName: 'Stuart' } });
  if (stuart) {
    console.log('\nStuart ID:', stuart.id);
    const recentDeals = await p.deal.findMany({
      where: { assignedRepId: stuart.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, stage: true, stageLabel: true, createdAt: true, leadId: true, client: { select: { businessName: true } } }
    });
    console.log('Stuart recent deals:', JSON.stringify(recentDeals, null, 2));
  }

  await p.$disconnect();
})();
