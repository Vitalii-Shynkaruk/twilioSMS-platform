import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Admin credentials from .env
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@securecreditlines.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const adminLastName = process.env.ADMIN_LAST_NAME || 'SCL';

  // Create admin user
  const adminPassword = await bcrypt.hash(adminPass, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminPassword }, // Always sync password from env
    create: {
      email: adminEmail,
      passwordHash: adminPassword,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: 'ADMIN',
    },
  });
  console.log(`  ✅ Admin user created/updated: ${admin.email}`);

  // Create demo rep
  const repPassword = await bcrypt.hash('rep123', 12);
  const rep = await prisma.user.upsert({
    where: { email: 'rep@securecreditlines.com' },
    update: {},
    create: {
      email: 'rep@securecreditlines.com',
      passwordHash: repPassword,
      firstName: 'John',
      lastName: 'Smith',
      role: 'REP',
    },
  });
  console.log(`  ✅ Rep user created: ${rep.email}`);

  // Create manager
  const managerPassword = await bcrypt.hash('manager123', 12);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@securecreditlines.com' },
    update: {},
    create: {
      email: 'manager@securecreditlines.com',
      passwordHash: managerPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'MANAGER',
    },
  });
  console.log(`  ✅ Manager user created: ${manager.email}`);

  // Create pipeline stages
  const stages = [
    { name: 'New', order: 1, color: '#6366f1', isDefault: true },
    { name: 'Contacted', order: 2, color: '#3b82f6' },
    { name: 'Replied', order: 3, color: '#8b5cf6' },
    { name: 'Interested', order: 4, color: '#f59e0b' },
    { name: 'Docs Requested', order: 5, color: '#f97316' },
    { name: 'Submitted', order: 6, color: '#10b981' },
    { name: 'Funded', order: 7, color: '#22c55e' },
    { name: 'Not Interested', order: 8, color: '#ef4444' },
  ];

  for (const stage of stages) {
    await prisma.pipelineStage.upsert({
      where: { id: stage.name.toLowerCase().replace(/\s/g, '-') },
      update: stage,
      create: {
        id: stage.name.toLowerCase().replace(/\s/g, '-'),
        ...stage,
      },
    });
  }
  console.log(`  ✅ ${stages.length} pipeline stages created`);

  // Create tags
  const tags = [
    { name: 'Hot Lead', color: '#ef4444' },
    { name: 'Cold Lead', color: '#3b82f6' },
    { name: 'Purchased Lead', color: '#8b5cf6' },
    { name: 'Previously Funded', color: '#22c55e' },
    { name: 'Follow-Up Needed', color: '#f59e0b' },
    { name: 'VIP', color: '#f97316' },
    { name: 'Re-engagement', color: '#06b6d4' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: tag,
      create: tag,
    });
  }
  console.log(`  ✅ ${tags.length} tags created`);

  // Create sample leads — spread across pipeline stages
  const sampleLeads = [
    // NEW stage
    { firstName: 'Michael', lastName: 'Brown', phone: '+15551234001', email: 'michael@example.com', company: 'Brown LLC', state: 'NY', source: 'purchased', pipelineStage: 'new' },
    { firstName: 'Jessica', lastName: 'Davis', phone: '+15551234002', email: 'jessica@example.com', company: 'Davis Corp', state: 'CA', source: 'purchased', pipelineStage: 'new' },
    { firstName: 'Robert', lastName: 'Wilson', phone: '+15551234003', email: 'robert@example.com', company: 'Wilson & Co', state: 'TX', source: 'referral', pipelineStage: 'new' },
    // CONTACTED stage
    { firstName: 'Emily', lastName: 'Taylor', phone: '+15551234004', email: 'emily@example.com', company: 'Taylor Industries', state: 'FL', source: 'purchased', pipelineStage: 'contacted' },
    { firstName: 'David', lastName: 'Anderson', phone: '+15551234005', email: 'david@example.com', company: 'Anderson Group', state: 'IL', source: 'previously_funded', pipelineStage: 'contacted' },
    // REPLIED stage
    { firstName: 'Jennifer', lastName: 'Martinez', phone: '+15551234006', email: 'jen@example.com', company: 'JM Services', state: 'NY', source: 'purchased', pipelineStage: 'replied' },
    { firstName: 'James', lastName: 'Thomas', phone: '+15551234007', email: 'james@example.com', company: 'Thomas LLC', state: 'PA', source: 'purchased', pipelineStage: 'replied' },
    // INTERESTED stage
    { firstName: 'Amanda', lastName: 'Garcia', phone: '+15551234008', email: 'amanda@example.com', company: 'Garcia Inc', state: 'NJ', source: 'referral', pipelineStage: 'interested' },
    { firstName: 'Daniel', lastName: 'Lee', phone: '+15551234009', email: 'daniel@example.com', company: 'Lee Capital Solutions', state: 'MA', source: 'purchased', pipelineStage: 'interested' },
    { firstName: 'Rachel', lastName: 'Kim', phone: '+15551234010', email: 'rachel@example.com', company: 'Kimchi Kitchen', state: 'WA', source: 'referral', pipelineStage: 'interested' },
    // DOCS REQUESTED stage
    { firstName: 'Carlos', lastName: 'Ramirez', phone: '+15551234011', email: 'carlos@example.com', company: 'CR Transport LLC', state: 'AZ', source: 'purchased', pipelineStage: 'docs-requested' },
    { firstName: 'Lisa', lastName: 'Nguyen', phone: '+15551234012', email: 'lisa@example.com', company: 'Fresh Nails Spa', state: 'CA', source: 'purchased', pipelineStage: 'docs-requested' },
    // SUBMITTED stage
    { firstName: 'Steven', lastName: 'Clark', phone: '+15551234013', email: 'steven@example.com', company: 'Clark Plumbing', state: 'OH', source: 'purchased', pipelineStage: 'submitted' },
    { firstName: 'Michelle', lastName: 'Lewis', phone: '+15551234014', email: 'michelle@example.com', company: 'Lewis & Daughters', state: 'GA', source: 'previously_funded', pipelineStage: 'submitted' },
    // FUNDED stage
    { firstName: 'Anthony', lastName: 'Walker', phone: '+15551234015', email: 'anthony@example.com', company: 'Walker Construction', state: 'NC', source: 'previously_funded', pipelineStage: 'funded' },
    { firstName: 'Nicole', lastName: 'Hall', phone: '+15551234016', email: 'nicole@example.com', company: 'Hall Design Studio', state: 'OR', source: 'referral', pipelineStage: 'funded' },
    { firstName: 'Kevin', lastName: 'Allen', phone: '+15551234017', email: 'kevin@example.com', company: 'Allen Auto Repair', state: 'MI', source: 'purchased', pipelineStage: 'funded' },
    // NOT INTERESTED stage
    { firstName: 'Sandra', lastName: 'Young', phone: '+15551234018', email: 'sandra@example.com', company: 'Young Consulting', state: 'CO', source: 'purchased', pipelineStage: 'not-interested' },
    { firstName: 'Brian', lastName: 'King', phone: '+15551234019', email: 'brian@example.com', company: 'King Roofing', state: 'TN', source: 'purchased', pipelineStage: 'not-interested' },
    // More in NEW (pipeline looks realistic with most in early stages)
    { firstName: 'Patricia', lastName: 'Wright', phone: '+15551234020', email: 'patricia@example.com', company: 'Wright Legal', state: 'VA', source: 'purchased', pipelineStage: 'new' },
    { firstName: 'Jason', lastName: 'Lopez', phone: '+15551234021', email: 'jason@example.com', company: 'Lopez Landscaping', state: 'NV', source: 'purchased', pipelineStage: 'new' },
    { firstName: 'Stephanie', lastName: 'Hill', phone: '+15551234022', email: 'steph@example.com', company: 'Hilltop Bakery', state: 'MN', source: 'referral', pipelineStage: 'new' },
    { firstName: 'Gregory', lastName: 'Scott', phone: '+15551234023', email: 'greg@example.com', company: 'Scott IT Services', state: 'WI', source: 'purchased', pipelineStage: 'contacted' },
    { firstName: 'Laura', lastName: 'Adams', phone: '+15551234024', email: 'laura@example.com', company: 'Adams Florist', state: 'CT', source: 'purchased', pipelineStage: 'contacted' },
    { firstName: 'Mark', lastName: 'Baker', phone: '+15551234025', email: 'mark@example.com', company: 'Baker Supply Co', state: 'MD', source: 'previously_funded', pipelineStage: 'replied' },
  ];

  const allTags = await prisma.tag.findMany();
  const tagMap = new Map(allTags.map(t => [t.name, t.id]));

  const defaultStage = await prisma.pipelineStage.findFirst({ where: { isDefault: true } });

  let leadIndex = 0;
  for (const leadData of sampleLeads) {
    const { pipelineStage, ...leadFields } = leadData;
    const lead = await prisma.lead.upsert({
      where: { phone: leadFields.phone },
      update: {},
      create: {
        ...leadFields,
        assignedRepId: leadIndex % 3 === 0 ? manager.id : rep.id,
      },
    });

    // Create pipeline card in designated stage
    const stageId = pipelineStage || defaultStage?.id || 'new';
    try {
      await prisma.pipelineCard.upsert({
        where: { leadId: lead.id },
        update: { stageId },
        create: {
          leadId: lead.id,
          stageId,
          notes: leadIndex % 4 === 0 ? 'Warm lead — follow up soon' : leadIndex % 3 === 0 ? 'Called, left voicemail' : null,
        },
      });
    } catch (e) {
      // Stage ID may not exist yet — use default
      if (defaultStage) {
        await prisma.pipelineCard.upsert({
          where: { leadId: lead.id },
          update: {},
          create: { leadId: lead.id, stageId: defaultStage.id },
        });
      }
    }

    // Assign random tags to some leads
    const tagAssignments: string[] = [];
    if (leadIndex % 2 === 0 && tagMap.has('Hot Lead')) tagAssignments.push(tagMap.get('Hot Lead')!);
    if (leadIndex % 5 === 0 && tagMap.has('VIP')) tagAssignments.push(tagMap.get('VIP')!);
    if (leadData.source === 'previously_funded' && tagMap.has('Previously Funded')) tagAssignments.push(tagMap.get('Previously Funded')!);
    if (leadData.source === 'purchased' && leadIndex % 3 === 0 && tagMap.has('Purchased Lead')) tagAssignments.push(tagMap.get('Purchased Lead')!);
    if (pipelineStage === 'contacted' && tagMap.has('Follow-Up Needed')) tagAssignments.push(tagMap.get('Follow-Up Needed')!);

    for (const tagId of tagAssignments) {
      try {
        await prisma.leadTag.create({ data: { leadId: lead.id, tagId } });
      } catch {
        // Unique constraint — already exists
      }
    }

    leadIndex++;
  }
  console.log(`  ✅ ${sampleLeads.length} sample leads created across all pipeline stages`);

  // Create a sample automation rule (follow-up sequence)
  const followUpRule = await prisma.automationRule.upsert({
    where: { id: 'default-follow-up' },
    update: {},
    create: {
      id: 'default-follow-up',
      name: 'Default Follow-Up Sequence',
      type: 'FOLLOW_UP_SEQUENCE',
      triggerConfig: { type: 'no_reply', delayDays: 3, maxAttempts: 3 },
      actionConfig: { type: 'send_template', stopOnReply: true },
      sendAfterHour: 9,
      sendBeforeHour: 20,
      sendOnWeekends: false,
    },
  });

  // Create follow-up templates
  const followUpTemplates = [
    {
      sequenceOrder: 1,
      delayDays: 3,
      messageTemplate: 'Hi {{firstName}}, this is SCL. We have business funding options that might be perfect for your needs. Would you like to learn more? Reply STOP to opt out.',
    },
    {
      sequenceOrder: 2,
      delayDays: 5,
      messageTemplate: 'Hi {{firstName}}, just following up from SCL. We help businesses like {{company}} access capital quickly. Interested in a quick chat? Reply STOP to opt out.',
    },
    {
      sequenceOrder: 3,
      delayDays: 7,
      messageTemplate: '{{firstName}}, last follow-up from SCL. If business funding isn\'t needed right now, no worries! But if it is, we\'d love to help. Reply STOP to opt out.',
    },
  ];

  for (const template of followUpTemplates) {
    await prisma.automationTemplate.upsert({
      where: {
        id: `follow-up-${template.sequenceOrder}`,
      },
      update: template,
      create: {
        id: `follow-up-${template.sequenceOrder}`,
        automationRuleId: followUpRule.id,
        ...template,
      },
    });
  }
  console.log('  ✅ Follow-up automation rule created with 3 templates');

  // Create number pool
  await prisma.numberPool.upsert({
    where: { id: 'primary-pool' },
    update: {},
    create: {
      id: 'primary-pool',
      name: 'Primary Sending Pool',
      description: 'Main pool for outbound campaigns',
      dailyLimit: 350,
    },
  });
  console.log('  ✅ Primary number pool created');

  // Create demo phone number
  const demoPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '+17866487512';
  const demoNumber = await prisma.phoneNumber.upsert({
    where: { phoneNumber: demoPhoneNumber },
    update: {},
    create: {
      twilioSid: `PN_DEMO_${Date.now()}`,
      phoneNumber: demoPhoneNumber,
      friendlyName: 'Primary Number',
      status: 'ACTIVE',
      dailyLimit: 350,
    },
  });

  // Add number to pool
  try {
    await prisma.numberPoolMembership.create({
      data: { phoneNumberId: demoNumber.id, poolId: 'primary-pool' },
    });
  } catch { /* already exists */ }
  console.log(`  ✅ Demo phone number created: ${demoPhoneNumber}`);

  // Seed Twilio API keys from .env into system_settings
  const twilioSettings = [
    { key: 'twilioAccountSid', value: process.env.TWILIO_ACCOUNT_SID || '' },
    { key: 'twilioAuthToken', value: process.env.TWILIO_AUTH_TOKEN || '' },
    { key: 'twilioTestAccountSid', value: process.env.TWILIO_TEST_ACCOUNT_SID || '' },
    { key: 'twilioTestAuthToken', value: process.env.TWILIO_TEST_AUTH_TOKEN || '' },
    { key: 'smsMode', value: 'simulation' },
  ];

  for (const setting of twilioSettings) {
    if (setting.value) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: {},
        create: { key: setting.key, value: setting.value },
      });
    }
  }
  console.log('  ✅ Twilio API settings seeded from .env');

  // Create sample conversations with messages for realistic demo
  const sampleConversations = [
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
        { direction: 'INBOUND' as const, body: 'Yes, I Need about $50k for equipment. What are the rates?', status: 'RECEIVED' as const },
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

  for (const conv of sampleConversations) {
    const lead = await prisma.lead.findUnique({ where: { phone: conv.phone } });
    if (!lead) continue;

    const conversation = await prisma.conversation.upsert({
      where: { leadId: lead.id },
      update: {},
      create: {
        leadId: lead.id,
        assignedRepId: rep.id,
        stickyNumberId: demoNumber.id,
        isActive: true,
        unreadCount: conv.messages.filter(m => m.direction === 'INBOUND').length,
        lastMessageAt: new Date(),
      },
    });

    // Create messages if conversation is new (no messages yet)
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
            fromNumber: msg.direction === 'OUTBOUND' ? demoPhoneNumber : conv.phone,
            toNumber: msg.direction === 'OUTBOUND' ? conv.phone : demoPhoneNumber,
            sentAt,
            phoneNumberId: demoNumber.id,
          },
        });
        minuteOffset += 15;
      }
    }
  }
  console.log('  ✅ Sample conversations with messages created');

  // Create a demo campaign
  const allLeads = await prisma.lead.findMany({ where: { status: 'NEW' }, take: 5 });
  const demoCampaign = await prisma.campaign.upsert({
    where: { id: 'demo-campaign' },
    update: {},
    create: {
      id: 'demo-campaign',
      name: 'February Outreach',
      messageTemplate: 'Hi {{firstName}}, this is Secure Credit Lines. We help businesses like {{company}} access fast capital. Interested? Reply STOP to opt out.',
      status: 'DRAFT',
      createdById: admin.id,
      numberPoolId: 'primary-pool',
      totalLeads: allLeads.length,
      sendingSpeed: 4,
    },
  });

  for (const lead of allLeads) {
    try {
      await prisma.campaignLead.create({
        data: {
          campaignId: demoCampaign.id,
          leadId: lead.id,
          status: 'PENDING',
        },
      });
    } catch { /* already exists */ }
  }
  console.log('  ✅ Demo campaign created with leads');

  // Create test mode system setting (disabled by default)
  await prisma.systemSetting.upsert({
    where: { key: 'testMode' },
    update: {},
    create: { key: 'testMode', value: false },
  });
  console.log('  ✅ Test mode setting initialized (disabled)');

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📋 Login credentials:');
  console.log('  Admin: admin@securecreditlines.com / admin123');
  console.log('  Manager: manager@securecreditlines.com / manager123');
  console.log('  Rep: rep@securecreditlines.com / rep123');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
