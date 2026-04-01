const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Check conversations with unread replies for Stuart
  const stuartId = 'cmmv0jfph0002zohvy6ibbq6q';

  // Find conversations that have inbound messages
  const convosWithReplies = await p.conversation.findMany({
    where: {
      assignedRepId: stuartId,
      messages: { some: { direction: 'INBOUND' } }
    },
    select: {
      id: true,
      unreadCount: true,
      lastMessageAt: true,
      lead: { select: { firstName: true, lastName: true } },
      messages: {
        where: { direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, createdAt: true }
      }
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 10
  });
  console.log('Stuart convos with replies:');
  convosWithReplies.forEach(c => {
    console.log(`  ${c.lead?.firstName} ${c.lead?.lastName} | unread: ${c.unreadCount} | last: ${c.lastMessageAt} | reply: ${c.messages[0]?.body?.substring(0,40)}`);
  });

  // Check ALEXIS FOUONJI and Bob Wanamaker specifically
  const alexis = await p.conversation.findFirst({
    where: { lead: { firstName: { contains: 'ALEXIS' } } },
    select: { id: true, assignedRepId: true, unreadCount: true, lead: { select: { firstName: true, lastName: true } } }
  });
  console.log('\nAlexis conversation:', alexis);

  const bob = await p.conversation.findFirst({
    where: { lead: { firstName: { contains: 'Bob' } } },
    select: { id: true, assignedRepId: true, unreadCount: true, lead: { select: { firstName: true, lastName: true } } }
  });
  console.log('Bob conversation:', bob);

  // Count convos with unreadCount > 0 for Stuart
  const unread = await p.conversation.count({
    where: { assignedRepId: stuartId, unreadCount: { gt: 0 } }
  });
  console.log('\nStuart unread conversations total:', unread);

  // Check how the frontend Inbox page fetches — look for unreadOnly default
  // Let's also check total conversations with inbound messages for Stuart
  const withInbound = await p.conversation.count({
    where: {
      assignedRepId: stuartId,
      messages: { some: { direction: 'INBOUND' } }
    }
  });
  console.log('Stuart convos with any inbound messages:', withInbound);

  await p.$disconnect();
})();
