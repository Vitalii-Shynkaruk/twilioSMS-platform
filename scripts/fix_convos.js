const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const stuart = await p.user.findFirst({ where: { email: 'sbenitez@pmfus.com' }, select: { id: true, firstName: true } });
  console.log('Stuart:', stuart);

  const campaigns = await p.campaign.findMany({
    where: { createdById: stuart.id },
    select: { id: true, name: true, totalSent: true, totalReplied: true }
  });
  console.log('Stuart campaigns:', JSON.stringify(campaigns, null, 2));

  const nullConvos = await p.conversation.count({ where: { assignedRepId: null } });
  console.log('Conversations with null assignedRepId:', nullConvos);

  const stuartConvos = await p.conversation.count({ where: { assignedRepId: stuart.id } });
  console.log('Conversations assigned to Stuart:', stuartConvos);

  const total = await p.conversation.count();
  console.log('Total conversations:', total);

  // Fix: Find leads that received messages from Stuart's campaigns
  const stuartCampaignIds = campaigns.map(c => c.id);
  if (stuartCampaignIds.length > 0) {
    const msgs = await p.message.findMany({
      where: { campaignId: { in: stuartCampaignIds } },
      select: { conversationId: true },
      distinct: ['conversationId']
    });
    const convoIds = msgs.map(m => m.conversationId);
    console.log('Conversations from Stuart campaigns:', convoIds.length);

    // Update those with null assignedRepId
    const result = await p.conversation.updateMany({
      where: {
        id: { in: convoIds },
        assignedRepId: null
      },
      data: { assignedRepId: stuart.id }
    });
    console.log('Fixed conversations:', result.count);
  }

  // Verify
  const afterFix = await p.conversation.count({ where: { assignedRepId: stuart.id } });
  console.log('Stuart conversations after fix:', afterFix);

  await p.$disconnect();
})();
