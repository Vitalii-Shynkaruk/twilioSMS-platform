const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Find conversation for Alexis Fouonji
  const conv = await p.conversation.findFirst({
    where: { contactPhone: { contains: '14322342508' } },
    include: { lead: { select: { id: true, firstName: true, lastName: true, phone: true, status: true, assignedRepId: true, company: true } } }
  });
  console.log('Conversation:', conv ? { id: conv.id, leadId: conv.leadId, contactPhone: conv.contactPhone, assignedRepId: conv.assignedRepId } : 'NOT FOUND');
  console.log('Lead:', conv?.lead || 'NULL');

  if (conv?.lead) {
    // Check if deal exists for this lead
    const deal = await p.deal.findFirst({ where: { leadId: conv.lead.id } });
    console.log('Deal by leadId:', deal ? { id: deal.id, stage: deal.stage, assignedRepId: deal.assignedRepId } : 'NONE');

    // Check by phone
    const client = await p.client.findFirst({ where: { phone: conv.contactPhone } });
    console.log('Client by phone:', client ? { id: client.id, businessName: client.businessName } : 'NONE');
    if (client) {
      const dealByClient = await p.deal.findFirst({ where: { clientId: client.id } });
      console.log('Deal by client:', dealByClient ? { id: dealByClient.id, stage: dealByClient.stage } : 'NONE');
    }
  }

  // Also check if conversation has leadId at all
  const convNoLead = await p.conversation.findFirst({
    where: { contactPhone: { contains: '14322342508' } },
    select: { id: true, leadId: true, contactPhone: true }
  });
  console.log('\nRaw conversation leadId:', convNoLead?.leadId);

  // Check Stuart's recent deals
  const stuart = await p.user.findFirst({ where: { firstName: 'Stuart' } });
  if (stuart) {
    const recentDeals = await p.deal.findMany({
      where: { assignedRepId: stuart.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, stage: true, createdAt: true, client: { select: { businessName: true } }, leadId: true }
    });
    console.log('\nStuart recent deals:', recentDeals);
  }

  await p.$disconnect();
})();
