/**
 * One-time migration: Convert existing Leads into Client + Deal records
 * for the Phase 2 pipeline board.
 *
 * Run with: npx tsx scripts/migrate-leads-to-deals.ts
 */
import { PrismaClient, LeadStatus, DealStage } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Map LeadStatus → DealStage
const STATUS_TO_STAGE: Record<LeadStatus, DealStage> = {
  NEW: DealStage.NEW_LEAD,
  CONTACTED: DealStage.ENGAGED_INTERESTED,
  REPLIED: DealStage.ENGAGED_INTERESTED,
  INTERESTED: DealStage.QUALIFIED,
  DOCS_REQUESTED: DealStage.SUBMITTED_IN_REVIEW,
  SUBMITTED: DealStage.SUBMITTED_IN_REVIEW,
  FUNDED: DealStage.FUNDED,
  NOT_INTERESTED: DealStage.CLOSED,
  DNC: DealStage.CLOSED,
};

const STAGE_LABELS: Record<DealStage, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged / Interested',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted / In Review',
  APPROVED_OFFERS: 'Approved / Offers',
  COMMITTED_FUNDING: 'Committed / Funding',
  FUNDED: 'Funded',
  NURTURE: 'Nurture',
  CLOSED: 'Closed',
};

async function migrate() {
  console.log('🔄 Migrating leads → clients + deals ...');

  // Get all leads that are not suppressed/deleted
  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      isSuppressed: false,
    },
  });

  console.log(`  Found ${leads.length} leads to migrate`);

  if (leads.length === 0) {
    console.log('  Nothing to migrate.');
    return;
  }

  // Check if deals already exist (avoid duplicates on re-run)
  const existingDealCount = await prisma.deal.count();
  if (existingDealCount > 0) {
    console.log(`  ⚠️  ${existingDealCount} deals already exist. Skipping to avoid duplicates.`);
    console.log('  To force re-run, manually clear the deals and clients tables first.');
    return;
  }

  // We need a fallback rep for unassigned leads — use the first admin
  const fallbackRep = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallbackRep) {
    console.error('  ❌ No admin user found. Run seed first.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    const repId = lead.assignedRepId || fallbackRep.id;
    const stage = STATUS_TO_STAGE[lead.status] || DealStage.NEW_LEAD;
    const businessName = lead.company || `${lead.firstName} ${lead.lastName || ''}`.trim();

    try {
      // Upsert client by phone
      const client = await prisma.client.upsert({
        where: { phone: lead.phone },
        update: {},
        create: {
          businessName,
          contactName: `${lead.firstName} ${lead.lastName || ''}`.trim(),
          phone: lead.phone,
          email: lead.email,
          state: lead.state,
          totalFunded: stage === DealStage.FUNDED ? 0 : 0,
        },
      });

      // Create deal
      await prisma.deal.create({
        data: {
          clientId: client.id,
          assignedRepId: repId,
          stage,
          stageLabel: STAGE_LABELS[stage],
          lastActivityAt: lead.lastContactedAt || lead.updatedAt,
          lastReplyAt: lead.lastRepliedAt,
          notes: lead.notes,
          isHot: stage === DealStage.QUALIFIED || stage === DealStage.SUBMITTED_IN_REVIEW,
          lostReason: lead.status === 'NOT_INTERESTED' ? 'Not interested' : undefined,
          disqualReason: lead.status === 'DNC' ? 'DNC' : undefined,
        },
      });

      created++;
    } catch (err: any) {
      console.warn(`  ⚠️  Skipped lead ${lead.id} (${lead.phone}): ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✅ Created ${created} deals (skipped ${skipped})`);
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
