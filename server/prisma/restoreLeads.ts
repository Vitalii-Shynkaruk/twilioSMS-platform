/**
 * Restore leads and conversations data.
 * Assigns leads to existing reps (round-robin).
 * Does NOT create/modify users or deals.
 *
 * Run: npx ts-node prisma/restoreLeads.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔄 Restoring leads and conversations...\n');

  // Get existing reps
  const reps = await prisma.user.findMany({
    where: { role: 'REP' },
    select: { id: true, firstName: true, lastName: true },
  });
  if (reps.length === 0) throw new Error('No REP users found');
  console.log(`  Found ${reps.length} reps for assignment`);

  // Get phone number for conversations
  const phoneNumber = await prisma.phoneNumber.findFirst({ where: { status: 'ACTIVE' } });
  if (!phoneNumber) throw new Error('No active phone number found');
  const platformNumber = phoneNumber.phoneNumber;

  // Pipeline stages
  const stages = await prisma.pipelineStage.findMany();
  const stageMap = new Map(stages.map(s => [s.name.toLowerCase().replace(/\s/g, '-'), s.id]));
  const defaultStageId = stages.find(s => s.name === 'New')?.id || stages[0]?.id;

  // Sample leads
  const sampleLeads = [
    { firstName: 'Michael', lastName: 'Brown', phone: '+15551234001', email: 'michael@example.com', company: 'Brown LLC', state: 'NY', source: 'purchased', stage: 'new' },
    { firstName: 'Jessica', lastName: 'Davis', phone: '+15551234002', email: 'jessica@example.com', company: 'Davis Corp', state: 'CA', source: 'purchased', stage: 'new' },
    { firstName: 'Robert', lastName: 'Wilson', phone: '+15551234003', email: 'robert@example.com', company: 'Wilson & Co', state: 'TX', source: 'referral', stage: 'new' },
    { firstName: 'Emily', lastName: 'Taylor', phone: '+15551234004', email: 'emily@example.com', company: 'Taylor Industries', state: 'FL', source: 'purchased', stage: 'contacted' },
    { firstName: 'David', lastName: 'Anderson', phone: '+15551234005', email: 'david@example.com', company: 'Anderson Group', state: 'IL', source: 'previously_funded', stage: 'contacted' },
    { firstName: 'Jennifer', lastName: 'Martinez', phone: '+15551234006', email: 'jen@example.com', company: 'JM Services', state: 'NY', source: 'purchased', stage: 'replied' },
    { firstName: 'James', lastName: 'Thomas', phone: '+15551234007', email: 'james@example.com', company: 'Thomas LLC', state: 'PA', source: 'purchased', stage: 'replied' },
    { firstName: 'Amanda', lastName: 'Garcia', phone: '+15551234008', email: 'amanda@example.com', company: 'Garcia Inc', state: 'NJ', source: 'referral', stage: 'interested' },
    { firstName: 'Daniel', lastName: 'Lee', phone: '+15551234009', email: 'daniel@example.com', company: 'Lee Capital Solutions', state: 'MA', source: 'purchased', stage: 'interested' },
    { firstName: 'Rachel', lastName: 'Kim', phone: '+15551234010', email: 'rachel@example.com', company: 'Kimchi Kitchen', state: 'WA', source: 'referral', stage: 'interested' },
    { firstName: 'Carlos', lastName: 'Ramirez', phone: '+15551234011', email: 'carlos@example.com', company: 'CR Transport LLC', state: 'AZ', source: 'purchased', stage: 'docs-requested' },
    { firstName: 'Lisa', lastName: 'Nguyen', phone: '+15551234012', email: 'lisa@example.com', company: 'Fresh Nails Spa', state: 'CA', source: 'purchased', stage: 'docs-requested' },
    { firstName: 'Steven', lastName: 'Clark', phone: '+15551234013', email: 'steven@example.com', company: 'Clark Plumbing', state: 'OH', source: 'purchased', stage: 'new' },
    { firstName: 'Michelle', lastName: 'Lewis', phone: '+15551234014', email: 'michelle@example.com', company: 'Lewis & Daughters', state: 'GA', source: 'previously_funded', stage: 'new' },
    { firstName: 'Anthony', lastName: 'Walker', phone: '+15551234015', email: 'anthony@example.com', company: 'Walker Construction', state: 'NC', source: 'previously_funded', stage: 'new' },
    { firstName: 'Nicole', lastName: 'Hall', phone: '+15551234016', email: 'nicole@example.com', company: 'Hall Design Studio', state: 'OR', source: 'referral', stage: 'contacted' },
    { firstName: 'Kevin', lastName: 'Allen', phone: '+15551234017', email: 'kevin@example.com', company: 'Allen Auto Repair', state: 'MI', source: 'purchased', stage: 'contacted' },
    { firstName: 'Sandra', lastName: 'Young', phone: '+15551234018', email: 'sandra@example.com', company: 'Young Consulting', state: 'CO', source: 'purchased', stage: 'new' },
    { firstName: 'Brian', lastName: 'King', phone: '+15551234019', email: 'brian@example.com', company: 'King Roofing', state: 'TN', source: 'purchased', stage: 'new' },
    { firstName: 'Patricia', lastName: 'Wright', phone: '+15551234020', email: 'patricia@example.com', company: 'Wright Legal', state: 'VA', source: 'purchased', stage: 'new' },
    { firstName: 'Jason', lastName: 'Lopez', phone: '+15551234021', email: 'jason@example.com', company: 'Lopez Landscaping', state: 'NV', source: 'purchased', stage: 'new' },
    { firstName: 'Stephanie', lastName: 'Hill', phone: '+15551234022', email: 'steph@example.com', company: 'Hilltop Bakery', state: 'MN', source: 'referral', stage: 'new' },
    { firstName: 'Gregory', lastName: 'Scott', phone: '+15551234023', email: 'greg@example.com', company: 'Scott IT Services', state: 'WI', source: 'purchased', stage: 'contacted' },
    { firstName: 'Laura', lastName: 'Adams', phone: '+15551234024', email: 'laura@example.com', company: 'Adams Florist', state: 'CT', source: 'purchased', stage: 'contacted' },
    { firstName: 'Mark', lastName: 'Baker', phone: '+15551234025', email: 'mark@example.com', company: 'Baker Supply Co', state: 'MD', source: 'previously_funded', stage: 'replied' },
  ];

  // Create leads with round-robin rep assignment
  let created = 0;
  for (let i = 0; i < sampleLeads.length; i++) {
    const { stage, ...leadData } = sampleLeads[i];
    const rep = reps[i % reps.length];

    const lead = await prisma.lead.upsert({
      where: { phone: leadData.phone },
      update: {},
      create: {
        ...leadData,
        assignedRepId: rep.id,
      },
    });

    // Create pipeline card
    const stageId = stageMap.get(stage) || defaultStageId;
    if (stageId) {
      try {
        await prisma.pipelineCard.upsert({
          where: { leadId: lead.id },
          update: { stageId },
          create: { leadId: lead.id, stageId },
        });
      } catch {
        // stage doesn't exist — skip
      }
    }
    created++;
  }
  console.log(`  ✅ ${created} leads created`);

  // Assign tags
  const allTags = await prisma.tag.findMany();
  const tagMap = new Map(allTags.map(t => [t.name, t.id]));
  const allLeads = await prisma.lead.findMany();
  for (let i = 0; i < allLeads.length; i++) {
    const lead = allLeads[i];
    const tagIds: string[] = [];
    if (i % 2 === 0 && tagMap.has('Hot Lead')) tagIds.push(tagMap.get('Hot Lead')!);
    if (i % 5 === 0 && tagMap.has('VIP')) tagIds.push(tagMap.get('VIP')!);
    if (tagMap.has('Previously Funded') && lead.source === 'previously_funded')
      tagIds.push(tagMap.get('Previously Funded')!);
    if (i % 3 === 0 && tagMap.has('Purchased Lead') && lead.source === 'purchased')
      tagIds.push(tagMap.get('Purchased Lead')!);

    for (const tagId of tagIds) {
      try {
        await prisma.leadTag.create({ data: { leadId: lead.id, tagId } });
      } catch { /* unique constraint */ }
    }
  }
  console.log('  ✅ Tags assigned to leads');

  // Create conversations with messages
  const conversations = [
    {
      phone: '+15551234004', // Emily Taylor — CONTACTED
      messages: [
        { direction: 'OUTBOUND' as const, body: 'Hi Emily, this is SCL. We have business funding options that might be perfect for Taylor Industries. Would you like to learn more? Reply STOP to opt out.', status: 'DELIVERED' as const },
      ],
    },
    {
      phone: '+15551234006', // Jennifer Martinez — REPLIED
      messages: [
        { direction: 'OUTBOUND' as const, body: 'Hi Jennifer, this is SCL. We help businesses like JM Services access capital quickly. Interested in a quick chat? Reply STOP to opt out.', status: 'DELIVERED' as const },
        { direction: 'INBOUND' as const, body: 'Yes, I need about $50k for equipment. What are the rates?', status: 'RECEIVED' as const },
      ],
    },
    {
      phone: '+15551234008', // Amanda Garcia — INTERESTED
      messages: [
        { direction: 'OUTBOUND' as const, body: 'Hi Amanda, this is SCL. We have business funding options for Garcia Inc. Want to learn more?', status: 'DELIVERED' as const },
        { direction: 'INBOUND' as const, body: 'Tell me more about your rates and terms', status: 'RECEIVED' as const },
        { direction: 'OUTBOUND' as const, body: 'Great! We offer $10K-$500K with terms from 3-24 months. Rates start at 1.1 factor. Shall I run a quick pre-qualification?', status: 'DELIVERED' as const },
        { direction: 'INBOUND' as const, body: 'Yes please, what do you need from me?', status: 'RECEIVED' as const },
      ],
    },
    {
      phone: '+15551234011', // Carlos Ramirez — DOCS REQUESTED
      messages: [
        { direction: 'OUTBOUND' as const, body: 'Hi Carlos, this is SCL. We specialize in funding for businesses like CR Transport LLC.', status: 'DELIVERED' as const },
        { direction: 'INBOUND' as const, body: 'I need funding for new trucks. How fast can you move?', status: 'RECEIVED' as const },
        { direction: 'OUTBOUND' as const, body: 'We can fund in as little as 24-48 hours! Could you send me your last 3 months bank statements to get started?', status: 'DELIVERED' as const },
        { direction: 'INBOUND' as const, body: 'Will send them tonight', status: 'RECEIVED' as const },
      ],
    },
  ];

  for (const conv of conversations) {
    const lead = await prisma.lead.findUnique({ where: { phone: conv.phone } });
    if (!lead) continue;

    // Assign conversation to same rep as lead
    const repId = lead.assignedRepId || reps[0].id;

    const conversation = await prisma.conversation.upsert({
      where: { leadId: lead.id },
      update: {},
      create: {
        leadId: lead.id,
        assignedRepId: repId,
        stickyNumberId: phoneNumber.id,
        isActive: true,
        unreadCount: conv.messages.filter(m => m.direction === 'INBOUND').length,
        lastMessageAt: new Date(),
      },
    });

    const existingMsgCount = await prisma.message.count({ where: { conversationId: conversation.id } });
    if (existingMsgCount === 0) {
      let minuteOffset = -conv.messages.length * 15;
      for (const msg of conv.messages) {
        const sentAt = new Date(Date.now() + minuteOffset * 60000);
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: msg.direction,
            body: msg.body,
            status: msg.status,
            fromNumber: msg.direction === 'OUTBOUND' ? platformNumber : conv.phone,
            toNumber: msg.direction === 'OUTBOUND' ? conv.phone : platformNumber,
            sentAt,
            phoneNumberId: phoneNumber.id,
          },
        });
        minuteOffset += 15;
      }
    }
  }
  console.log('  ✅ 4 conversations with 13 messages created');

  console.log('\n✅ Leads and conversations restored!\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
