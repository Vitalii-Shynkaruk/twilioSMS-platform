import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { parse } from 'csv-parse/sync';
import { DealStage, LeadStatus, Prisma } from '@prisma/client';

// Lead status → Deal stage mapping
const LEAD_TO_DEAL: Record<LeadStatus, DealStage> = {
  NEW: DealStage.NEW_LEAD,
  CONTACTED: DealStage.ENGAGED_INTERESTED,
  REPLIED: DealStage.ENGAGED_INTERESTED,
  INTERESTED: DealStage.ENGAGED_INTERESTED,
  DOCS_REQUESTED: DealStage.QUALIFIED,
  SUBMITTED: DealStage.SUBMITTED_IN_REVIEW,
  FUNDED: DealStage.FUNDED,
  NOT_INTERESTED: DealStage.NURTURE,
  DNC: DealStage.CLOSED,
};

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

const BUSINESS_NAME_PLACEHOLDERS = new Set(['n/a', 'na', 'none', 'unknown', 'unknown business', 'null', '-']);
const LEAD_VARCHAR_LIMIT = 191;

function normalizeBusinessName(rawCompany: string | null | undefined, fallbackName: string): string {
  const fallback = fallbackName.trim() || 'Unknown Business';
  const company = String(rawCompany || '').trim();
  if (!company) return fallback;
  if (BUSINESS_NAME_PLACEHOLDERS.has(company.toLowerCase())) return fallback;
  return company;
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function truncateForLeadColumn(value: string, limit = LEAD_VARCHAR_LIMIT): string {
  if (!value) return '';
  return value.length > limit ? value.slice(0, limit) : value;
}

function nullableLeadValue(value: unknown, limit = LEAD_VARCHAR_LIMIT): string | null {
  const normalized = normalizeCell(value);
  if (!normalized) return null;
  return truncateForLeadColumn(normalized, limit);
}

function requiredLeadValue(value: unknown, fallback: string, limit = LEAD_VARCHAR_LIMIT): string {
  const normalized = normalizeCell(value);
  return truncateForLeadColumn(normalized || fallback, limit);
}

function importCustomFields(fields: {
  industry?: unknown;
  monthlyRevenue?: unknown;
  annualRevenue?: unknown;
}): Prisma.InputJsonValue | undefined {
  const customFields: Record<string, string> = {};
  const industry = nullableLeadValue(fields.industry);
  const monthlyRevenue = nullableLeadValue(fields.monthlyRevenue);
  const annualRevenue = nullableLeadValue(fields.annualRevenue);

  if (industry) customFields.industry = industry;
  if (monthlyRevenue) customFields.monthlyRevenue = monthlyRevenue;
  if (annualRevenue) customFields.annualRevenue = annualRevenue;

  return Object.keys(customFields).length > 0 ? customFields : undefined;
}

type LeadUpsertPayload = Prisma.LeadUncheckedCreateInput & {
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  state: string | null;
  source: string;
  notes: string | null;
  assignedRepId?: string;
};

function dedupeLeadUpserts(leadsToUpsert: LeadUpsertPayload[]): {
  uniqueLeadsToUpsert: LeadUpsertPayload[];
  duplicateRows: number;
} {
  const uniqueByPhone = new Map<string, LeadUpsertPayload>();
  let duplicateRows = 0;

  for (const lead of leadsToUpsert) {
    if (uniqueByPhone.has(lead.phone)) {
      duplicateRows++;
      continue;
    }

    uniqueByPhone.set(lead.phone, lead);
  }

  return {
    uniqueLeadsToUpsert: Array.from(uniqueByPhone.values()),
    duplicateRows,
  };
}

async function getEligibleLeadIds(leadIds: string[], user?: AuthRequest['user']): Promise<string[]> {
  if (leadIds.length === 0) return [];

  const where: any = {
    id: { in: leadIds },
    optedOut: false,
    isSuppressed: false,
    deletedAt: null,
  };

  if (user?.role === 'REP') {
    where.assignedRepId = user.id;
  }

  const eligibleLeads = await prisma.lead.findMany({
    where,
    select: { id: true },
  });

  const eligibleIdSet = new Set(eligibleLeads.map((lead) => lead.id));
  return leadIds.filter((leadId) => eligibleIdSet.has(leadId));
}

function isRep(req: AuthRequest): boolean {
  return req.user?.role === 'REP';
}

async function ensureLeadAccess(leadId: string, req: AuthRequest): Promise<void> {
  if (!isRep(req)) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { assignedRepId: true },
  });

  if (!lead || lead.assignedRepId !== req.user?.id) {
    throw new AppError('Access denied: you can only access your own leads', 403);
  }
}

async function resolveScopedLeadIds(leadIds: string[], req: AuthRequest): Promise<string[]> {
  if (!isRep(req)) return leadIds;

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: leadIds },
      assignedRepId: req.user!.id,
      deletedAt: null,
    },
    select: { id: true },
  });

  return leads.map((lead) => lead.id);
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readString(record: JsonRecord | null | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(record: JsonRecord | null | undefined, keys: string[], annual = false): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(annual ? value / 12 : value);
    if (typeof value === 'string') {
      const parsed = parseMonthlyRevenue(value, annual);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function parseMonthlyRevenue(value: unknown, annual = false): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(annual ? value / 12 : value);
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const multiplier = normalized.includes('m') ? 1_000_000 : normalized.includes('k') ? 1_000 : 1;
  const numeric = Number(normalized.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const monthly = numeric * multiplier;
  const looksAnnual = annual || /annual|year|yr/.test(normalized);
  return Math.round(looksAnnual ? monthly / 12 : monthly);
}

function sourceLooksOpaque(value: string): boolean {
  return (
    value === 'csv_import' ||
    /^[0-9a-f]{24,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
    /^c[a-z0-9]{20,}$/i.test(value)
  );
}

function userInitials(
  user?: { initials?: string | null; firstName?: string | null; lastName?: string | null } | null,
): string {
  if (!user) return '';
  if (user.initials) return user.initials;
  const first = String(user.firstName || '').trim()[0] || '';
  const last = String(user.lastName || '').trim()[0] || '';
  return `${first}${last}`.toUpperCase();
}

function resolveLeadSource(lead: any): { primary: string; secondary: string | null } {
  const rawSource = String(lead.source || '').trim();
  const tagRows = Array.isArray(lead.tags) ? lead.tags : [];
  const importListTag =
    tagRows.find((row: any) => row.tag?.isImportList === true)?.tag ||
    tagRows.find((row: any) => rawSource && row.tag?.id === rawSource)?.tag ||
    (rawSource && sourceLooksOpaque(rawSource) && tagRows.length === 1 ? tagRows[0]?.tag : null);
  const latestCampaign = Array.isArray(lead.campaignLeads) ? lead.campaignLeads[0]?.campaign : null;

  if (rawSource && !sourceLooksOpaque(rawSource)) {
    const secondary =
      importListTag?.name && importListTag.name !== rawSource ? importListTag.name : latestCampaign?.name || null;
    return { primary: rawSource, secondary };
  }

  if (importListTag?.name) {
    return { primary: importListTag.name, secondary: latestCampaign?.name || null };
  }

  if (latestCampaign?.name) {
    return { primary: latestCampaign.name, secondary: latestCampaign.isRetarget ? 'Retarget campaign' : 'Campaign' };
  }

  if (rawSource) return { primary: 'Imported list', secondary: null };
  return { primary: '—', secondary: null };
}

function resolveLeadEnrichment(lead: any) {
  const conversation = Array.isArray(lead.conversations) ? lead.conversations[0] : null;
  const signals = asRecord(conversation?.aiSignals);
  const customFields = asRecord(lead.customFields);
  const manualRevenue = parseMonthlyRevenue(lead.deal?.client?.monthlyRevenue);
  const csvRevenue =
    readNumber(customFields, ['monthlyRevenue', 'monthly_revenue', 'monthly_revenue_usd', 'revenueMonthly']) ||
    readNumber(customFields, ['annualRevenue', 'annual_revenue', 'annual_revenue_usd', 'revenueAnnual'], true);
  const aiRevenue =
    (typeof conversation?.extractedRevenue === 'number' ? conversation.extractedRevenue : null) ||
    readNumber(signals, ['revenueMonthly']);
  const monthlyRevenue = manualRevenue || csvRevenue || aiRevenue || null;
  const revenueSource = manualRevenue ? 'MANUAL' : csvRevenue ? 'CSV' : aiRevenue ? 'AI' : null;
  const industry =
    readString(customFields, ['industry', 'businessIndustry', 'business_industry']) ||
    (typeof conversation?.extractedIndustry === 'string' && conversation.extractedIndustry.trim()
      ? conversation.extractedIndustry.trim()
      : null) ||
    readString(signals, ['industry']);
  const latestMessage = conversation?.messages?.[0] || null;
  const lastContactAt =
    latestMessage?.createdAt || lead.lastRepliedAt || lead.lastContactedAt || conversation?.lastMessageAt || null;
  const repForLastContact =
    latestMessage?.sentByUser ||
    conversation?.assignedRep ||
    lead.assignedRep ||
    (lead.assignedRepId ? lead.assignedRep : null);
  const source = resolveLeadSource(lead);

  return {
    industry: industry || null,
    monthlyRevenue,
    revenueSource,
    lastContactAt,
    lastContactRepInitials: userInitials(repForLastContact),
    lastContactDirection: latestMessage?.direction || null,
    readableSourcePrimary: source.primary,
    readableSourceSecondary: source.secondary,
  };
}

function withLeadEnrichment<T extends Record<string, unknown>>(
  lead: T,
): T & { enrichment: ReturnType<typeof resolveLeadEnrichment> } {
  return {
    ...lead,
    enrichment: resolveLeadEnrichment(lead),
  };
}

export class LeadController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const {
      page = '1',
      limit = '50',
      search,
      status,
      tags,
      assignedRepId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string } },
        { lastName: { contains: search as string } },
        { phone: { contains: search as string } },
        { email: { contains: search as string } },
        { company: { contains: search as string } },
      ];
    }

    if (status) {
      where.status = { in: (status as string).split(',') };
    }

    if (tags) {
      where.tags = {
        some: { tagId: { in: (tags as string).split(',') } },
      };
    }

    if (assignedRepId) {
      where.assignedRepId = assignedRepId;
    }

    if (req.query.source) {
      where.source = { contains: req.query.source as string };
    }

    if (req.query.state) {
      where.state = { contains: req.query.state as string };
    }

    // Rep can only see their leads
    if (req.user?.role === 'REP') {
      where.assignedRepId = req.user.id;
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          tags: { include: { tag: true } },
          assignedRep: {
            select: { id: true, firstName: true, lastName: true, initials: true },
          },
          deal: {
            select: {
              id: true,
              stage: true,
              stageLabel: true,
              dealAmount: true,
              isHot: true,
              client: { select: { monthlyRevenue: true } },
            },
          },
          conversations: {
            take: 1,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              lastMessageAt: true,
              extractedIndustry: true,
              extractedRevenue: true,
              aiSignals: true,
              assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } },
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  direction: true,
                  createdAt: true,
                  sentByUser: { select: { id: true, firstName: true, lastName: true, initials: true } },
                },
              },
            },
          },
          campaignLeads: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { campaign: { select: { id: true, name: true, isRetarget: true } } },
          },
          _count: {
            select: { conversations: true },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      leads: leads.map((lead) => withLeadEnrichment(lead as unknown as Record<string, unknown>)),
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        assignedRep: {
          select: { id: true, firstName: true, lastName: true },
        },
        deal: {
          select: {
            id: true,
            stage: true,
            stageLabel: true,
            dealAmount: true,
            isHot: true,
            nextAction: true,
            nextActionDue: true,
          },
        },
        conversations: {
          include: {
            messages: {
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        pipelineCards: {
          include: { stage: true },
        },
        automationRuns: {
          where: { isActive: true },
          include: { automationRule: true },
        },
        campaignLeads: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!lead) throw new AppError('Lead not found', 404);
    if (req.user?.role === 'REP' && lead.assignedRepId !== req.user.id) {
      throw new AppError('Access denied: you can only access your own leads', 403);
    }

    res.json({ lead });
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const { firstName, lastName, phone, email, company, state, source, tags, assignedRepId } = req.body;

    if (!firstName || !phone) {
      throw new AppError('First name and phone are required', 400);
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    const e164Phone = normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`;

    // Check for duplicate
    const existing = await prisma.lead.findUnique({
      where: { phone: e164Phone },
    });
    const resolvedAssignedRepId = req.user?.role === 'REP' ? req.user.id : assignedRepId;

    if (existing) {
      if (req.user?.role === 'REP' && existing.assignedRepId && existing.assignedRepId !== req.user.id) {
        throw new AppError('Access denied: lead belongs to another rep', 403);
      }

      // If lead was soft-deleted, restore it with updated info
      if (existing.deletedAt) {
        const restored = await prisma.lead.update({
          where: { id: existing.id },
          data: {
            firstName,
            lastName: lastName || existing.lastName,
            email: email || existing.email,
            company: company || existing.company,
            state: state || existing.state,
            source: source || existing.source,
            status: 'NEW',
            deletedAt: null,
            assignedRepId: existing.assignedRepId || resolvedAssignedRepId || undefined,
          },
        });

        // Recreate pipeline card
        const defaultStage =
          (await prisma.pipelineStage.findFirst({ where: { isDefault: true } })) ||
          (await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } }));
        if (defaultStage) {
          await prisma.pipelineCard.upsert({
            where: { leadId: restored.id },
            create: { leadId: restored.id, stageId: defaultStage.id },
            update: {},
          });
        }

        // Add tags if provided
        if (tags && tags.length > 0) {
          await prisma.leadTag.createMany({
            data: tags.map((tagId: string) => ({ leadId: restored.id, tagId })),
            skipDuplicates: true,
          });
        }

        res.status(201).json({ lead: restored });
        return;
      }
      throw new AppError('Lead with this phone number already exists', 409);
    }

    // Check suppression
    const suppressed = await prisma.suppressionEntry.findUnique({
      where: { phone: e164Phone },
    });

    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        phone: e164Phone,
        email,
        company,
        state,
        source,
        assignedRepId: resolvedAssignedRepId || undefined,
        isSuppressed: !!suppressed,
        suppressReason: suppressed?.reason,
      },
    });

    // Add tags
    if (tags && tags.length > 0) {
      await prisma.leadTag.createMany({
        data: tags.map((tagId: string) => ({
          leadId: lead.id,
          tagId,
        })),
        skipDuplicates: true,
      });
    }

    // Create pipeline card
    const defaultStage =
      (await prisma.pipelineStage.findFirst({
        where: { isDefault: true },
      })) ||
      (await prisma.pipelineStage.findFirst({
        orderBy: { order: 'asc' },
      }));

    if (defaultStage) {
      await prisma.pipelineCard.create({
        data: {
          leadId: lead.id,
          stageId: defaultStage.id,
        },
      });
    }

    res.status(201).json({ lead });
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { firstName, lastName, email, company, state, source, status, assignedRepId, notes } = req.body;

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new AppError('Lead not found', 404);

    // Проверка авторизации: REP может обновлять только свои лиды
    if (req.user?.role === 'REP' && existing.assignedRepId !== req.user.id) {
      throw new AppError('Access denied: you can only update your own leads', 403);
    }

    const data: any = {};
    if (firstName) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (email !== undefined) data.email = email;
    if (company !== undefined) data.company = company;
    if (state !== undefined) data.state = state;
    if (source !== undefined) data.source = source;
    if (status) data.status = status;
    if (assignedRepId !== undefined) {
      if (req.user?.role === 'REP') {
        throw new AppError('Access denied: reps cannot reassign leads', 403);
      }
      data.assignedRepId = assignedRepId;
    }
    if (notes !== undefined) data.notes = notes;

    const lead = await prisma.lead.update({
      where: { id },
      data,
      include: {
        tags: { include: { tag: true } },
        deal: { select: { id: true, stage: true } },
      },
    });

    // Sync lead status → deal stage when status changes (or when no deal exists yet)
    const effectiveStatus = status || existing.status;
    const statusChanged = status && status !== existing.status;
    const newDealStage = LEAD_TO_DEAL[effectiveStatus as LeadStatus];
    console.log('[LeadUpdate]', {
      leadId: id,
      status,
      existingStatus: existing.status,
      effectiveStatus,
      statusChanged,
      newDealStage,
      hasDeal: !!lead.deal,
    });
    if (newDealStage) {
      // Find linked deal (via leadId FK or by phone match)
      let linkedDeal = lead.deal;
      if (!linkedDeal) {
        const client = await prisma.client.findUnique({ where: { phone: existing.phone } });
        if (client) {
          linkedDeal = await prisma.deal.findFirst({
            where: { clientId: client.id },
            select: { id: true, stage: true },
            orderBy: { createdAt: 'desc' },
          });
          // Link for future syncs
          if (linkedDeal) {
            await prisma.deal.update({ where: { id: linkedDeal.id }, data: { leadId: id } });
          }
        }
      }
      if (linkedDeal) {
        if (statusChanged && linkedDeal.stage !== newDealStage) {
          await prisma.deal.update({
            where: { id: linkedDeal.id },
            data: {
              stage: newDealStage,
              stageLabel: STAGE_LABELS[newDealStage],
              daysInStage: 0,
              lastActivityAt: new Date(),
            },
          });
        }
      } else {
        // No deal exists — create one from the lead
        console.log('[LeadUpdate] Creating new deal for lead', id, 'stage:', newDealStage);

        const contactName = `${existing.firstName} ${existing.lastName || ''}`.trim();
        const businessName = normalizeBusinessName(existing.company, contactName);

        const leadConversation = await prisma.conversation.findUnique({
          where: { leadId: id },
          select: { assignedRepId: true },
        });
        const dealRepId =
          lead.assignedRepId || existing.assignedRepId || leadConversation?.assignedRepId || req.user!.id;

        if (!lead.assignedRepId && dealRepId) {
          await prisma.lead.update({
            where: { id },
            data: { assignedRepId: dealRepId },
          });
        }

        let client = await prisma.client.findUnique({ where: { phone: existing.phone } });
        if (!client) {
          client = await prisma.client.create({
            data: {
              businessName,
              contactName,
              phone: existing.phone,
              email: existing.email || undefined,
              state: existing.state || undefined,
            },
          });
        } else if (
          BUSINESS_NAME_PLACEHOLDERS.has(
            String(client.businessName || '')
              .trim()
              .toLowerCase(),
          )
        ) {
          client = await prisma.client.update({
            where: { id: client.id },
            data: { businessName },
          });
        }

        const newDeal = await prisma.deal.create({
          data: {
            clientId: client.id,
            assignedRepId: dealRepId,
            leadId: id,
            stage: newDealStage,
            stageLabel: STAGE_LABELS[newDealStage],
            lastActivityAt: new Date(),
          },
        });
        console.log('[LeadUpdate] Created deal', newDeal.id, 'for rep', newDeal.assignedRepId);
      }
    }

    // Legacy: auto-move pipeline card (only when status explicitly changed)
    if (status && status !== existing.status) {
      const targetStage = await prisma.pipelineStage.findFirst({
        where: { mappedStatus: status },
      });
      if (targetStage) {
        const card = await prisma.pipelineCard.findFirst({ where: { leadId: id } });
        if (card) {
          await prisma.pipelineCard.update({
            where: { id: card.id },
            data: { stageId: targetStage.id },
          });
        } else {
          await prisma.pipelineCard.create({
            data: { leadId: id, stageId: targetStage.id },
          });
        }
      }
    }

    res.json({ lead });
  }

  static async importCSV(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const listName = req.body.listName as string | undefined;
    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const allLeadIds = new Set<string>();
    const importAssignedRepId = req.user?.role === 'REP' ? req.user.id : undefined;

    // Query default stage ONCE before the loop (with fallback to first stage)
    const defaultStage =
      (await prisma.pipelineStage.findFirst({
        where: { isDefault: true },
      })) || (await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } }));

    // Process in chunks of 500 for better DB performance
    const CHUNK_SIZE = 500;
    for (let chunk = 0; chunk < records.length; chunk += CHUNK_SIZE) {
      const batch = records.slice(chunk, chunk + CHUNK_SIZE);
      const leadsToUpsert: LeadUpsertPayload[] = [];

      // Parse and validate the batch
      for (const record of batch) {
        const phone = normalizeCell(record.phone || record.Phone || record.PHONE).replace(/\D/g, '');
        if (!phone) {
          errors++;
          errorDetails.push('Row missing phone number');
          continue;
        }

        const e164Phone = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;
        const firstName = requiredLeadValue(
          record.firstName || record.first_name || record.FirstName || record.FIRST_NAME,
          'Unknown',
        );
        const lastName = requiredLeadValue(
          record.lastName || record.last_name || record.LastName || record.LAST_NAME,
          '',
        );

        leadsToUpsert.push({
          phone: e164Phone,
          firstName,
          lastName,
          email: nullableLeadValue(record.email || record.Email || record.EMAIL),
          company: nullableLeadValue(record.company || record.Company || record.COMPANY),
          state: nullableLeadValue(record.state || record.State || record.STATE),
          // Phase 1 fix: используем имя импорт-листа как Source (раньше все лиды получали "csv_import")
          source: requiredLeadValue(record.source || record.Source, listName?.trim() || 'csv_import'),
          notes: nullableLeadValue(record.notes || record.Notes || record.NOTE || record.COMMENTS, 4000),
          customFields: importCustomFields({
            industry: record.industry || record.Industry || record.INDUSTRY,
            monthlyRevenue:
              record.monthlyRevenue ||
              record.monthly_revenue ||
              record['Monthly Revenue'] ||
              record.revenue ||
              record.Revenue,
            annualRevenue: record.annualRevenue || record.annual_revenue || record['Annual Revenue'],
          }),
          ...(importAssignedRepId ? { assignedRepId: importAssignedRepId } : {}),
        });
      }

      // Batch upsert leads using a transaction
      if (leadsToUpsert.length > 0) {
        const { uniqueLeadsToUpsert, duplicateRows } = dedupeLeadUpserts(leadsToUpsert);
        duplicates += duplicateRows;

        // Check which phones already exist to distinguish new vs duplicate
        const phones = uniqueLeadsToUpsert.map((lead) => lead.phone);
        const existingLeads = await prisma.lead.findMany({
          where: { phone: { in: phones } },
          select: { id: true, phone: true, deletedAt: true, assignedRepId: true },
        });
        const existingPhoneMap = new Map(existingLeads.map((l) => [l.phone, l]));

        const results = await prisma.$transaction(
          uniqueLeadsToUpsert.map((lead) => {
            const existing = existingPhoneMap.get(lead.phone);
            const restoreOwnerPatch =
              existing?.deletedAt && !existing.assignedRepId && importAssignedRepId
                ? { assignedRepId: importAssignedRepId }
                : {};

            return prisma.lead.upsert({
              where: { phone: lead.phone },
              create: lead,
              update: { deletedAt: null, ...restoreOwnerPatch },
            });
          }),
        );

        const newLeadIds: string[] = [];
        for (const result of results) {
          allLeadIds.add(result.id);
          const existing = existingPhoneMap.get(result.phone);
          if (!existing) {
            newLeadIds.push(result.id);
            imported++;
          } else if (existing.deletedAt !== null) {
            newLeadIds.push(result.id);
            imported++;
          } else {
            duplicates++;
          }
        }

        if (defaultStage && newLeadIds.length > 0) {
          await prisma.pipelineCard.createMany({
            data: newLeadIds.map((leadId) => ({
              leadId,
              stageId: defaultStage.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // Auto-tag all imported leads with list name
    const uniqueLeadIds = Array.from(allLeadIds);

    if (listName && uniqueLeadIds.length > 0) {
      const tagName = listName.trim();
      const userId = req.user!.id;
      const tag = await prisma.tag.upsert({
        where: { name_createdById: { name: tagName, createdById: userId } },
        create: { name: tagName, color: '#3b82f6', createdById: userId, isImportList: true },
        update: {},
      });
      await prisma.leadTag.createMany({
        data: uniqueLeadIds.map((leadId) => ({ leadId, tagId: tag.id })),
        skipDuplicates: true,
      });
    }

    const eligibleLeadIds = await getEligibleLeadIds(uniqueLeadIds, req.user);

    res.json({
      imported,
      duplicates,
      errors,
      total: records.length,
      leadIds: uniqueLeadIds,
      uniqueLeadCount: uniqueLeadIds.length,
      eligibleLeadIds,
      campaignReadyLeadCount: eligibleLeadIds.length,
      suppressedExcluded: uniqueLeadIds.length - eligibleLeadIds.length,
      errorDetails: errorDetails.slice(0, 10),
    });
  }

  /**
   * POST /leads/preview — Parse first N rows of CSV for preview + column detection
   * Returns detected columns, sample data rows, and auto-mapping suggestions.
   */
  static async previewCSV(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      throw new AppError('CSV file is empty or has no data rows', 400);
    }

    const csvColumns = Object.keys(records[0]);

    // Auto-detect column mappings
    const fieldMappingSuggestions: Record<string, string | null> = {
      phone: null,
      firstName: null,
      lastName: null,
      email: null,
      company: null,
      city: null,
      state: null,
      source: null,
      notes: null,
    };

    const columnAliases: Record<string, string[]> = {
      phone: ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone', 'number'],
      firstName: ['firstname', 'first_name', 'first', 'fname', 'given_name', 'name'],
      lastName: ['lastname', 'last_name', 'last', 'lname', 'surname', 'family_name'],
      email: ['email', 'email_address', 'emailaddress', 'e_mail'],
      company: ['company', 'company_name', 'companyname', 'business', 'organization', 'org'],
      city: ['city', 'town', 'locality'],
      state: ['state', 'province', 'region', 'st'],
      source: ['source', 'lead_source', 'leadsource', 'origin', 'channel', 'utm_source'],
      notes: ['notes', 'note', 'comments', 'comment', 'memo'],
      industry: ['industry', 'business_industry', 'vertical', 'business_type', 'category'],
      monthlyRevenue: ['monthlyrevenue', 'monthly_revenue', 'monthly revenue', 'revenue_monthly', 'monthly_sales'],
      annualRevenue: ['annualrevenue', 'annual_revenue', 'annual revenue', 'revenue_annual', 'annual_sales'],
    };

    for (const [field, aliases] of Object.entries(columnAliases)) {
      for (const col of csvColumns) {
        if (aliases.includes(col.toLowerCase().trim())) {
          fieldMappingSuggestions[field] = col;
          break;
        }
      }
    }

    // Return preview data (first 10 rows only)
    const previewRows = records.slice(0, 10);
    const totalRows = records.length;

    res.json({
      totalRows,
      columns: csvColumns,
      mappingSuggestions: fieldMappingSuggestions,
      previewRows,
    });
  }

  /**
   * POST /leads/import-mapped — Import CSV with explicit column mapping from frontend
   */
  static async importMappedCSV(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const listName = req.body.listName as string | undefined;
    const mappingStr = req.body.mapping;
    if (!mappingStr) {
      throw new AppError('Column mapping is required', 400);
    }

    let mapping: Record<string, string>;
    try {
      mapping = JSON.parse(mappingStr);
    } catch {
      throw new AppError('Invalid mapping JSON', 400);
    }

    if (!mapping.phone) {
      throw new AppError('Phone column mapping is required', 400);
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const allLeadIds = new Set<string>();
    const importAssignedRepId = req.user?.role === 'REP' ? req.user.id : undefined;

    const defaultStage =
      (await prisma.pipelineStage.findFirst({
        where: { isDefault: true },
      })) || (await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } }));

    const CHUNK_SIZE = 500;
    for (let chunk = 0; chunk < records.length; chunk += CHUNK_SIZE) {
      const batch = records.slice(chunk, chunk + CHUNK_SIZE);
      const leadsToUpsert: LeadUpsertPayload[] = [];

      for (const record of batch) {
        const rawPhone = normalizeCell(mapping.phone ? record[mapping.phone] : '').replace(/\D/g, '');
        if (!rawPhone) {
          errors++;
          errorDetails.push('Row missing phone number');
          continue;
        }

        const e164Phone = rawPhone.startsWith('1') ? `+${rawPhone}` : `+1${rawPhone}`;

        // Combine city+state into state field (Lead model has no city column)
        const city = normalizeCell(mapping.city ? record[mapping.city] : '');
        const state = normalizeCell(mapping.state ? record[mapping.state] : '');
        const combinedState = [city, state].filter(Boolean).join(', ');

        leadsToUpsert.push({
          phone: e164Phone,
          firstName: requiredLeadValue(mapping.firstName ? record[mapping.firstName] : '', 'Unknown'),
          lastName: requiredLeadValue(mapping.lastName ? record[mapping.lastName] : '', ''),
          email: nullableLeadValue(mapping.email ? record[mapping.email] : ''),
          company: nullableLeadValue(mapping.company ? record[mapping.company] : ''),
          state: nullableLeadValue(combinedState),
          // Phase 1 fix: используем имя импорт-листа как Source (раньше все лиды получали "csv_import")
          source: requiredLeadValue(mapping.source ? record[mapping.source] : '', listName?.trim() || 'csv_import'),
          notes: nullableLeadValue(mapping.notes ? record[mapping.notes] : '', 4000),
          customFields: importCustomFields({
            industry: mapping.industry ? record[mapping.industry] : '',
            monthlyRevenue: mapping.monthlyRevenue ? record[mapping.monthlyRevenue] : '',
            annualRevenue: mapping.annualRevenue ? record[mapping.annualRevenue] : '',
          }),
          ...(importAssignedRepId ? { assignedRepId: importAssignedRepId } : {}),
        });
      }

      if (leadsToUpsert.length > 0) {
        const { uniqueLeadsToUpsert, duplicateRows } = dedupeLeadUpserts(leadsToUpsert);
        duplicates += duplicateRows;

        // Check which phones already exist to distinguish new vs duplicate
        const phones = uniqueLeadsToUpsert.map((lead) => lead.phone);
        const existingLeads = await prisma.lead.findMany({
          where: { phone: { in: phones } },
          select: { id: true, phone: true, deletedAt: true, assignedRepId: true },
        });
        const existingPhoneMap = new Map(existingLeads.map((l) => [l.phone, l]));

        const results = await prisma.$transaction(
          uniqueLeadsToUpsert.map((lead) => {
            const existing = existingPhoneMap.get(lead.phone);
            const restoreOwnerPatch =
              existing?.deletedAt && !existing.assignedRepId && importAssignedRepId
                ? { assignedRepId: importAssignedRepId }
                : {};

            return prisma.lead.upsert({
              where: { phone: lead.phone },
              create: lead,
              update: { deletedAt: null, ...restoreOwnerPatch },
            });
          }),
        );

        const newLeadIds: string[] = [];
        for (const result of results) {
          // Track ALL lead IDs (new + existing) so they can be added to campaigns
          allLeadIds.add(result.id);
          const existing = existingPhoneMap.get(result.phone);
          if (!existing) {
            newLeadIds.push(result.id);
            imported++;
          } else if (existing.deletedAt !== null) {
            newLeadIds.push(result.id);
            imported++;
          } else {
            duplicates++;
          }
        }

        if (defaultStage && newLeadIds.length > 0) {
          await prisma.pipelineCard.createMany({
            data: newLeadIds.map((leadId) => ({
              leadId,
              stageId: defaultStage.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // Auto-tag all imported leads (new + existing) with list name
    const uniqueLeadIds = Array.from(allLeadIds);

    if (listName && uniqueLeadIds.length > 0) {
      const tagName = listName.trim();
      const userId = req.user!.id;
      const tag = await prisma.tag.upsert({
        where: { name_createdById: { name: tagName, createdById: userId } },
        create: { name: tagName, color: '#3b82f6', createdById: userId, isImportList: true },
        update: {},
      });
      await prisma.leadTag.createMany({
        data: uniqueLeadIds.map((leadId) => ({ leadId, tagId: tag.id })),
        skipDuplicates: true,
      });
    }

    const eligibleLeadIds = await getEligibleLeadIds(uniqueLeadIds, req.user);

    res.json({
      imported,
      duplicates,
      errors,
      total: records.length,
      leadIds: uniqueLeadIds,
      uniqueLeadCount: uniqueLeadIds.length,
      eligibleLeadIds,
      campaignReadyLeadCount: eligibleLeadIds.length,
      suppressedExcluded: uniqueLeadIds.length - eligibleLeadIds.length,
      errorDetails: errorDetails.slice(0, 10),
    });
  }

  static async addTag(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { tagId } = req.body;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);

    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new AppError('Tag not found', 404);
    await ensureLeadAccess(id, req);

    await prisma.leadTag.create({
      data: { leadId: id, tagId },
    });

    res.json({ message: 'Tag added' });
  }

  static async removeTag(req: AuthRequest, res: Response): Promise<void> {
    const { id, tagId } = req.params;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);
    await ensureLeadAccess(id, req);

    await prisma.leadTag.deleteMany({
      where: { leadId: id, tagId },
    });

    res.json({ message: 'Tag removed' });
  }

  static async bulkAction(req: AuthRequest, res: Response): Promise<void> {
    const { action, leadIds, data } = req.body;
    const scopedLeadIds = await resolveScopedLeadIds(leadIds, req);

    if (scopedLeadIds.length !== leadIds.length) {
      throw new AppError('Access denied: one or more leads are outside your scope', 403);
    }

    switch (action) {
      case 'assign_rep':
        if (req.user?.role === 'REP') {
          throw new AppError('Access denied: reps cannot reassign leads', 403);
        }
        await prisma.lead.updateMany({
          where: { id: { in: scopedLeadIds } },
          data: { assignedRepId: data.repId },
        });
        break;

      case 'change_status': {
        await prisma.lead.updateMany({
          where: { id: { in: scopedLeadIds } },
          data: { status: data.status },
        });
        // Move pipeline cards to the stage mapped to the new status
        const targetStage = await prisma.pipelineStage.findFirst({
          where: { mappedStatus: data.status },
        });
        if (targetStage) {
          // Update existing cards
          await prisma.pipelineCard.updateMany({
            where: { leadId: { in: scopedLeadIds } },
            data: { stageId: targetStage.id },
          });
          // Create cards for leads that don't have one
          const existingCards = await prisma.pipelineCard.findMany({
            where: { leadId: { in: scopedLeadIds } },
            select: { leadId: true },
          });
          const existingLeadIds = new Set(existingCards.map((c) => c.leadId));
          const missingLeadIds = scopedLeadIds.filter((lid: string) => !existingLeadIds.has(lid));
          if (missingLeadIds.length > 0) {
            await prisma.pipelineCard.createMany({
              data: missingLeadIds.map((lid: string) => ({ leadId: lid, stageId: targetStage.id })),
              skipDuplicates: true,
            });
          }
        }
        break;
      }

      case 'add_tag':
        await prisma.leadTag.createMany({
          data: scopedLeadIds.map((leadId: string) => ({
            leadId,
            tagId: data.tagId,
          })),
          skipDuplicates: true,
        });
        break;

      case 'suppress':
        await prisma.lead.updateMany({
          where: { id: { in: scopedLeadIds } },
          data: {
            isSuppressed: true,
            suppressedAt: new Date(),
            suppressReason: data.reason || 'manual',
          },
        });
        break;

      case 'unsuppress':
        await prisma.lead.updateMany({
          where: { id: { in: scopedLeadIds } },
          data: {
            isSuppressed: false,
            suppressedAt: null,
            suppressReason: null,
          },
        });
        break;

      case 'remove_tag':
        await prisma.leadTag.deleteMany({
          where: {
            leadId: { in: scopedLeadIds },
            tagId: data.tagId,
          },
        });
        break;

      case 'delete':
        await prisma.$transaction([
          prisma.pipelineCard.deleteMany({ where: { leadId: { in: scopedLeadIds } } }),
          prisma.lead.updateMany({
            where: { id: { in: scopedLeadIds } },
            data: { deletedAt: new Date() },
          }),
        ]);
        break;

      default:
        throw new AppError('Unknown action', 400);
    }

    res.json({ message: 'Bulk action completed', affected: scopedLeadIds.length });
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);

    // Defense-in-depth: route is admin-only, but keep an explicit guard here.
    if (req.user?.role !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    // Soft-delete: mark as deleted instead of destroying data
    await prisma.$transaction([
      prisma.pipelineCard.deleteMany({ where: { leadId: id } }),
      prisma.lead.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);

    res.json({ message: 'Lead deleted successfully' });
  }

  /**
   * GET /leads/export — Export leads as streaming CSV (cursor-based, OOM-safe)
   */
  static async exportCSV(req: AuthRequest, res: Response): Promise<void> {
    const { status, tags, assignedRepId, search, source, state } = req.query;

    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search as string } },
        { lastName: { contains: search as string } },
        { phone: { contains: search as string } },
        { email: { contains: search as string } },
        { company: { contains: search as string } },
      ];
    }
    if (status) where.status = { in: (status as string).split(',') };
    if (tags) where.tags = { some: { tagId: { in: (tags as string).split(',') } } };
    if (source) where.source = { contains: source as string };
    if (state) where.state = { contains: state as string };
    if (assignedRepId) where.assignedRepId = assignedRepId;
    if (req.user?.role === 'REP') where.assignedRepId = req.user.id;
    // Exclude soft-deleted
    where.deletedAt = null;

    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=leads-export-${new Date().toISOString().split('T')[0]}.csv`,
    );

    // Write header
    const headers = [
      'First Name',
      'Last Name',
      'Phone',
      'Email',
      'Company',
      'State',
      'Status',
      'Last Contact',
      'Last Contact Rep',
      'Industry',
      'Monthly Revenue',
      'Revenue Source',
      'Readable Source',
      'Source Detail',
      'Raw Source',
      'Tags',
      'Assigned Rep',
      'Created At',
    ];
    res.write(headers.join(',') + '\n');

    // Stream in batches of 500
    const BATCH_SIZE = 500;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const leads = await prisma.lead.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          assignedRep: { select: { firstName: true, lastName: true, initials: true } },
          deal: {
            select: {
              client: { select: { monthlyRevenue: true } },
            },
          },
          conversations: {
            take: 1,
            orderBy: { updatedAt: 'desc' },
            select: {
              lastMessageAt: true,
              extractedIndustry: true,
              extractedRevenue: true,
              aiSignals: true,
              assignedRep: { select: { firstName: true, lastName: true, initials: true } },
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: {
                  direction: true,
                  createdAt: true,
                  sentByUser: { select: { firstName: true, lastName: true, initials: true } },
                },
              },
            },
          },
          campaignLeads: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { campaign: { select: { id: true, name: true, isRetarget: true } } },
          },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (leads.length === 0) {
        hasMore = false;
        break;
      }

      for (const l of leads) {
        const enrichment = resolveLeadEnrichment(l);
        const row = [
          l.firstName,
          l.lastName || '',
          l.phone,
          l.email || '',
          l.company || '',
          l.state || '',
          l.status,
          enrichment.lastContactAt ? new Date(enrichment.lastContactAt).toISOString() : '',
          enrichment.lastContactRepInitials || '',
          enrichment.industry || '',
          enrichment.monthlyRevenue ? String(enrichment.monthlyRevenue) : '',
          enrichment.revenueSource || '',
          enrichment.readableSourcePrimary || '',
          enrichment.readableSourceSecondary || '',
          l.source || '',
          l.tags.map((t) => t.tag.name).join('; '),
          l.assignedRep ? `${l.assignedRep.firstName} ${l.assignedRep.lastName}` : '',
          l.createdAt.toISOString(),
        ];
        res.write(row.map(escapeCSV).join(',') + '\n');
      }

      cursor = leads[leads.length - 1].id;
      if (leads.length < BATCH_SIZE) hasMore = false;
    }

    res.end();
  }
}
