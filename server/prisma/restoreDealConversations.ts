/**
 * Create leads + conversations for prototype deals.
 * Links each deal to a lead with matching phone, creates conversations with messages.
 * Also removes old seed leads (fake +1555 numbers).
 *
 * Run: npx ts-node prisma/restoreDealConversations.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔄 Restoring deal conversations...\n');

  // Get phone number for conversations
  const phoneNumber = await prisma.phoneNumber.findFirst({ where: { status: 'ACTIVE' } });
  if (!phoneNumber) throw new Error('No active phone number found');
  const platformNumber = phoneNumber.phoneNumber;

  // 1. Clean up old fake seed leads (+1555xxx) and their conversations/pipeline cards
  const fakeLeads = await prisma.lead.findMany({
    where: { phone: { startsWith: '+15551234' } },
    select: { id: true, phone: true },
  });
  if (fakeLeads.length > 0) {
    const fakeLeadIds = fakeLeads.map(l => l.id);
    // Delete related records first
    await prisma.leadTag.deleteMany({ where: { leadId: { in: fakeLeadIds } } });
    await prisma.pipelineCard.deleteMany({ where: { leadId: { in: fakeLeadIds } } });
    const fakeConvos = await prisma.conversation.findMany({ where: { leadId: { in: fakeLeadIds } }, select: { id: true } });
    if (fakeConvos.length > 0) {
      const fakeConvoIds = fakeConvos.map(c => c.id);
      await prisma.message.deleteMany({ where: { conversationId: { in: fakeConvoIds } } });
      await prisma.conversation.deleteMany({ where: { id: { in: fakeConvoIds } } });
    }
    await prisma.campaignLead.deleteMany({ where: { leadId: { in: fakeLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: fakeLeadIds } } });
    console.log(`  ✅ Removed ${fakeLeads.length} old fake seed leads`);
  }

  // 2. Get all deals with their clients
  const deals = await prisma.deal.findMany({
    include: {
      client: true,
      assignedRep: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  console.log(`  Found ${deals.length} deals to process`);

  // 3. For each deal, create a matching lead and link it
  for (const deal of deals) {
    if (!deal.client) continue;

    const clientPhone = deal.client.phone;
    if (!clientPhone) continue;

    // Create or find lead matching client phone
    let lead = await prisma.lead.findFirst({ where: { phone: clientPhone } });
    if (!lead) {
      const nameParts = (deal.client.contactName || '').split(' ');
      const firstName = nameParts[0] || deal.client.businessName || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      lead = await prisma.lead.create({
        data: {
          firstName,
          lastName,
          phone: clientPhone,
          email: deal.client.email,
          company: deal.client.businessName,
          state: deal.client.state,
          source: 'purchased',
          assignedRepId: deal.assignedRepId,
        },
      });
    }

    // Link deal to lead if not already linked
    if (!deal.leadId) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { leadId: lead.id },
      });
    }
  }
  console.log('  ✅ Leads created and linked to deals');

  // 4. Create conversations with realistic messages for several deals
  const conversationData = [
    {
      business: 'Norton Trucking',
      messages: [
        { dir: 'OUTBOUND', body: 'Hi Dave, this is SCL Capital. We specialize in business funding for trucking companies. Would you like to explore options for Norton Trucking? Reply STOP to opt out.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Yes what kind of options do you have?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'We can offer $100K-$250K for trucking businesses with 6+ months revenue. Fast approval, 24-48hr funding. Can I get your last 3 months bank statements to pre-qualify?', status: 'DELIVERED' },
      ],
    },
    {
      business: 'Bloom Wellness',
      messages: [
        { dir: 'OUTBOUND', body: 'Hi Rachel, this is SCL. We help wellness businesses access capital for growth. Interested in learning more? Reply STOP to opt out.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'How much can I qualify for?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Based on typical wellness businesses, $25K-$50K. We just need bank statements and a quick application to give you exact numbers. Want to proceed?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Sure, send the application link', status: 'RECEIVED' },
      ],
    },
    {
      business: 'Russell Painting Co.',
      messages: [
        { dir: 'OUTBOUND', body: 'Hi Mike, this is SCL Capital. We provide funding for trade businesses like Russell Painting. Need capital for equipment or expansion? Reply STOP to opt out.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Maybe, what are your rates?', status: 'RECEIVED' },
      ],
    },
    {
      business: 'Morrison Dental Group',
      messages: [
        { dir: 'OUTBOUND', body: 'Dr. Morrison, this is SCL Capital. We specialize in funding for dental practices. Equipment loans, working capital — fast approval. Interested?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'We need equipment financing for a new location. What do you need from me?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Great! For equipment financing we can do $50K-$500K. Send over your last 4 months bank statements and business license. I\'ll submit the app today.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Sending now', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Received! Application submitted. You should hear back within 24 hours.', status: 'DELIVERED' },
      ],
    },
    {
      business: 'Arguello Group',
      messages: [
        { dir: 'OUTBOUND', body: 'Hi Carlos, SCL Capital here. We can help Arguello Group access fast business funding. $50K-$500K available. Want details?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Yes need working capital. How fast?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: '24-48 hours after approval. Just need bank statements and a completed application. Can you send those over today?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'OK sending bank statements now. When can we talk about terms?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'App submitted to lenders. Should have offers by tomorrow. I\'ll call you as soon as they come in.', status: 'DELIVERED' },
      ],
    },
    {
      business: 'Manco Equipment',
      messages: [
        { dir: 'OUTBOUND', body: 'Tony, SCL Capital here. We have equipment financing solutions for businesses like Manco Equipment. Interested?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Need funding for heavy equipment. What\'s the process?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Simple — bank statements + application. We match you with lenders in our network. Equipment deals get done in 3-5 days. Want to start?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Yes. Email me the app please', status: 'RECEIVED' },
      ],
    },
    {
      business: 'Park Beauty Supply',
      messages: [
        { dir: 'OUTBOUND', body: 'Sandra, this is SCL Capital. Business funding available for Park Beauty Supply. $10K-$200K with fast approval. Reply STOP to opt out.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'I submitted docs last week, any update?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Your app is in review with two lenders. I\'ll follow up with them today and get you an update by EOD.', status: 'DELIVERED' },
      ],
    },
    {
      business: 'AutoLift Co.',
      messages: [
        { dir: 'OUTBOUND', body: 'Marcus, SCL Capital here. We have lender offers ready for AutoLift Co. When can we review the terms together?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Can we talk tomorrow at 2?', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Yes, calling you at 2pm tomorrow. We have an SBA offer at $300K that looks strong.', status: 'DELIVERED' },
      ],
    },
    {
      business: 'Williams HVAC Solutions',
      messages: [
        { dir: 'OUTBOUND', body: 'Brian, SCL Capital following up. We have an offer from a lender for Williams HVAC Solutions — $175K LOC. Want to review?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Yes send me the terms', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'Sending offer sheet now. LOC at $175K, 12mo term, 1.18 factor. Let me know if you want to accept or negotiate.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Looks good, lets move forward', status: 'RECEIVED' },
      ],
    },
    {
      business: 'Peak Auto Group',
      messages: [
        { dir: 'OUTBOUND', body: 'Hi Derek, SCL Capital. We help auto groups access business capital. Could be a great fit for Peak Auto. Reply STOP to opt out.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Client replied just now', status: 'RECEIVED' },
      ],
    },
    {
      business: 'Grant Day Spa & Wellness',
      messages: [
        { dir: 'OUTBOUND', body: 'Lisa, this is SCL Capital. We provide SBA and equipment funding for wellness businesses. Want to learn about options for Grant Day Spa?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Client replied just now', status: 'RECEIVED' },
      ],
    },
    {
      business: 'Olson Retail Group',
      messages: [
        { dir: 'OUTBOUND', body: 'Karen, SCL Capital checking in. How is business at Olson Retail Group? Ready to explore funding options again?', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Not right now, maybe in a few months', status: 'RECEIVED' },
        { dir: 'OUTBOUND', body: 'No problem! I\'ll follow up in April. In the meantime, feel free to reach out if anything changes.', status: 'DELIVERED' },
      ],
    },
    {
      business: 'Dupree Catering & Events',
      messages: [
        { dir: 'OUTBOUND', body: 'Marie, this is SCL. Wanted to check in — any funding needs for Dupree Catering? We had discussed a line of credit earlier.', status: 'DELIVERED' },
      ],
    },
    {
      business: 'Carter Medical Staffing',
      messages: [
        { dir: 'OUTBOUND', body: 'Angela, congratulations on your funding! Just wanted to let you know — if Carter Medical Staffing needs additional capital in the future, we\'re here to help.', status: 'DELIVERED' },
        { dir: 'INBOUND', body: 'Thank you! Great working with you. Will definitely reach out for the next round.', status: 'RECEIVED' },
      ],
    },
  ];

  let convoCount = 0;
  let msgCount = 0;

  for (const conv of conversationData) {
    const client = await prisma.client.findFirst({ where: { businessName: conv.business } });
    if (!client) { console.log(`  ⚠ Client not found: ${conv.business}`); continue; }

    const lead = await prisma.lead.findFirst({ where: { phone: client.phone! } });
    if (!lead) { console.log(`  ⚠ Lead not found for: ${conv.business} (${client.phone})`); continue; }

    // Check if conversation already exists
    const existing = await prisma.conversation.findFirst({ where: { leadId: lead.id } });
    if (existing) continue;

    const inboundCount = conv.messages.filter(m => m.dir === 'INBOUND').length;
    const conversation = await prisma.conversation.create({
      data: {
        leadId: lead.id,
        assignedRepId: lead.assignedRepId,
        stickyNumberId: phoneNumber.id,
        isActive: true,
        unreadCount: inboundCount,
        lastMessageAt: new Date(),
        lastDirection: conv.messages[conv.messages.length - 1].dir === 'OUTBOUND' ? 'outbound' : 'inbound',
      },
    });

    let minuteOffset = -conv.messages.length * 20;
    for (const msg of conv.messages) {
      const sentAt = new Date(Date.now() + minuteOffset * 60000);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: msg.dir as any,
          body: msg.body,
          status: msg.status as any,
          fromNumber: msg.dir === 'OUTBOUND' ? platformNumber : client.phone!,
          toNumber: msg.dir === 'OUTBOUND' ? client.phone! : platformNumber,
          sentAt,
          phoneNumberId: phoneNumber.id,
        },
      });
      minuteOffset += 20;
      msgCount++;
    }
    convoCount++;
  }
  console.log(`  ✅ ${convoCount} conversations with ${msgCount} messages created`);

  // Summary
  const totalLeads = await prisma.lead.count();
  const totalConvos = await prisma.conversation.count();
  const totalMsgs = await prisma.message.count();
  console.log(`\n✅ Done! Leads: ${totalLeads}, Conversations: ${totalConvos}, Messages: ${totalMsgs}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
