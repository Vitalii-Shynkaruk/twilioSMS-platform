import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { DealStage, LeadStatus, ProductType, CommitSubStatus, RenewalTaskStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';

// ─── Lead ↔ Deal status mapping ───
const LEAD_TO_DEAL: Record<LeadStatus, DealStage> = {
  NEW: DealStage.NEW_LEAD,
  CONTACTED: DealStage.ENGAGED_INTERESTED,
  REPLIED: DealStage.ENGAGED_INTERESTED,
  INTERESTED: DealStage.QUALIFIED,
  DOCS_REQUESTED: DealStage.QUALIFIED,
  SUBMITTED: DealStage.SUBMITTED_IN_REVIEW,
  FUNDED: DealStage.FUNDED,
  NOT_INTERESTED: DealStage.NURTURE,
  DNC: DealStage.CLOSED,
};

const DEAL_TO_LEAD: Record<DealStage, LeadStatus> = {
  NEW_LEAD: LeadStatus.NEW,
  ENGAGED_INTERESTED: LeadStatus.CONTACTED,
  QUALIFIED: LeadStatus.INTERESTED,
  SUBMITTED_IN_REVIEW: LeadStatus.SUBMITTED,
  APPROVED_OFFERS: LeadStatus.SUBMITTED,
  COMMITTED_FUNDING: LeadStatus.SUBMITTED,
  FUNDED: LeadStatus.FUNDED,
  NURTURE: LeadStatus.NOT_INTERESTED,
  CLOSED: LeadStatus.DNC,
};

// Stage label mapping (exact names from spec)
const STAGE_LABELS: Record<DealStage, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged / Interested',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
  APPROVED_OFFERS: 'Approved / Offers',
  COMMITTED_FUNDING: 'Committed (Funding)',
  FUNDED: 'Funded',
  NURTURE: 'Nurture',
  CLOSED: 'Closed',
};

const STAGE_ORDER: DealStage[] = [
  DealStage.NEW_LEAD,
  DealStage.ENGAGED_INTERESTED,
  DealStage.QUALIFIED,
  DealStage.SUBMITTED_IN_REVIEW,
  DealStage.APPROVED_OFFERS,
  DealStage.COMMITTED_FUNDING,
  DealStage.FUNDED,
  DealStage.NURTURE,
  DealStage.CLOSED,
];

const SUBMITTED_AMOUNT_PRODUCTS = new Set<ProductType>([ProductType.SBA, ProductType.CRE, ProductType.EQUIPMENT]);

type RepIdentity = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string | null;
};

function isSubmittedAmountProduct(productType?: ProductType | null): boolean {
  return !!productType && SUBMITTED_AMOUNT_PRODUCTS.has(productType);
}

function parseOptionalFloat(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const parsed = parseFloat(str.replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProductType(value: unknown): ProductType | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return null;

  const aliases: Record<string, ProductType> = {
    MCA: ProductType.MCA,
    LOC: ProductType.LOC,
    'LINE OF CREDIT': ProductType.LOC,
    EQUIPMENT: ProductType.EQUIPMENT,
    HELOC: ProductType.HELOC,
    SBA: ProductType.SBA,
    CRE: ProductType.CRE,
    BRIDGE: ProductType.BRIDGE,
  };

  return aliases[normalized] || null;
}

function normalizeRepToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInitials(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchRepByName(reps: RepIdentity[], repNameRaw: string): RepIdentity | null {
  const repName = normalizeRepToken(repNameRaw);
  if (!repName) return null;
  const compact = normalizeInitials(repNameRaw);

  const exactFull = reps.find((r) => normalizeRepToken(`${r.firstName} ${r.lastName}`) === repName);
  if (exactFull) return exactFull;

  // Handle strings like "AR - Anthony Rack" / "Anthony Rack (AR)".
  const fullContained = reps.find((r) => repName.includes(normalizeRepToken(`${r.firstName} ${r.lastName}`)));
  if (fullContained) return fullContained;

  const exactInitials = reps.find((r) => r.initials && normalizeInitials(r.initials) === compact);
  if (exactInitials) return exactInitials;

  const tokens = repName.split(' ').filter(Boolean);
  const tokenInitialMatches = reps.filter(
    (r) => r.initials && tokens.some((t) => normalizeInitials(t) === normalizeInitials(r.initials || '')),
  );
  if (tokenInitialMatches.length === 1) return tokenInitialMatches[0];

  // Scan adjacent token pairs to support "AR Anthony Rack", "Rack Anthony", etc.
  if (tokens.length >= 2) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const first = tokens[i];
      const last = tokens[i + 1];
      const exactNameParts = reps.find(
        (r) => normalizeRepToken(r.firstName) === first && normalizeRepToken(r.lastName) === last,
      );
      if (exactNameParts) return exactNameParts;
      const swapped = reps.find(
        (r) => normalizeRepToken(r.lastName) === first && normalizeRepToken(r.firstName) === last,
      );
      if (swapped) return swapped;
    }
  }

  return null;
}

function isAdminLike(user: AuthRequest['user']): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MANAGER';
}

function repScopeFilter(repId: string, includeAssist = true) {
  if (!includeAssist) return { assignedRepId: repId };
  return {
    OR: [{ assignedRepId: repId }, { assistingRepIds: { array_contains: repId } }],
  };
}

// Helper: rep filter for data isolation
function repFilter(user: AuthRequest['user'], options?: { primaryOnly?: boolean }) {
  if (isAdminLike(user)) return {};
  if (!user?.id) return { assignedRepId: '__no_user__' };
  return repScopeFilter(user.id, !options?.primaryOnly);
}

// Helper: compute HOT status (never stored)
function computeIsHot(deal: {
  lastReplyAt: Date | null;
  stage: DealStage;
  lenderEngaged: boolean;
  appSubmitted: boolean;
}): boolean {
  const now = Date.now();
  const fortyEightHours = 48 * 60 * 60 * 1000;
  if (deal.lastReplyAt && now - new Date(deal.lastReplyAt).getTime() < fortyEightHours) return true;
  if (deal.stage === DealStage.APPROVED_OFFERS || deal.stage === DealStage.COMMITTED_FUNDING) return true;
  if (deal.lenderEngaged && deal.appSubmitted) return true;
  return false;
}

export class DealController {
  // GET /api/deals - List all deals with pipeline board data
  static async getDeals(req: AuthRequest, res: Response) {
    const { stage, search, repId, view } = req.query;
    const filter = repFilter(req.user);

    const where: any = {
      ...filter,
    };

    // Admin can view specific rep's deals
    if (isAdminLike(req.user) && repId) {
      Object.assign(where, repScopeFilter(repId as string, true));
    }

    if (stage) {
      where.stage = stage as DealStage;
    }

    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { client: { businessName: { contains: search as string } } },
            { client: { contactName: { contains: search as string } } },
            { client: { phone: { contains: search as string } } },
          ],
        },
      ];
    }

    // Team View: only certain stages, no contact info
    if (view === 'team') {
      where.stage = {
        in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING, DealStage.FUNDED, DealStage.NURTURE],
      };
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        client: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, role: true },
        },
        offers: { orderBy: { createdAt: 'desc' } },
        _count: { select: { dealEvents: true, fundingEvents: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    // Compute HOT flag for each deal
    const enrichedDeals = deals.map((deal) => ({
      ...deal,
      isHot: computeIsHot(deal),
      stageLabel: STAGE_LABELS[deal.stage] || deal.stage,
    }));

    res.json(enrichedDeals);
  }

  // GET /api/deals/board - Pipeline board data grouped by stage
  static async getBoard(req: AuthRequest, res: Response) {
    const { repId, teamView } = req.query;

    // teamView=true → показываем все данные команды (даже для REP)
    const filter = teamView === 'true' ? {} : repFilter(req.user);
    const where: any = { ...filter };
    const requestedRepId = repId ? String(repId) : '';
    const canScopeToRep = !!requestedRepId && (isAdminLike(req.user) || requestedRepId === req.user?.id);
    if (canScopeToRep) {
      Object.assign(where, repScopeFilter(requestedRepId, true));
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        client: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, role: true },
        },
        offers: { orderBy: { createdAt: 'desc' }, take: 3 },
        fundingEvents: {
          orderBy: [{ fundedDate: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    // Group by stage
    const board: Record<string, any[]> = {};
    for (const stage of STAGE_ORDER) {
      board[stage] = [];
    }

    for (const deal of deals) {
      const enriched = {
        ...deal,
        isHot: computeIsHot(deal),
        stageLabel: STAGE_LABELS[deal.stage] || deal.stage,
      };
      if (board[deal.stage]) {
        board[deal.stage].push(enriched);
      }
    }

    // Stage metadata
    const NO_AMOUNT_STAGES = ['NEW_LEAD', 'ENGAGED_INTERESTED', 'QUALIFIED'];
    const stages = STAGE_ORDER.map((stage, index) => {
      const deals = board[stage] || [];
      // Dollar value ONLY from lender offers (Approved/Committed) or funding events (Funded)
      let value = 0;
      if (!NO_AMOUNT_STAGES.includes(stage)) {
        if (stage === 'FUNDED') {
          // Use dealAmount as fallback for funded deals (it's set from actual funding)
          value = deals.reduce((sum: number, d: any) => sum + (d.dealAmount || 0), 0);
        } else if (stage === 'NURTURE') {
          // Nurture: use prevOffer (prior funded amount before they went to nurture)
          value = deals.reduce((sum: number, d: any) => sum + (d.prevOffer || d.dealAmount || 0), 0);
        } else if (stage === 'SUBMITTED_IN_REVIEW') {
          // Submitted total should count ONLY SBA/CRE/Equipment submitted amounts.
          value = deals.reduce((sum: number, d: any) => {
            if (!isSubmittedAmountProduct(d.productType)) return sum;
            return sum + (d.submittedAmount || d.dealAmount || 0);
          }, 0);
        } else {
          // For Approved/Committed: use best offer amount, fallback to dealAmount
          value = deals.reduce((sum: number, d: any) => {
            const bestOffer = (d.offers || []).reduce(
              (best: any, o: any) => (!best || o.amount > best.amount ? o : best),
              null,
            );
            return sum + (bestOffer?.amount || d.dealAmount || 0);
          }, 0);
        }
      }
      return {
        stage,
        label: STAGE_LABELS[stage],
        order: index,
        deals,
        count: deals.length,
        value,
      };
    });

    res.json({ stages });
  }

  // GET /api/deals/:id - Single deal with full details
  static async getDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const filter = repFilter(req.user);

    const deal = await prisma.deal.findFirst({
      where: { id, ...filter },
      include: {
        client: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, role: true },
        },
        offers: { orderBy: { createdAt: 'desc' } },
        fundingEvents: { orderBy: { createdAt: 'desc' } },
        dealEvents: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { rep: { select: { id: true, firstName: true, lastName: true, initials: true } } },
        },
        renewalTasks: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Also check assisting reps access
    if (req.user?.role !== 'ADMIN' && deal.assignedRepId !== req.user?.id) {
      const assistingIds = (deal.assistingRepIds as string[]) || [];
      if (!assistingIds.includes(req.user!.id)) {
        return res.status(404).json({ error: 'Deal not found' });
      }
    }

    res.json({
      ...deal,
      isHot: computeIsHot(deal),
      stageLabel: STAGE_LABELS[deal.stage] || deal.stage,
    });
  }

  // POST /api/deals - Create a new deal
  static async createDeal(req: AuthRequest, res: Response) {
    const {
      businessName,
      contactName,
      phone,
      email,
      state,
      productType,
      dealAmount,
      submittedAmount,
      assignedRepId,
      nextAction,
      nextActionDue,
      notes,
      clientId: existingClientId,
    } = req.body;

    // Create or connect client
    let client;
    if (existingClientId) {
      // Use existing client (e.g. creating new product deal for same client)
      client = await prisma.client.findUnique({ where: { id: existingClientId } });
      if (!client) return res.status(400).json({ error: 'Client not found' });
    } else if (phone) {
      client = await prisma.client.upsert({
        where: { phone },
        update: { businessName: businessName || undefined, contactName, email, state },
        create: { businessName: businessName || 'Unknown Business', contactName, phone, email, state },
      });
    } else {
      client = await prisma.client.create({
        data: { businessName: businessName || 'Unknown Business', contactName, email, state },
      });
    }

    // Try to find and link an existing lead by phone
    let linkedLeadId: string | undefined;
    if (phone) {
      const existingLead = await prisma.lead.findUnique({ where: { phone }, select: { id: true } });
      if (existingLead) {
        // Only link if lead is not already linked to another deal (leadId has @unique constraint)
        const alreadyLinked = await prisma.deal.findFirst({ where: { leadId: existingLead.id }, select: { id: true } });
        if (!alreadyLinked) linkedLeadId = existingLead.id;
      }
    }

    // Rule #7: Rep assignment = admin only
    const effectiveRepId = req.user?.role === 'ADMIN' && assignedRepId ? assignedRepId : req.user!.id;

    const parsedProductType = normalizeProductType(productType);
    if (productType !== undefined && productType !== null && !parsedProductType) {
      return res.status(400).json({ error: 'Invalid product type' });
    }

    // Determine initial stage based on product type (Item 11)
    const initialStage = isSubmittedAmountProduct(parsedProductType)
      ? DealStage.SUBMITTED_IN_REVIEW
      : DealStage.NEW_LEAD;

    const parsedDealAmount = parseOptionalFloat(dealAmount);
    const parsedSubmittedAmount =
      parseOptionalFloat(submittedAmount) ?? (isSubmittedAmountProduct(parsedProductType) ? parsedDealAmount : null);

    const initialNotes = typeof notes === 'string' ? notes.trim() : '';

    // Stage-aware default next action (Bug 3 fix)
    const defaultNextAction =
      initialStage === DealStage.SUBMITTED_IN_REVIEW
        ? 'Follow up lender — app in review'
        : 'Make first contact within 24h';

    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        assignedRepId: effectiveRepId,
        leadId: linkedLeadId || null,
        stage: initialStage,
        stageLabel: STAGE_LABELS[initialStage],
        productType: parsedProductType,
        dealAmount: isSubmittedAmountProduct(parsedProductType) ? null : parsedDealAmount,
        submittedAmount: isSubmittedAmountProduct(parsedProductType) ? parsedSubmittedAmount : null,
        needsAmount: isSubmittedAmountProduct(parsedProductType) ? !parsedSubmittedAmount : !parsedDealAmount,
        appSubmitted: initialStage === DealStage.SUBMITTED_IN_REVIEW,
        nextAction: nextAction || defaultNextAction,
        nextActionDue: nextActionDue ? new Date(nextActionDue) : new Date(Date.now() + 24 * 60 * 60 * 1000),
        notes: initialNotes || null,
      } as any,
      include: { client: true, assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } } },
    });

    // Log event
    await prisma.dealEvent.create({
      data: {
        dealId: deal.id,
        repId: req.user!.id,
        eventType: 'deal_created',
        toStage: initialStage,
        note: `Deal created for ${client.businessName}`,
      },
    });

    // FIX 2: Автоматически заполняем source из SMS-кампании/листа, если deal связан с lead
    if (linkedLeadId) {
      const [campaignLead, campaignMessage, linkedLead] = await Promise.all([
        prisma.campaignLead.findFirst({
          where: { leadId: linkedLeadId },
          orderBy: { createdAt: 'desc' },
          include: { campaign: { select: { name: true } } },
        }),
        prisma.message.findFirst({
          where: {
            campaignId: { not: null },
            conversation: {
              leadId: linkedLeadId,
            },
          },
          orderBy: { createdAt: 'desc' },
          include: { campaign: { select: { name: true } } },
        }),
        prisma.lead.findUnique({
          where: { id: linkedLeadId },
          select: { source: true },
        }),
      ]);

      const resolvedSource =
        campaignLead?.campaign?.name?.trim() ||
        campaignMessage?.campaign?.name?.trim() ||
        (linkedLead?.source || '').trim();

      if (resolvedSource) {
        const sourceNote = `Source: SMS — ${resolvedSource}`;
        await prisma.deal.update({
          where: { id: deal.id },
          data: { clientNotes: sourceNote },
        });
      }
    }

    if (initialNotes) {
      await prisma.dealEvent.create({
        data: {
          dealId: deal.id,
          repId: req.user!.id,
          eventType: 'note_added',
          note: initialNotes.slice(0, 80),
        },
      });
    }

    // Emit real-time update
    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: deal.id, stage: deal.stage });

    res.status(201).json(deal);
  }

  // PUT /api/deals/:id - Update deal
  static async updateDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const updateData: any = { ...req.body };
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(updateData, key);

    // Normalize date-only strings to full ISO DateTime (Prisma requires ISO-8601)
    if (
      updateData.nextActionDue &&
      typeof updateData.nextActionDue === 'string' &&
      !updateData.nextActionDue.includes('T')
    ) {
      updateData.nextActionDue = new Date(updateData.nextActionDue + 'T12:00:00.000Z');
    }
    if (
      updateData.followUpDate &&
      typeof updateData.followUpDate === 'string' &&
      !updateData.followUpDate.includes('T')
    ) {
      updateData.followUpDate = new Date(updateData.followUpDate + 'T12:00:00.000Z');
    }
    if (updateData.fundedDate && typeof updateData.fundedDate === 'string' && !updateData.fundedDate.includes('T')) {
      updateData.fundedDate = new Date(updateData.fundedDate + 'T12:00:00.000Z');
    }

    const existing = await prisma.deal.findUnique({ where: { id }, include: { client: true } });
    if (!existing) return res.status(404).json({ error: 'Deal not found' });

    // REP может редактировать только свои сделки
    if (!isAdminLike(req.user) && existing.assignedRepId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only edit deals assigned to you' });
    }

    const fundingEventUpdate = hasOwn('fundingEventUpdate') ? updateData.fundingEventUpdate : null;
    delete updateData.fundingEventUpdate;

    const notesProvided = hasOwn('notes');
    const previousNotes = (existing.notes || '').trim();
    let nextNotes = previousNotes;
    if (notesProvided) {
      nextNotes = typeof updateData.notes === 'string' ? updateData.notes.trim() : '';
      updateData.notes = nextNotes || null;
    }

    // Rule #9: Closed deals locked — only admin can edit
    if (existing.stage === DealStage.CLOSED && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Closed deals are locked. Ask an admin to unlock.' });
    }

    // Permission check
    if (req.user?.role !== 'ADMIN') {
      const assistingIds = (existing.assistingRepIds as string[]) || [];
      if (existing.assignedRepId !== req.user?.id && !assistingIds.includes(req.user!.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Reps cannot change ownership
      delete updateData.assignedRepId;
      delete updateData.assistingRepIds;
    }

    const productTypeProvided = hasOwn('productType');
    const dealAmountProvided = hasOwn('dealAmount');
    const submittedAmountProvided = hasOwn('submittedAmount');
    if (productTypeProvided || dealAmountProvided || submittedAmountProvided) {
      let effectiveProductType = existing.productType;

      if (productTypeProvided) {
        if (updateData.productType === '' || updateData.productType === null) {
          updateData.productType = null;
          effectiveProductType = null;
        } else {
          const normalizedProductType = normalizeProductType(updateData.productType);
          if (!normalizedProductType) {
            return res.status(400).json({ error: 'Invalid product type' });
          }
          updateData.productType = normalizedProductType;
          effectiveProductType = normalizedProductType;
        }
      }

      if (dealAmountProvided) {
        updateData.dealAmount = parseOptionalFloat(updateData.dealAmount);
      }
      if (submittedAmountProvided) {
        updateData.submittedAmount = parseOptionalFloat(updateData.submittedAmount);
      }

      if (isSubmittedAmountProduct(effectiveProductType)) {
        const effectiveSubmittedAmount = submittedAmountProvided
          ? updateData.submittedAmount
          : dealAmountProvided
            ? updateData.dealAmount
            : ((existing as any).submittedAmount ?? existing.dealAmount ?? null);
        updateData.submittedAmount = effectiveSubmittedAmount;
        updateData.dealAmount = null;
        updateData.needsAmount = !effectiveSubmittedAmount;
      } else {
        const effectiveDealAmount = dealAmountProvided
          ? updateData.dealAmount
          : submittedAmountProvided
            ? updateData.submittedAmount
            : (existing.dealAmount ?? (existing as any).submittedAmount ?? null);
        updateData.dealAmount = effectiveDealAmount;
        updateData.submittedAmount = null;
        updateData.needsAmount = !effectiveDealAmount;
      }
    }

    // Rule #12: Follow-up requires type + date + note (ALL required)
    if (updateData.followUpDate || updateData.followUpType || updateData.followUpNote) {
      if (!updateData.followUpDate || !updateData.followUpType || !updateData.followUpNote) {
        return res.status(400).json({ error: 'Follow-up requires type, date, and note (all three are required)' });
      }
      // Convert date string to proper Date object for Prisma DateTime field
      updateData.followUpDate = new Date(updateData.followUpDate);

      // Auto-update nextAction and nextActionDue based on follow-up
      const typeLabels: Record<string, string> = {
        renewal: 'Renewal follow-up',
        nurture: 'Nurture check-in',
        statement_refresh: 'Statement refresh',
        check_timing: 'Check timing',
        re_engage: 'Re-engage',
      };
      const actionLabel = typeLabels[updateData.followUpType] || 'Follow up';
      updateData.nextAction = `${actionLabel} — ${updateData.followUpNote}`;
      updateData.nextActionDue = updateData.followUpDate;

      // Move to NURTURE if not already there (and not in Funded/Closed)
      if (!['NURTURE', 'FUNDED', 'CLOSED'].includes(existing.stage)) {
        updateData.stage = DealStage.NURTURE;
        updateData.stageLabel = STAGE_LABELS[DealStage.NURTURE];
        updateData.daysInStage = 0;

        await prisma.dealEvent.create({
          data: {
            dealId: id,
            repId: req.user!.id,
            eventType: 'stage_change',
            fromStage: existing.stage,
            toStage: DealStage.NURTURE,
            note: `Follow-up scheduled: ${actionLabel}`,
          },
        });
      }

      // Log the follow-up event
      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'follow_up',
          note: `${actionLabel}: ${updateData.followUpNote} (due ${updateData.followUpDate.toISOString().split('T')[0]})`,
        },
      });
    }

    // AUTOMATION RULE 1: App Submitted → Submitted (In Review)
    // Guard: Never regress deals already in APPROVED_OFFERS or later stages
    const advancedStages: DealStage[] = [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING, DealStage.FUNDED];
    if (
      updateData.appSubmitted === true &&
      !existing.appSubmitted &&
      !advancedStages.includes(existing.stage) &&
      !advancedStages.includes(updateData.stage)
    ) {
      updateData.stage = DealStage.SUBMITTED_IN_REVIEW;
      updateData.stageLabel = STAGE_LABELS[DealStage.SUBMITTED_IN_REVIEW];
      updateData.daysInStage = 0;
      updateData.nextAction = 'Follow up lender — app in review';

      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'stage_change',
          fromStage: existing.stage,
          toStage: DealStage.SUBMITTED_IN_REVIEW,
          note: 'Auto-moved: app submitted',
        },
      });
    }

    // AUTOMATION RULE 3: Client Accepted Terms → Committed (Funding)
    if (updateData.stage === DealStage.COMMITTED_FUNDING && existing.stage === DealStage.APPROVED_OFFERS) {
      updateData.stageLabel = STAGE_LABELS[DealStage.COMMITTED_FUNDING];
      updateData.commitSubStatus = CommitSubStatus.DOCS_REQUESTED;
      updateData.daysInSubStatus = 0;
      updateData.nextAction = 'Send doc checklist to client';

      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'stage_change',
          fromStage: DealStage.APPROVED_OFFERS,
          toStage: DealStage.COMMITTED_FUNDING,
          note: 'Client accepted terms',
        },
      });
    }

    // Stage label sync
    if (updateData.stage && updateData.stage !== existing.stage) {
      updateData.stageLabel = STAGE_LABELS[updateData.stage as DealStage] || updateData.stage;
      if (!updateData.daysInStage && updateData.daysInStage !== 0) {
        updateData.daysInStage = 0;
      }

      // Log stage change if not already logged above
      if (updateData.stage !== DealStage.SUBMITTED_IN_REVIEW && updateData.stage !== DealStage.COMMITTED_FUNDING) {
        await prisma.dealEvent.create({
          data: {
            dealId: id,
            repId: req.user!.id,
            eventType: 'stage_change',
            fromStage: existing.stage,
            toStage: updateData.stage,
            note: `Stage changed to ${STAGE_LABELS[updateData.stage as DealStage] || updateData.stage}`,
          },
        });
      }
    }

    if (fundingEventUpdate?.id) {
      const existingFundingEvent = await prisma.fundingEvent.findFirst({
        where: { id: String(fundingEventUpdate.id), dealId: id },
      });
      if (!existingFundingEvent) {
        return res.status(404).json({ error: 'Funding event not found' });
      }

      const nextAmount = parseOptionalFloat(fundingEventUpdate.amountFunded) ?? existingFundingEvent.amountFunded;
      if (nextAmount <= 0) {
        return res.status(400).json({ error: 'Funded amount must be greater than 0' });
      }

      const nextProductType =
        normalizeProductType(fundingEventUpdate.productType) ||
        existingFundingEvent.productType ||
        existing.productType;

      let nextFundedDate: Date | null = existingFundingEvent.fundedDate || null;
      if (fundingEventUpdate.fundedDate !== undefined) {
        if (!fundingEventUpdate.fundedDate) {
          nextFundedDate = null;
        } else if (
          typeof fundingEventUpdate.fundedDate === 'string' &&
          !String(fundingEventUpdate.fundedDate).includes('T')
        ) {
          nextFundedDate = new Date(String(fundingEventUpdate.fundedDate) + 'T12:00:00.000Z');
        } else {
          nextFundedDate = new Date(fundingEventUpdate.fundedDate);
        }
        if (nextFundedDate && isNaN(nextFundedDate.getTime())) {
          return res.status(400).json({ error: 'Invalid funded date' });
        }
      }

      let nextTermMonths = existingFundingEvent.termMonths;
      if (fundingEventUpdate.termMonths !== undefined) {
        const rawTerm = String(fundingEventUpdate.termMonths ?? '').trim();
        if (!rawTerm) {
          nextTermMonths = null;
        } else {
          const parsedTerm = parseInt(rawTerm, 10);
          if (!Number.isFinite(parsedTerm)) {
            return res.status(400).json({ error: 'Invalid term months' });
          }
          nextTermMonths = parsedTerm;
        }
      }
      const nextRate =
        fundingEventUpdate.rate !== undefined ? parseOptionalFloat(fundingEventUpdate.rate) : existingFundingEvent.rate;
      const nextLender =
        fundingEventUpdate.lender !== undefined
          ? String(fundingEventUpdate.lender || '').trim() || null
          : existingFundingEvent.lender;
      const nextFundingNotes =
        fundingEventUpdate.notes !== undefined
          ? String(fundingEventUpdate.notes || '').trim() || null
          : existingFundingEvent.notes;

      await prisma.fundingEvent.update({
        where: { id: existingFundingEvent.id },
        data: {
          amountFunded: nextAmount,
          lender: nextLender,
          termMonths: nextTermMonths,
          rate: nextRate,
          productType: nextProductType || null,
          fundedDate: nextFundedDate,
          notes: nextFundingNotes,
        },
      });

      const amountDelta = nextAmount - existingFundingEvent.amountFunded;
      if (amountDelta !== 0 && existing.clientId) {
        await prisma.client.update({
          where: { id: existing.clientId },
          data: { totalFunded: { increment: amountDelta } },
        });
      }

      if (existing.stage === DealStage.FUNDED) {
        updateData.dealAmount = nextAmount;
        updateData.fundedDate = nextFundedDate;
        if (nextProductType) updateData.productType = nextProductType;
      }

      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'funding_event_updated',
          note: `Funding event updated: $${existingFundingEvent.amountFunded.toLocaleString()} → $${nextAmount.toLocaleString()}`,
        },
      });
    }

    const noteEventType =
      notesProvided && nextNotes !== previousNotes
        ? !previousNotes && nextNotes
          ? 'note_added'
          : !nextNotes
            ? 'note_cleared'
            : 'note_updated'
        : null;

    // Update last activity
    updateData.lastActivityAt = new Date();

    // Handle client field updates (businessName, contactName, email, phone)
    const clientFields = updateData.clientUpdate;
    if (clientFields && existing.clientId) {
      const allowedClientFields: Record<string, string> = {};
      if (clientFields.businessName !== undefined) allowedClientFields.businessName = clientFields.businessName;
      if (clientFields.contactName !== undefined) allowedClientFields.contactName = clientFields.contactName;
      if (clientFields.email !== undefined) allowedClientFields.email = clientFields.email;
      if (clientFields.phone !== undefined) allowedClientFields.phone = clientFields.phone;
      if (Object.keys(allowedClientFields).length > 0) {
        await prisma.client.update({ where: { id: existing.clientId }, data: allowedClientFields });
      }
    }

    // Clean up fields that aren't in the model
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.client;
    delete updateData.clientUpdate;
    delete updateData.assignedRep;
    delete updateData.offers;
    delete updateData.fundingEvents;
    delete updateData.dealEvents;
    delete updateData.renewalTasks;
    delete updateData.isHot;

    const deal = await prisma.deal.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
    });

    if (noteEventType) {
      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: noteEventType,
          note: nextNotes ? nextNotes.slice(0, 80) : 'Note cleared',
        },
      });
    }

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: deal.id, stage: deal.stage, repId: deal.assignedRepId });

    res.json({ ...deal, isHot: computeIsHot(deal), stageLabel: STAGE_LABELS[deal.stage] });
  }

  // PUT /api/deals/:id/move - Move deal to a different stage (drag and drop)
  static async moveDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { stage } = req.body;

    if (!stage || !STAGE_ORDER.includes(stage as DealStage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Deal not found' });

    // Rule #9: Closed deals locked — only admin can move
    if (existing.stage === DealStage.CLOSED && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Closed deals are locked. Ask an admin to unlock.' });
    }

    // Nurture requires lost reason + follow-up date
    if (stage === 'NURTURE' && (!req.body.lostReason || !req.body.followUpDate)) {
      return res.status(400).json({ error: 'Nurture stage requires lost reason and follow-up date' });
    }

    // Closed requires disqualification reason
    if (stage === 'CLOSED' && !req.body.disqualReason) {
      return res.status(400).json({ error: 'Closed stage requires disqualification reason' });
    }

    const updateData: any = {
      stage: stage as DealStage,
      stageLabel: STAGE_LABELS[stage as DealStage],
      daysInStage: 0,
      lastActivityAt: new Date(),
    };

    // Bug 3 fix: Update nextAction if it's still the default and doesn't match new stage
    const stageDefaultActions: Record<string, string> = {
      NEW_LEAD: 'Make first contact within 24h',
      SUBMITTED_IN_REVIEW: 'Follow up lender — app in review',
      APPROVED_OFFERS: 'Call client — present offer now',
      COMMITTED_FUNDING: 'Send doc checklist to client',
    };
    const genericDefaults = Object.values(stageDefaultActions);
    if (existing.nextAction && genericDefaults.includes(existing.nextAction)) {
      const newDefault = stageDefaultActions[stage as string];
      if (newDefault) {
        updateData.nextAction = newDefault;
      }
    }

    if (req.body.lostReason) updateData.lostReason = req.body.lostReason;
    if (req.body.disqualReason) updateData.disqualReason = req.body.disqualReason;
    if (req.body.followUpDate) updateData.followUpDate = new Date(req.body.followUpDate);
    if (req.body.followUpType) updateData.followUpType = req.body.followUpType;
    if (req.body.followUpNote) updateData.followUpNote = req.body.followUpNote;

    // When moving to FUNDED: should use markFunded endpoint via modal.
    // moveDeal keeps minimal support in case it's called directly.
    if (stage === 'FUNDED') {
      updateData.fundedDate = new Date();
    }

    // When moving FROM FUNDED to another stage: full rollback
    if (existing.stage === DealStage.FUNDED && stage !== 'FUNDED') {
      updateData.fundedDate = null;

      // Delete funding events and renewal tasks created by markFunded
      const fundingEvents = await prisma.fundingEvent.findMany({ where: { dealId: id } });
      if (fundingEvents.length > 0) {
        await prisma.renewalTask.deleteMany({ where: { dealId: id } });
        const totalRolledBack = fundingEvents.reduce((s, fe) => s + (fe.amountFunded || 0), 0);
        await prisma.fundingEvent.deleteMany({ where: { dealId: id } });

        // Rollback client totals
        if (existing.clientId && totalRolledBack > 0) {
          await prisma.client.update({
            where: { id: existing.clientId },
            data: {
              totalFunded: { decrement: totalRolledBack },
              fundingCount: { decrement: fundingEvents.length },
            },
          });
        }
      }
    }

    // When moving to NURTURE from Approved/Committed: save best offer as prevOffer
    if (stage === 'NURTURE' && ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(existing.stage)) {
      const offers = await prisma.offer.findMany({ where: { dealId: id }, orderBy: { amount: 'desc' }, take: 1 });
      if (offers[0] && !existing.prevOffer) {
        updateData.prevOffer = offers[0].amount;
      }
    }

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'stage_change',
        fromStage: existing.stage,
        toStage: stage,
        note: `Moved to ${STAGE_LABELS[stage as DealStage]}`,
      },
    });

    const deal = await prisma.deal.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
    });

    // Sync deal stage → linked lead status
    const newLeadStatus = DEAL_TO_LEAD[stage as DealStage];
    if (newLeadStatus) {
      let leadId = existing.leadId;
      if (!leadId && deal.client?.phone) {
        const lead = await prisma.lead.findUnique({ where: { phone: deal.client.phone }, select: { id: true } });
        if (lead) {
          leadId = lead.id;
          await prisma.deal.update({ where: { id }, data: { leadId: lead.id } });
        }
      }
      if (leadId) {
        await prisma.lead.update({ where: { id: leadId }, data: { status: newLeadStatus } }).catch(() => {});
      }
    }

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: deal.id, stage: deal.stage, repId: deal.assignedRepId });

    res.json({ ...deal, isHot: computeIsHot(deal), stageLabel: STAGE_LABELS[deal.stage] });
  }

  // POST /api/deals/:id/offers - Add an offer (AUTOMATION RULE 2)
  static async addOffer(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { lenderName, amount, terms, termMonths, rateFactor, notes, expiryDays, productType } = req.body;

    const deal = await prisma.deal.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        assignedRepId: true,
        assistingRepIds: true,
        productType: true,
        dealAmount: true,
      },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (!isAdminLike(req.user)) {
      const assistingIds = (deal.assistingRepIds as string[]) || [];
      const canAccess = deal.assignedRepId === req.user?.id || (!!req.user?.id && assistingIds.includes(req.user.id));
      if (!canAccess) return res.status(403).json({ error: 'Access denied' });
    }
    if (!lenderName || !String(lenderName).trim()) {
      return res.status(400).json({ error: 'Lender name is required' });
    }

    const parsedAmount = parseOptionalFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Offer amount must be greater than 0' });
    }

    const parsedTermMonths =
      termMonths !== undefined && termMonths !== null && String(termMonths).trim() !== ''
        ? parseInt(String(termMonths), 10)
        : null;
    if (parsedTermMonths !== null && (!Number.isFinite(parsedTermMonths) || parsedTermMonths <= 0)) {
      return res.status(400).json({ error: 'Term months must be a positive number' });
    }

    const parsedRateFactor = parseOptionalFloat(rateFactor);

    const normalizedTerms =
      typeof terms === 'string' && terms.trim()
        ? terms.trim()
        : [parsedTermMonths ? `${parsedTermMonths} mo` : null, parsedRateFactor ? `${parsedRateFactor}` : null]
            .filter(Boolean)
            .join(' · ') || null;

    const normalizedOfferProductType = normalizeProductType(productType) || deal.productType;

    const offer = await prisma.offer.create({
      data: {
        dealId: id,
        lenderName,
        amount: parsedAmount,
        termMonths: parsedTermMonths,
        rateFactor: parsedRateFactor,
        terms: normalizedTerms,
        expiryDays: expiryDays ? parseInt(expiryDays) : null,
        productType: normalizedOfferProductType,
      },
    });

    // AUTOMATION RULE 2: Offer Added → Approved / Offers
    // Only auto-move if deal is in an EARLIER stage (not Committed/Funded/Closed)
    const earlierStages: DealStage[] = [
      DealStage.NEW_LEAD,
      DealStage.ENGAGED_INTERESTED,
      DealStage.QUALIFIED,
      DealStage.SUBMITTED_IN_REVIEW,
    ];
    const shouldAutoMove = earlierStages.includes(deal.stage) || deal.stage === DealStage.NURTURE;

    const updateData: any = {
      appSubmitted: true,
      lastActivityAt: new Date(),
      // Only set dealAmount if deal doesn't have one yet
      ...(deal.dealAmount ? {} : { dealAmount: parsedAmount }),
    };

    if (shouldAutoMove) {
      updateData.stage = DealStage.APPROVED_OFFERS;
      updateData.stageLabel = STAGE_LABELS[DealStage.APPROVED_OFFERS];
      updateData.daysInStage = 0;
      updateData.nextAction = 'Call client — present offer now';
      updateData.nextActionDue = new Date();
    }

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'offer_added',
        note: `Offer from ${lenderName}: $${parsedAmount.toLocaleString()}${notes ? ` · ${String(notes).trim()}` : ''}`,
      },
    });

    if (shouldAutoMove) {
      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'stage_change',
          fromStage: deal.stage,
          toStage: DealStage.APPROVED_OFFERS,
          note: 'Auto-moved: offer added',
        },
      });
    }

    await prisma.deal.update({ where: { id }, data: updateData });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: updateData.stage || deal.stage, repId: deal.assignedRepId });

    res.status(201).json(offer);
  }

  // DELETE /api/deals/:id/offers/:offerId - Delete an offer from a deal
  static async deleteOffer(req: AuthRequest, res: Response) {
    const { id, offerId } = req.params;

    const deal = await prisma.deal.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        assignedRepId: true,
        assistingRepIds: true,
        productType: true,
      },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    if (!isAdminLike(req.user)) {
      const assistingIds = (deal.assistingRepIds as string[]) || [];
      const canAccess = deal.assignedRepId === req.user?.id || (!!req.user?.id && assistingIds.includes(req.user.id));
      if (!canAccess) return res.status(403).json({ error: 'Access denied' });
    }

    if (deal.stage === DealStage.FUNDED || deal.stage === DealStage.CLOSED) {
      return res.status(400).json({ error: 'Offers cannot be deleted for funded/closed deals' });
    }

    const offer = await prisma.offer.findFirst({
      where: { id: offerId, dealId: id },
      select: { id: true, lenderName: true, amount: true },
    });
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    await prisma.offer.delete({ where: { id: offerId } });

    const [bestRemainingOffer, remainingCount] = await Promise.all([
      prisma.offer.findFirst({ where: { dealId: id }, orderBy: { amount: 'desc' }, select: { amount: true } }),
      prisma.offer.count({ where: { dealId: id } }),
    ]);

    const dealUpdate: any = { lastActivityAt: new Date() };
    if (bestRemainingOffer) {
      dealUpdate.dealAmount = bestRemainingOffer.amount;
    } else if (!isSubmittedAmountProduct(deal.productType)) {
      dealUpdate.dealAmount = null;
      dealUpdate.needsAmount = true;
    }
    await prisma.deal.update({ where: { id }, data: dealUpdate });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'offer_deleted',
        note: `Offer removed: ${offer.lenderName} ($${offer.amount.toLocaleString()})`,
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: deal.stage, repId: deal.assignedRepId });

    res.json({ deleted: true, offerId, remainingOffers: remainingCount });
  }

  // POST /api/deals/:id/fund - Mark as Funded (AUTOMATION RULE 4)
  static async markFunded(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { amountFunded, lender, notes, productType, fundedDate } = req.body;

    const deal = await prisma.deal.findUnique({ where: { id }, include: { client: true } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const amount = parseFloat(amountFunded);
    const fDate = fundedDate ? new Date(fundedDate) : new Date();

    // Calculate cycle time
    let cycleTime: number | null = null;
    if (deal.appSubmitted && deal.createdAt) {
      cycleTime = Math.ceil((fDate.getTime() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    }

    const normalizedFundingProductType = normalizeProductType(productType) || deal.productType || null;

    // Create funding event
    const fundingEvent = await prisma.fundingEvent.create({
      data: {
        dealId: id,
        repId: deal.assignedRepId,
        amountFunded: amount,
        lender: lender || deal.lender,
        productType: normalizedFundingProductType,
        fundedDate: fDate,
        notes,
      },
    });

    // Create 3 renewal tasks
    const renewalTaskDates = [
      { taskType: '35d_checkin', dueDate: new Date(fDate.getTime() + 35 * 24 * 60 * 60 * 1000) },
      { taskType: 'midpoint', dueDate: new Date(fDate.getTime() + 90 * 24 * 60 * 60 * 1000) },
      { taskType: 'payoff_30d', dueDate: new Date(fDate.getTime() + 150 * 24 * 60 * 60 * 1000) },
    ];

    await prisma.renewalTask.createMany({
      data: renewalTaskDates.map((t) => ({
        dealId: id,
        repId: deal.assignedRepId,
        taskType: t.taskType,
        dueDate: t.dueDate,
      })),
    });

    // Update deal to Funded
    await prisma.deal.update({
      where: { id },
      data: {
        stage: DealStage.FUNDED,
        stageLabel: STAGE_LABELS[DealStage.FUNDED],
        productType: normalizedFundingProductType,
        fundedDate: fDate,
        cycleTime,
        dealAmount: amount,
        lastActivityAt: new Date(),
        daysInStage: 0,
      },
    });

    // Update client totals
    await prisma.client.update({
      where: { id: deal.clientId },
      data: {
        totalFunded: { increment: amount },
        fundingCount: { increment: 1 },
        lastFundedDate: fDate,
      },
    });

    // Log events
    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'funded',
        note: `Deal funded: $${amount.toLocaleString()} via ${lender || 'N/A'}`,
      },
    });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'stage_change',
        fromStage: deal.stage,
        toStage: DealStage.FUNDED,
        note: 'Marked as funded',
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: DealStage.FUNDED, repId: deal.assignedRepId });

    res.json({ fundingEvent, message: 'Deal marked as funded, 3 renewal tasks created' });
  }

  // POST /api/deals/:id/complete-action - Complete Action modal (2-step)
  static async completeAction(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { actionType, nextAction, nextActionDue, note } = req.body;

    if (!actionType) return res.status(400).json({ error: 'Action type is required' });
    if (!nextAction) return res.status(400).json({ error: 'Next action is required' });
    if (!nextActionDue) return res.status(400).json({ error: 'Next action due date is required' });

    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Log completed action
    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'action_completed',
        note: `${actionType}${note ? ' — ' + note : ''} → Next: ${nextAction}`,
        metadata: { actionType, nextAction, nextActionDue },
      },
    });

    // Update deal
    const dueDateNormalized =
      typeof nextActionDue === 'string' && !nextActionDue.includes('T')
        ? new Date(nextActionDue + 'T12:00:00.000Z')
        : new Date(nextActionDue);

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        lastActivityAt: new Date(),
        nextAction,
        nextActionDue: dueDateNormalized,
        staleDays: 0,
      },
      include: { client: true, assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } } },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: deal.stage, repId: deal.assignedRepId });

    res.json(updated);
  }

  // POST /api/deals/:id/share - Share deal with assisting rep(s) + change primary
  static async shareDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { assistingRepIds, assignedRepId } = req.body;

    // Only admin or primary rep can share
    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    if (req.user?.role !== 'ADMIN' && deal.assignedRepId !== req.user?.id) {
      return res.status(403).json({ error: 'Only the primary rep or admin can share deals' });
    }

    const updateData: any = {};
    if (assistingRepIds !== undefined) updateData.assistingRepIds = assistingRepIds || [];
    if (assignedRepId !== undefined) updateData.assignedRepId = assignedRepId;

    const updated = await prisma.deal.update({
      where: { id },
      data: updateData,
    });

    const noteFragments: string[] = [];
    if (assignedRepId && assignedRepId !== deal.assignedRepId) {
      noteFragments.push(`Primary rep changed`);
    }
    if (assistingRepIds) {
      noteFragments.push(`Shared with ${(assistingRepIds || []).length} rep(s)`);
    }

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'deal_shared',
        note: noteFragments.join('; ') || 'Deal sharing updated',
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: deal.stage });

    res.json(updated);
  }

  // POST /api/deals/:id/log-call - Log a call
  static async logCall(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const deal = await prisma.deal.findUnique({ where: { id }, include: { client: true } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'call_logged',
        note: `Call initiated to ${deal.client.businessName}`,
      },
    });

    await prisma.deal.update({ where: { id }, data: { lastActivityAt: new Date(), staleDays: 0 } });

    res.json({ phoneNumber: deal.client.phone, message: 'Call logged' });
  }

  // PUT /api/deals/renewal-tasks/:taskId/complete - Complete a renewal task
  static async completeRenewalTask(req: AuthRequest, res: Response) {
    const { taskId } = req.params;
    const { note } = req.body;

    const task = await prisma.renewalTask.findUnique({
      where: { id: taskId },
      include: { deal: { select: { id: true, assignedRepId: true } } },
    });
    if (!task) return res.status(404).json({ error: 'Renewal task not found' });

    const updated = await prisma.renewalTask.update({
      where: { id: taskId },
      data: { status: RenewalTaskStatus.COMPLETED, completedAt: new Date() },
    });

    await prisma.dealEvent.create({
      data: {
        dealId: task.dealId,
        repId: req.user!.id,
        eventType: 'renewal_completed',
        note: note || `Renewal task completed: ${task.taskType}`,
      },
    });

    res.json(updated);
  }

  // GET /api/deals/stats - Bottom stats bar data
  static async getStats(req: AuthRequest, res: Response) {
    const { repId, teamView } = req.query;
    const requestedRepId = repId ? String(repId) : null;
    const selectedRepId =
      requestedRepId && (isAdminLike(req.user) || requestedRepId === req.user?.id) ? requestedRepId : null;
    // teamView=true → показываем командные данные (без фильтра по пользователю)
    const isTeamView = teamView === 'true';
    const where: any = selectedRepId ? repScopeFilter(selectedRepId, true) : isTeamView ? {} : repFilter(req.user);
    const fundingScopedRepId = selectedRepId || (!isTeamView && !isAdminLike(req.user) ? req.user!.id : null);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const fundingEventScope = fundingScopedRepId ? { deal: repScopeFilter(fundingScopedRepId, true) } : {};

    const [deals, fundedMTD, fundedMTDCount, allDeals] = await Promise.all([
      // Active pipeline deals
      prisma.deal.findMany({
        where: { ...where, stage: { in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] } },
        select: {
          dealAmount: true,
          stage: true,
          nextActionDue: true,
          nextAction: true,
          lastActivityAt: true,
          offers: { select: { amount: true } },
        },
      }),
      // Funded MTD — сумма
      prisma.fundingEvent.aggregate({
        where: {
          ...fundingEventScope,
          fundedDate: { gte: startOfMonth, lt: endOfMonth },
        },
        _sum: { amountFunded: true },
      }),
      // Funded MTD — количество уникальных deals
      prisma.fundingEvent.groupBy({
        by: ['dealId'],
        where: {
          ...fundingEventScope,
          fundedDate: { gte: startOfMonth, lt: endOfMonth },
        },
      }),
      // All active deals for counts
      prisma.deal.findMany({
        where: { ...where, stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] } },
        select: {
          lastReplyAt: true,
          stage: true,
          lenderEngaged: true,
          appSubmitted: true,
          nextAction: true,
          nextActionDue: true,
          followUpDate: true,
          dealAmount: true,
          lastActivityAt: true,
          prevOffer: true,
        },
      }),
    ]);

    // Lifetime Funded
    const lifetimeFunded = await prisma.fundingEvent.aggregate({
      where: fundingEventScope,
      _sum: { amountFunded: true },
    });

    // Active Pipeline $ = Approved + Committed (best offer per deal, matching column headers)
    const bestOfferValue = (d: any) => {
      const best = (d.offers || []).reduce((b: any, o: any) => (!b || o.amount > b.amount ? o : b), null);
      return best?.amount || d.dealAmount || 0;
    };
    const activePipeline = deals.reduce((sum, d) => sum + bestOfferValue(d), 0);

    // At Risk $ = Approved + Committed with overdue/stalled
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const atRisk = deals
      .filter(
        (d) =>
          (d.nextActionDue && new Date(d.nextActionDue) < now) ||
          !d.nextAction ||
          (d.lastActivityAt && new Date(d.lastActivityAt) < fortyEightHoursAgo),
      )
      .reduce((sum, d) => sum + bestOfferValue(d), 0);

    // Hot count
    const hotCount = allDeals.filter((d) => computeIsHot(d)).length;

    // No next action count
    const noNextAction = allDeals.filter((d) => !d.nextAction).length;

    // Queue today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const queueToday = allDeals.filter((d) => d.followUpDate && new Date(d.followUpDate) <= tomorrow).length;

    // Pipeline Value = Approved + Committed + Nurture (only prevOffer > 0 per spec)
    const nurtureDeals = await prisma.deal.findMany({
      where: { ...where, stage: DealStage.NURTURE, prevOffer: { gt: 0 } },
      select: { prevOffer: true },
    });
    const nurtureValue = nurtureDeals.reduce((sum, d) => sum + (d.prevOffer || 0), 0);

    // Renewal tasks due
    const renewalsDue = await prisma.renewalTask.count({
      where: {
        ...(fundingScopedRepId ? { repId: fundingScopedRepId } : {}),
        status: { in: [RenewalTaskStatus.PENDING, RenewalTaskStatus.OVERDUE] },
        dueDate: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
    });

    // Committed $ — use best offer (consistent with pipeline board)
    const committedValue = deals
      .filter((d) => d.stage === DealStage.COMMITTED_FUNDING)
      .reduce((sum, d) => sum + bestOfferValue(d), 0);

    // Monthly Goal — individual rep or team sum
    let monthlyGoal = 0;
    if (fundingScopedRepId) {
      const repUser = await prisma.user.findUnique({
        where: { id: fundingScopedRepId },
        select: { monthlyGoal: true },
      });
      monthlyGoal = repUser?.monthlyGoal || 0;
    } else {
      const allReps = await prisma.user.aggregate({
        where: { role: { in: ['REP', 'ADMIN', 'MANAGER'] }, isActive: true },
        _sum: { monthlyGoal: true },
      });
      monthlyGoal = allReps._sum.monthlyGoal || 0;
    }

    res.json({
      activePipeline,
      activeCount: allDeals.length,
      fundedMTD: fundedMTD._sum.amountFunded || 0,
      fundedThisMonthCount: fundedMTDCount.length,
      lifetimeFunded: lifetimeFunded._sum.amountFunded || 0,
      monthlyGoal,
      atRisk,
      hotCount,
      noNextAction,
      queueToday,
      pipelineValue: activePipeline + nurtureValue,
      renewalsDue,
      committedValue,
    });
  }

  // GET /api/deals/revive-queue - Revive/Renewal Queue
  // Spec: 3 sources — Renewal (funded 150+ days), Revive (nurture/approved 30+ days idle),
  //                     Statement refresh (submitted 21+ days without activity)
  static async getReviveQueue(req: AuthRequest, res: Response) {
    const { repId, primaryOnly } = req.query;
    const forcePrimary = String(primaryOnly || '').toLowerCase() === 'true';
    let filter: any = repFilter(req.user, { primaryOnly: forcePrimary });

    if (isAdminLike(req.user) && repId) {
      filter = repScopeFilter(String(repId), !forcePrimary);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const oneHundredFiftyDaysAgo = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);

    const [renewalCandidates, reviveCandidates, statementRefresh, followUpDue] = await Promise.all([
      // Source 1: Renewal — funded 150+ days ago
      prisma.deal.findMany({
        where: {
          ...filter,
          stage: DealStage.FUNDED,
          fundedDate: { lte: oneHundredFiftyDaysAgo },
        },
        include: {
          client: true,
          assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      }),
      // Source 2: Revive — nurture/approved 30+ days idle
      prisma.deal.findMany({
        where: {
          ...filter,
          stage: { in: [DealStage.NURTURE, DealStage.APPROVED_OFFERS] },
          lastActivityAt: { lte: thirtyDaysAgo },
        },
        include: {
          client: true,
          assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      }),
      // Source 3: Statement refresh — submitted 21+ days
      prisma.deal.findMany({
        where: {
          ...filter,
          stage: DealStage.SUBMITTED_IN_REVIEW,
          lastActivityAt: { lte: twentyOneDaysAgo },
        },
        include: {
          client: true,
          assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      }),
      // Also include deals with past-due follow-up dates
      prisma.deal.findMany({
        where: {
          ...filter,
          followUpDate: { lte: now },
          stage: { notIn: [DealStage.CLOSED] },
        },
        include: {
          client: true,
          assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      }),
    ]);

    // Tag each with source and deduplicate
    const seen = new Set<string>();
    const all: any[] = [];
    for (const d of renewalCandidates) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        all.push({ ...d, reviveSource: 'renewal' });
      }
    }
    for (const d of reviveCandidates) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        all.push({ ...d, reviveSource: 'revive' });
      }
    }
    for (const d of statementRefresh) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        all.push({ ...d, reviveSource: 'statement_refresh' });
      }
    }
    for (const d of followUpDue) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        all.push({ ...d, reviveSource: 'follow_up' });
      }
    }

    // Sort by urgency: follow_up first (past due), then by amount desc
    all.sort((a, b) => {
      if (a.reviveSource === 'follow_up' && b.reviveSource !== 'follow_up') return -1;
      if (b.reviveSource === 'follow_up' && a.reviveSource !== 'follow_up') return 1;
      return (b.dealAmount || 0) - (a.dealAmount || 0);
    });

    res.json(all);
  }

  // POST /api/deals/import-csv - Import historical funded deals from CSV (admin only)
  static async importCSV(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

    // Load reps for strict initials/full-name matching
    const reps: RepIdentity[] = await prisma.user.findMany({
      select: { id: true, firstName: true, lastName: true, initials: true },
    });

    // Admin can assign all deals to a specific rep
    const assignToRepId = req.body?.assignToRepId || null;
    if (assignToRepId) {
      const repExists = reps.some((r) => r.id === assignToRepId);
      if (!repExists) return res.status(400).json({ error: 'Invalid rep ID' });
    }

    const batchId = `import_${Date.now()}`;
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of records) {
      // Support multiple CSV column naming conventions
      const businessName =
        row.business_name || row.BusinessName || row['Business Name'] || row.company || row.Company || '';
      const contactName = row.contact_name || row.ContactName || row.Contact || '';
      const repName = row.rep_name || row.RepName || row.rep || row.originator || row['FDR Originator'] || '';
      const productRaw = (row.product_type || row.ProductType || row.product || '').toUpperCase();
      const amountStr = (
        row.funded_amount ||
        row.FundedAmount ||
        row.amount ||
        row['Funded Amount (last)'] ||
        '0'
      ).replace(/[$,]/g, '');
      const dateStr =
        row.funded_date || row.FundedDate || row['Funded Date'] || row['Funded Date (last)'] || row.date || '';
      const phone = row.phone || row.Phone || row['Contact Phone Number'] || null;
      const email = row.email || row.Email || row['Contact Email'] || null;
      const lender = row.lender || row.Lender || row['FDR Funded By'] || undefined;
      const state = row.state || row.State || row['State of Incorporation'] || undefined;

      if (!businessName && !contactName) {
        skipped++;
        errors.push('Row missing business_name / Contact');
        continue;
      }

      // Use contactName as businessName fallback for display
      const effectiveBusinessName = businessName || contactName;

      const amount = parseFloat(amountStr) || 0;
      const fundedDate = dateStr ? new Date(dateStr) : new Date();
      if (dateStr && isNaN(fundedDate.getTime())) {
        skipped++;
        errors.push(`Invalid date: ${dateStr}`);
        continue;
      }

      const repMatch = repName ? matchRepByName(reps, repName) : null;
      if (!assignToRepId && repName && !repMatch) {
        skipped++;
        errors.push(`Unknown rep "${repName}" for "${effectiveBusinessName}"`);
        continue;
      }
      const repId = assignToRepId || repMatch?.id || req.user!.id;

      // Map product type
      const productMap: Record<string, ProductType> = {
        MCA: ProductType.MCA,
        LOC: ProductType.LOC,
        'LINE OF CREDIT': ProductType.LOC,
        EQUIPMENT: ProductType.EQUIPMENT,
        HELOC: ProductType.HELOC,
        SBA: ProductType.SBA,
        CRE: ProductType.CRE,
        BRIDGE: ProductType.BRIDGE,
      };
      const productType = productMap[productRaw] || null;

      // Normalize phone to E.164 format
      const normalizedPhone = phone ? phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1') : null;

      // Check for existing client by phone to avoid duplicates
      let client;
      if (normalizedPhone) {
        client = await prisma.client.findFirst({ where: { phone: normalizedPhone } });
        if (client && !client.businessName && effectiveBusinessName !== client.contactName) {
          // Update businessName if it was missing before
          await prisma.client.update({ where: { id: client.id }, data: { businessName: effectiveBusinessName } });
        }
      }

      try {
        if (client) {
          // Update existing client's funding totals
          await prisma.client.update({
            where: { id: client.id },
            data: {
              totalFunded: { increment: amount },
              fundingCount: { increment: 1 },
              lastFundedDate: fundedDate,
              state: state || undefined,
            },
          });
        } else {
          client = await prisma.client.create({
            data: {
              businessName: effectiveBusinessName,
              contactName,
              phone: normalizedPhone,
              email,
              state: state || undefined,
              totalFunded: amount,
              fundingCount: 1,
              lastFundedDate: fundedDate,
            },
          });
        }

        // Create deal in FUNDED stage
        const deal = await prisma.deal.create({
          data: {
            clientId: client.id,
            assignedRepId: repId,
            stage: DealStage.FUNDED,
            stageLabel: STAGE_LABELS[DealStage.FUNDED],
            productType,
            dealAmount: amount,
            fundedDate,
            lastActivityAt: fundedDate,
            importBatch: batchId,
            originatorName: repName || undefined,
            lender,
            notes: row.notes || row.Notes || undefined,
          },
        });

        // Create funding event
        await prisma.fundingEvent.create({
          data: {
            dealId: deal.id,
            repId,
            amountFunded: amount,
            productType,
            fundedDate,
            lender,
          },
        });

        // Create 3 renewal tasks from funded date
        const ms = (d: number) => d * 24 * 60 * 60 * 1000;
        await prisma.renewalTask.createMany({
          data: [
            { dealId: deal.id, taskType: '35d_checkin', dueDate: new Date(fundedDate.getTime() + ms(35)) },
            { dealId: deal.id, taskType: 'midpoint', dueDate: new Date(fundedDate.getTime() + ms(90)) },
            { dealId: deal.id, taskType: 'payoff_30d', dueDate: new Date(fundedDate.getTime() + ms(150)) },
          ],
        });

        imported++;
      } catch (err: any) {
        skipped++;
        errors.push(`${businessName}: ${err.message}`);
      }
    }

    res.json({ imported, skipped, total: records.length, batchId, errors: errors.slice(0, 20) });
  }

  // POST /api/deals/import-leads — Import engaged/interested leads from CSV (REP + ADMIN)
  static async importLeads(req: AuthRequest, res: Response) {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    const user = req.user!;
    const isAdmin = user.role === 'ADMIN';
    const duplicateModeRaw = String(req.body?.duplicateMode || 'skip').toLowerCase();
    const duplicateMode: 'skip' | 'add_to_existing' =
      duplicateModeRaw === 'add_to_existing' ? 'add_to_existing' : 'skip';

    // Admin can specify a rep to assign to; reps always assign to themselves
    let assignRepId = user.id;
    if (isAdmin && req.body?.assignToRepId) {
      const repExists = await prisma.user.findFirst({ where: { id: req.body.assignToRepId } });
      if (!repExists) return res.status(400).json({ error: 'Invalid rep ID' });
      assignRepId = req.body.assignToRepId;
    }

    const batchId = `leads_${Date.now()}`;
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Map product type
    const productMap: Record<string, ProductType> = {
      MCA: ProductType.MCA,
      LOC: ProductType.LOC,
      EQUIPMENT: ProductType.EQUIPMENT,
      HELOC: ProductType.HELOC,
      SBA: ProductType.SBA,
      CRE: ProductType.CRE,
      BRIDGE: ProductType.BRIDGE,
    };

    const STAGE_MAP: Record<string, DealStage> = {
      new: DealStage.NEW_LEAD,
      engaged: DealStage.ENGAGED_INTERESTED,
      interested: DealStage.ENGAGED_INTERESTED,
      qualified: DealStage.QUALIFIED,
      submitted: DealStage.SUBMITTED_IN_REVIEW,
    };
    const BATCH_SIZE = 100;

    for (let batchStart = 0; batchStart < records.length; batchStart += BATCH_SIZE) {
      const chunk = records.slice(batchStart, batchStart + BATCH_SIZE);

      for (const row of chunk) {
        const businessName = String(
          row.business_name || row['Business Name'] || row.BusinessName || row.company || row.Company || '',
        ).trim();
        const contactName = String(
          row.contact_name || row['Contact Name'] || row.Contact || row.name || row.Name || '',
        ).trim();
        const phone = String(row.phone || row.Phone || row['Phone Number'] || row.mobile || '').replace(/\D/g, '');
        const email = String(row.email || row.Email || '').trim();
        const notes = String(row.notes || row.Notes || '').trim();
        const productRaw = String(row.product_type || row['Product Type'] || row.product || '').toUpperCase();
        const productType = productMap[productRaw] || ProductType.MCA;
        const stageRaw = String(row.stage || row.Stage || row.Status || row.status || '').trim();
        const source = String(row.source || row.Source || '').trim() || 'CSV Import';
        const monthlyRevenue = String(row.monthly_revenue || row['Monthly Revenue'] || '').trim();
        const nextActionRaw = String(row.next_action || row['Next Action'] || row.nextAction || '').trim();
        const nextAction = nextActionRaw || 'Call merchant';

        if (!businessName) {
          skipped++;
          errors.push('Row missing required business_name');
          continue;
        }
        if (!contactName) {
          skipped++;
          errors.push(`"${businessName}" missing required contact_name`);
          continue;
        }
        if (!phone) {
          skipped++;
          errors.push(`"${businessName}" missing required phone`);
          continue;
        }

        const normalizedPhone = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;

        let existingClientByPhone: {
          id: string;
          businessName: string;
          contactName: string | null;
          email: string | null;
        } | null = null;

        existingClientByPhone = await prisma.client.findFirst({
          where: { phone: normalizedPhone },
          select: { id: true, businessName: true, contactName: true, email: true },
        });
        if (existingClientByPhone) {
          const activeDeal = await prisma.deal.findFirst({
            where: {
              clientId: existingClientByPhone.id,
              assignedRepId: assignRepId,
              stage: { notIn: [DealStage.CLOSED, DealStage.NURTURE] },
            },
          });
          if (activeDeal) {
            duplicates++;
            if (duplicateMode === 'skip') continue;
          }
        }

        const stage = (stageRaw ? STAGE_MAP[stageRaw.toLowerCase()] : null) || DealStage.ENGAGED_INTERESTED;

        try {
          // Upsert client
          let client;
          if (existingClientByPhone) {
            client = await prisma.client.update({
              where: { id: existingClientByPhone.id },
              data: {
                businessName: businessName || existingClientByPhone.businessName,
                contactName: contactName || existingClientByPhone.contactName || undefined,
                email: email || existingClientByPhone.email || undefined,
              },
            });
          } else {
            client = await prisma.client.upsert({
              where: { phone: normalizedPhone },
              update: { businessName },
              create: {
                businessName,
                contactName: contactName || undefined,
                phone: normalizedPhone,
                email: email || undefined,
              },
            });
          }

          const clientNotesBits = [`Source: ${source}`];
          if (monthlyRevenue) clientNotesBits.push(`Monthly revenue: ${monthlyRevenue}`);

          // Create deal
          await prisma.deal.create({
            data: {
              clientId: client.id,
              assignedRepId: assignRepId,
              stage,
              stageLabel: STAGE_LABELS[stage],
              productType,
              needsAmount: true,
              importBatch: batchId,
              notes: notes || undefined,
              clientNotes: clientNotesBits.join(' · '),
              nextAction,
              isHot: false,
            } as any,
          });

          imported++;
        } catch (err: any) {
          skipped++;
          errors.push(`${businessName}: ${err.message}`);
        }
      }
    }

    res.json({
      imported,
      duplicates,
      skipped,
      total: records.length,
      batchId,
      duplicateMode,
      errors: errors.slice(0, 20),
    });
  }

  // GET /api/deals/:id/sms — SMS conversation linked to deal's lead
  static async getDealSms(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const deal = await prisma.deal.findFirst({
      where: { id },
      select: { leadId: true, client: { select: { phone: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    let leadId = deal.leadId;
    if (!leadId && deal.client?.phone) {
      const lead = await prisma.lead.findFirst({ where: { phone: deal.client.phone }, select: { id: true } });
      if (lead) leadId = lead.id;
    }
    if (!leadId) return res.json({ messages: [] });

    const conversations = await prisma.conversation.findMany({
      where: { leadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            direction: true,
            status: true,
            createdAt: true,
            fromNumber: true,
            toNumber: true,
          },
        },
      },
    });

    const messages = conversations.flatMap((c) => c.messages);
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const conversationId = conversations.length > 0 ? conversations[0].id : null;
    res.json({ messages, conversationId });
  }

  // POST /api/deals/:id/sms/send — Send SMS from the deal conversation
  static async sendDealSms(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    const deal = await prisma.deal.findFirst({
      where: { id },
      select: { leadId: true, client: { select: { phone: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    let leadId = deal.leadId;
    if (!leadId && deal.client?.phone) {
      const lead = await prisma.lead.findFirst({ where: { phone: deal.client.phone }, select: { id: true } });
      if (lead) leadId = lead.id;
    }
    if (!leadId) return res.status(400).json({ error: 'No lead linked to this deal — cannot send SMS' });

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { phone: true } });
    if (!lead?.phone) return res.status(400).json({ error: 'Lead has no phone number' });

    // Find existing conversation or let SendingEngine create one
    const conversation = await prisma.conversation.findFirst({ where: { leadId } });

    const { SendingEngine } = await import('../services/sendingEngine');
    const messageId = await SendingEngine.queueMessage({
      toNumber: lead.phone,
      body: body.trim(),
      leadId,
      sentByUserId: req.user!.id,
      preferredNumberId: conversation?.stickyNumberId || undefined,
      priority: 10,
    });

    if (conversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), lastDirection: 'outbound' },
      });
    }

    res.json({ messageId });
  }

  // DELETE /api/deals/import-batch/:batchId - Delete all deals from an import batch
  static async deleteImportBatch(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { batchId } = req.params;
    if (!batchId || (!batchId.startsWith('import_') && !batchId.startsWith('leads_'))) {
      return res.status(400).json({ error: 'Invalid batch ID' });
    }

    const deals = await prisma.deal.findMany({ where: { importBatch: batchId }, select: { id: true, clientId: true } });
    if (deals.length === 0) return res.status(404).json({ error: 'No deals found for this batch' });

    const dealIds = deals.map((d) => d.id);

    // Delete related records
    await prisma.fundingEvent.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.offer.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.renewalTask.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.deal.deleteMany({ where: { importBatch: batchId } });

    // Clean or recompute impacted clients
    const clientIds = [...new Set(deals.map((d) => d.clientId))];
    for (const cid of clientIds) {
      const remainingDeals = await prisma.deal.count({ where: { clientId: cid } });
      if (remainingDeals === 0) {
        await prisma.client.delete({ where: { id: cid } }).catch(() => {});
        continue;
      }

      const remainingFunding = await prisma.fundingEvent.aggregate({
        where: { deal: { clientId: cid } },
        _sum: { amountFunded: true },
        _count: { id: true },
        _max: { fundedDate: true },
      });

      await prisma.client.update({
        where: { id: cid },
        data: {
          totalFunded: remainingFunding._sum.amountFunded || 0,
          fundingCount: remainingFunding._count.id || 0,
          lastFundedDate: remainingFunding._max.fundedDate || null,
        },
      });
    }

    res.json({ deleted: deals.length, batchId });
  }

  // GET /api/deals/import-batches - List import batches
  static async getImportBatches(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const batches = await prisma.deal.groupBy({
      by: ['importBatch'],
      where: { importBatch: { not: null } },
      _count: { id: true },
      _min: { createdAt: true },
    });
    res.json(
      batches.map((b) => ({
        batchId: b.importBatch,
        count: b._count.id,
        importedAt: b._min.createdAt,
      })),
    );
  }

  // DELETE /api/deals/:id - Delete a single deal
  static async deleteDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const deal = await prisma.deal.findUnique({
      where: { id },
      select: { id: true, clientId: true, stage: true, assignedRepId: true },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const canDelete = isAdminLike(req.user) || deal.assignedRepId === req.user?.id;
    if (!canDelete) {
      return res.status(403).json({ error: 'Only admin/manager or primary rep can delete this deal' });
    }
    if (deal.stage === DealStage.FUNDED) {
      return res.status(400).json({ error: 'Funded deals cannot be deleted' });
    }

    await prisma.fundingEvent.deleteMany({ where: { dealId: id } });
    await prisma.offer.deleteMany({ where: { dealId: id } });
    await prisma.renewalTask.deleteMany({ where: { dealId: id } });
    await prisma.deal.delete({ where: { id } });

    // Clean orphan client
    const remaining = await prisma.deal.count({ where: { clientId: deal.clientId } });
    if (remaining === 0) await prisma.client.delete({ where: { id: deal.clientId } }).catch(() => {});

    res.json({ deleted: true });
  }
}
