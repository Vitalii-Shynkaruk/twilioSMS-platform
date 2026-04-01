const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Find all leads with status INTERESTED/DOCS_REQUESTED/SUBMITTED/FUNDED that don't have a deal
  const leadsWithoutDeals = await p.lead.findMany({
    where: {
      status: { in: ['INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED', 'FUNDED'] },
      deal: null,
      deletedAt: null,
    },
    select: { id: true, firstName: true, lastName: true, phone: true, status: true, assignedRepId: true, company: true }
  });
  console.log('Leads with actionable status but no deal:', leadsWithoutDeals.length);
  leadsWithoutDeals.forEach(l => console.log(' ', l.firstName, l.lastName, '|', l.status, '|', l.assignedRepId ? 'assigned' : 'unassigned'));

  // For each, create a client + deal
  for (const lead of leadsWithoutDeals) {
    let client = await p.client.findUnique({ where: { phone: lead.phone } });
    if (!client) {
      client = await p.client.create({
        data: {
          businessName: lead.company || `${lead.firstName} ${lead.lastName || ''}`.trim(),
          contactName: `${lead.firstName} ${lead.lastName || ''}`.trim(),
          phone: lead.phone,
        },
      });
    }

    const stageMap = {
      INTERESTED: 'QUALIFIED',
      DOCS_REQUESTED: 'QUALIFIED',
      SUBMITTED: 'SUBMITTED_IN_REVIEW',
      FUNDED: 'FUNDED',
    };
    const labelMap = {
      QUALIFIED: 'Qualified',
      SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
      FUNDED: 'Funded',
    };
    const stage = stageMap[lead.status];
    const conv = await p.conversation.findFirst({ where: { leadId: lead.id }, select: { assignedRepId: true } });
    const repId = lead.assignedRepId || conv?.assignedRepId || null;
    
    if (!repId) {
      console.log('  SKIP (no rep):', lead.firstName, lead.lastName);
      continue;
    }

    await p.deal.create({
      data: {
        clientId: client.id,
        assignedRepId: repId,
        leadId: lead.id,
        stage,
        stageLabel: labelMap[stage],
        lastActivityAt: new Date(),
      },
    });
    console.log('  CREATED deal for:', lead.firstName, lead.lastName, '->', stage);
  }

  await p.$disconnect();
})();
