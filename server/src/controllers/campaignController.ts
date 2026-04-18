import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { campaignQueue } from '../services/sendingEngine';
import { ComplianceService } from '../services/complianceService';
import { NumberService } from '../services/numberService';
import { getActiveTwilioClient } from '../config/twilio';
import logger from '../config/logger';

export class CampaignController {
  private static readonly SEND_ATTEMPT_STATUSES = ['SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'BLOCKED'] as const;
  private static readonly FAILED_OR_BLOCKED_STATUSES = ['FAILED', 'UNDELIVERED', 'BLOCKED'] as const;

  private static phoneDigits(raw?: string | null): string {
    return String(raw || '').replace(/\D/g, '');
  }

  private static phoneLookupVariants(raw?: string | null): string[] {
    const digits = CampaignController.phoneDigits(raw);
    if (!digits) return [];

    const variants = new Set<string>();
    variants.add(digits);
    variants.add(`+${digits}`);

    if (digits.length === 10) {
      variants.add(`1${digits}`);
      variants.add(`+1${digits}`);
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      const local = digits.slice(1);
      variants.add(local);
      variants.add(`+1${local}`);
    }

    return Array.from(variants);
  }

  private static ensureRetargetAccess(sourceCampaign: { id: string; createdById: string }, req: AuthRequest): void {
    if (req.user?.role === 'REP' && sourceCampaign.createdById !== req.user.id) {
      throw new AppError('You can only retarget your own campaigns', 403);
    }
  }

  private static async buildRetargetPreview(sourceCampaignId: string): Promise<{
    sourceCampaign: {
      id: string;
      name: string;
      messageTemplate: string;
      numberPoolId: string | null;
      sendingSpeed: number;
      dailyLimit: number | null;
      createdById: string;
    };
    summary: {
      totalDelivered: number;
      replied: number;
      failedBlocked: number;
      dncFiltered: number;
      willReceive: number;
    };
    defaults: {
      name: string;
      messageTemplate: string;
    };
    eligibleLeadIds: string[];
  }> {
    const sourceCampaign = await prisma.campaign.findUnique({
      where: { id: sourceCampaignId },
      select: {
        id: true,
        name: true,
        messageTemplate: true,
        numberPoolId: true,
        sendingSpeed: true,
        dailyLimit: true,
        createdById: true,
      },
    });

    if (!sourceCampaign) throw new AppError('Source campaign not found', 404);

    const [sourceCampaignLeads, sourceMessages] = await Promise.all([
      prisma.campaignLead.findMany({
        where: { campaignId: sourceCampaignId },
        select: {
          status: true,
          leadId: true,
          lead: {
            select: {
              id: true,
              phone: true,
              status: true,
              optedOut: true,
              isSuppressed: true,
            },
          },
        },
      }),
      prisma.message.findMany({
        where: {
          campaignId: sourceCampaignId,
          direction: 'OUTBOUND',
        },
        select: {
          status: true,
          sentAt: true,
          createdAt: true,
          conversation: {
            select: {
              leadId: true,
            },
          },
        },
      }),
    ]);

    const leadById = new Map(
      sourceCampaignLeads.map((row) => [
        row.leadId,
        {
          id: row.lead.id,
          phone: row.lead.phone,
          status: row.lead.status,
          optedOut: row.lead.optedOut,
          isSuppressed: row.lead.isSuppressed,
        },
      ]),
    );

    const repliedByCampaignStatusLeadIds = new Set(
      sourceCampaignLeads
        .filter((row) => row.status === 'REPLIED')
        .map((row) => row.leadId),
    );

    const outboundByLead = new Map<
      string,
      {
        firstOutboundAt: Date;
        hasDelivered: boolean;
        hasFailedOrBlocked: boolean;
      }
    >();

    for (const msg of sourceMessages) {
      const leadId = msg.conversation.leadId;
      if (!leadId) continue;

      const outboundAt = msg.sentAt || msg.createdAt;
      const current = outboundByLead.get(leadId);
      if (!current) {
        outboundByLead.set(leadId, {
          firstOutboundAt: outboundAt,
          hasDelivered: msg.status === 'DELIVERED',
          hasFailedOrBlocked: CampaignController.FAILED_OR_BLOCKED_STATUSES.includes(
            msg.status as (typeof CampaignController.FAILED_OR_BLOCKED_STATUSES)[number],
          ),
        });
        continue;
      }

      if (outboundAt < current.firstOutboundAt) current.firstOutboundAt = outboundAt;
      if (msg.status === 'DELIVERED') current.hasDelivered = true;
      if (
        CampaignController.FAILED_OR_BLOCKED_STATUSES.includes(
          msg.status as (typeof CampaignController.FAILED_OR_BLOCKED_STATUSES)[number],
        )
      ) {
        current.hasFailedOrBlocked = true;
      }
    }

    const deliveredLeadIds = Array.from(outboundByLead.entries())
      .filter(([, entry]) => entry.hasDelivered)
      .map(([leadId]) => leadId);

    const failedBlocked = Array.from(outboundByLead.values()).filter(
      (entry) => entry.hasFailedOrBlocked && !entry.hasDelivered,
    ).length;

    const missingLeadIds = deliveredLeadIds.filter((leadId) => !leadById.has(leadId));
    if (missingLeadIds.length > 0) {
      const missingLeads = await prisma.lead.findMany({
        where: { id: { in: missingLeadIds } },
        select: { id: true, phone: true, status: true, optedOut: true, isSuppressed: true },
      });
      for (const lead of missingLeads) {
        leadById.set(lead.id, lead);
      }
    }

    const minOutboundAt = deliveredLeadIds.reduce<Date | null>((minAt, leadId) => {
      const at = outboundByLead.get(leadId)?.firstOutboundAt;
      if (!at) return minAt;
      if (!minAt || at < minAt) return at;
      return minAt;
    }, null);

    const inboundMessages =
      deliveredLeadIds.length > 0 && minOutboundAt
        ? await prisma.message.findMany({
            where: {
              direction: 'INBOUND',
              createdAt: { gte: minOutboundAt },
              conversation: {
                leadId: { in: deliveredLeadIds },
              },
            },
            select: {
              createdAt: true,
              conversation: {
                select: {
                  leadId: true,
                },
              },
            },
          })
        : [];

    const repliedLeadIds = new Set<string>();
    for (const leadId of deliveredLeadIds) {
      if (repliedByCampaignStatusLeadIds.has(leadId)) {
        repliedLeadIds.add(leadId);
      }
    }

    for (const message of inboundMessages) {
      const leadId = message.conversation.leadId;
      if (!leadId) continue;
      const firstOutboundAt = outboundByLead.get(leadId)?.firstOutboundAt;
      if (!firstOutboundAt) continue;
      if (message.createdAt >= firstOutboundAt) {
        repliedLeadIds.add(leadId);
      }
    }

    const deliveredLeads: Array<{
      leadId: string;
      lead: {
        id: string;
        phone: string;
        status: string;
        optedOut: boolean;
        isSuppressed: boolean;
      };
    }> = [];
    for (const leadId of deliveredLeadIds) {
      const lead = leadById.get(leadId);
      if (!lead) continue;
      deliveredLeads.push({ leadId, lead });
    }

    const suppressionLookup = new Set<string>();
    for (const row of deliveredLeads) {
      for (const variant of CampaignController.phoneLookupVariants(row.lead.phone)) {
        suppressionLookup.add(variant);
      }
    }

    const suppressionRows =
      suppressionLookup.size > 0
        ? await prisma.suppressionEntry.findMany({
            where: {
              phone: { in: Array.from(suppressionLookup) },
            },
            select: { phone: true },
          })
        : [];

    const suppressedDigits = new Set(
      suppressionRows.map((row) => CampaignController.phoneDigits(row.phone)).filter(Boolean),
    );

    const dncLeadIds = new Set<string>();
    for (const row of deliveredLeads) {
      const isDncStatus = row.lead.status === 'DNC';
      const isOptedOut = row.lead.optedOut;
      const isSuppressed = row.lead.isSuppressed;
      const phoneDigits = CampaignController.phoneDigits(row.lead.phone);
      const inSuppressionList = phoneDigits ? suppressedDigits.has(phoneDigits) : false;
      if (isDncStatus || isOptedOut || isSuppressed || inSuppressionList) {
        dncLeadIds.add(row.leadId);
      }
    }

    // Filter order is strict: Delivered -> exclude Replied -> exclude DNC.
    const afterReplyLeadIds = deliveredLeadIds.filter((leadId) => !repliedLeadIds.has(leadId));
    const dncFilteredLeadIds = afterReplyLeadIds.filter((leadId) => dncLeadIds.has(leadId));
    const eligibleLeadIds = afterReplyLeadIds.filter((leadId) => !dncLeadIds.has(leadId));

    return {
      sourceCampaign,
      summary: {
        totalDelivered: deliveredLeadIds.length,
        replied: repliedLeadIds.size,
        failedBlocked: failedBlocked,
        dncFiltered: dncFilteredLeadIds.length,
        willReceive: eligibleLeadIds.length,
      },
      defaults: {
        name: `Retarget — ${sourceCampaign.name}`,
        messageTemplate: sourceCampaign.messageTemplate,
      },
      eligibleLeadIds,
    };
  }

  static async list(req: AuthRequest, res: Response): Promise<void> {
    const { status, search, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.name = { contains: search as string };
    }

    const [campaigns, total] = await Promise.all([
      (prisma.campaign as any).findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { leads: true } },
          sourceCampaign: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    // Use message-based counters so "Sent" reflects actual attempts, not queued items.
    const campaignIds = (campaigns as any[]).map((c: any) => c.id);
    const [liveRows, numberRows, repRows, failureReasonRows, leadStatusRows] =
      campaignIds.length > 0
        ? await Promise.all([
            prisma.message.groupBy({
              by: ['campaignId', 'status'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
              },
              _count: { id: true },
            }),
            // Breakdown по номерам
            prisma.message.groupBy({
              by: ['campaignId', 'phoneNumberId'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
                phoneNumberId: { not: null },
              },
              _count: { id: true },
            }),
            // Breakdown по репам
            prisma.message.groupBy({
              by: ['campaignId', 'sentByUserId'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
                sentByUserId: { not: null },
              },
              _count: { id: true },
            }),
            // Breakdown причин только для Failed (FAILED + UNDELIVERED)
            prisma.message.groupBy({
              by: ['campaignId', 'errorCode', 'errorMessage'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: ['FAILED', 'UNDELIVERED'] },
              },
              _count: { id: true },
            }),
            prisma.campaignLead.groupBy({
              by: ['campaignId', 'status'],
              where: { campaignId: { in: campaignIds } },
              _count: { id: true },
            }),
          ])
        : [[], [], [], [], []];

    // Получаем имена номеров и репов
    const phoneNumberIds = [...new Set(numberRows.map((r) => r.phoneNumberId).filter(Boolean))] as string[];
    const repIds = [...new Set(repRows.map((r) => r.sentByUserId).filter(Boolean))] as string[];

    const [phoneNumbers, repUsers] = await Promise.all([
      phoneNumberIds.length > 0
        ? prisma.phoneNumber.findMany({
            where: { id: { in: phoneNumberIds } },
            select: { id: true, phoneNumber: true },
          })
        : [],
      repIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: repIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);

    const phoneMap = new Map(phoneNumbers.map((p) => [p.id, p.phoneNumber]));
    const repNameMap = new Map(repUsers.map((r) => [r.id, `${r.firstName} ${r.lastName?.[0] || ''}.`]));

    // Собираем per-campaign breakdown maps
    const numberByCampaign = new Map<string, Array<{ number: string; count: number }>>();
    for (const row of numberRows) {
      if (!row.campaignId || !row.phoneNumberId) continue;
      const arr = numberByCampaign.get(row.campaignId) || [];
      arr.push({ number: phoneMap.get(row.phoneNumberId) || row.phoneNumberId, count: row._count.id });
      numberByCampaign.set(row.campaignId, arr);
    }

    const repByCampaign = new Map<string, Array<{ name: string; count: number }>>();
    for (const row of repRows) {
      if (!row.campaignId || !row.sentByUserId) continue;
      const arr = repByCampaign.get(row.campaignId) || [];
      arr.push({ name: repNameMap.get(row.sentByUserId) || 'Unknown', count: row._count.id });
      repByCampaign.set(row.campaignId, arr);
    }

    // Group failure reasons by campaign and error code
    const failureReasonMapByCampaign = new Map<string, Map<string, { code: string; message: string; count: number }>>();
    for (const row of failureReasonRows) {
      if (!row.campaignId) continue;
      const code = (row.errorCode || '').trim() || 'UNKNOWN';
      const message = (row.errorMessage || '').trim();
      const byCode = failureReasonMapByCampaign.get(row.campaignId) || new Map();
      const current = byCode.get(code);
      if (current) {
        current.count += row._count.id;
        if (!current.message && message) current.message = message;
      } else {
        byCode.set(code, { code, message, count: row._count.id });
      }
      failureReasonMapByCampaign.set(row.campaignId, byCode);
    }

    const failureReasonsByCampaign = new Map<string, Array<{ code: string; message: string; count: number }>>();
    for (const [campaignId, byCode] of failureReasonMapByCampaign.entries()) {
      failureReasonsByCampaign.set(
        campaignId,
        Array.from(byCode.values()).sort((a, b) => b.count - a.count),
      );
    }

    const leadStatusByCampaign = new Map<
      string,
      { pending: number; skipped: number; delivered: number; failed: number; replied: number }
    >();
    for (const row of leadStatusRows) {
      if (!row.campaignId) continue;
      const current = leadStatusByCampaign.get(row.campaignId) || {
        pending: 0,
        skipped: 0,
        delivered: 0,
        failed: 0,
        replied: 0,
      };
      const count = row._count.id;
      if (row.status === 'PENDING') current.pending += count;
      if (row.status === 'SKIPPED') current.skipped += count;
      if (row.status === 'DELIVERED') current.delivered += count;
      if (row.status === 'FAILED') current.failed += count;
      if (row.status === 'REPLIED') current.replied += count;
      leadStatusByCampaign.set(row.campaignId, current);
    }

    const liveByCampaign = new Map<
      string,
      { totalSent: number; totalDelivered: number; totalFailed: number; totalBlocked: number }
    >();
    for (const row of liveRows) {
      if (!row.campaignId) continue;
      const current = liveByCampaign.get(row.campaignId) || {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalBlocked: 0,
      };
      const count = row._count.id;

      current.totalSent += count;
      if (row.status === 'DELIVERED') current.totalDelivered += count;
      if (row.status === 'FAILED' || row.status === 'UNDELIVERED') current.totalFailed += count;
      if (row.status === 'BLOCKED') current.totalBlocked += count;

      liveByCampaign.set(row.campaignId, current);
    }

    const campaignsWithLiveCounters = (campaigns as any[]).map((campaign: any) => {
      const live = liveByCampaign.get(campaign.id) || {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalBlocked: 0,
      };
      const numbers = (numberByCampaign.get(campaign.id) || []).sort((a, b) => b.count - a.count);
      const reps = (repByCampaign.get(campaign.id) || []).sort((a, b) => b.count - a.count);
      const leadBreakdown = leadStatusByCampaign.get(campaign.id) || {
        pending: 0,
        skipped: 0,
        delivered: 0,
        failed: 0,
        replied: 0,
      };
      return {
        ...campaign,
        sourceCampaignName: campaign.sourceCampaign?.name || null,
        totalLeads: campaign._count?.leads ?? campaign.totalLeads ?? 0,
        totalSent: live.totalSent,
        totalDelivered: live.totalDelivered,
        totalFailed: live.totalFailed,
        totalBlocked: live.totalBlocked,
        sentBreakdown: { numbers, reps },
        failedBreakdown: { reasons: failureReasonsByCampaign.get(campaign.id) || [] },
        leadBreakdown,
      };
    });

    res.json({
      campaigns: campaignsWithLiveCounters,
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

    const campaign = await (prisma.campaign as any).findUnique({
      where: { id },
      include: {
        leads: {
          include: {
            lead: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                status: true,
              },
            },
          },
          take: 100,
        },
        numberPool: true,
        sourceCampaign: {
          select: { id: true, name: true },
        },
      },
    });

    if (!campaign) throw new AppError('Campaign not found', 404);

    res.json({ campaign });
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const {
      name,
      description,
      messageTemplate,
      numberPoolId,
      sendingSpeed,
      dailyLimit,
      scheduledAt,
      leadIds,
      filterTags,
      filterStatus,
      filterSource,
      filterState,
    } = req.body;

    if (!name || !messageTemplate) {
      throw new AppError('Name and message template are required', 400);
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        messageTemplate,
        numberPoolId,
        sendingSpeed: sendingSpeed || 60,
        dailyLimit,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdById: req.user!.id,
        status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      },
    });

    // Add leads to campaign
    let leadQuery: any = {
      optedOut: false,
      isSuppressed: false,
      deletedAt: null,
    };

    let hasFilter = false;

    if (leadIds && leadIds.length > 0) {
      leadQuery.id = { in: leadIds };
      hasFilter = true;
    } else {
      if (filterTags && filterTags.length > 0) {
        leadQuery.tags = {
          some: { tagId: { in: filterTags } },
        };
        hasFilter = true;
      }
      if (filterStatus && filterStatus.length > 0) {
        leadQuery.status = { in: filterStatus };
        hasFilter = true;
      }
      if (filterSource) {
        leadQuery.source = filterSource;
        hasFilter = true;
      }
      if (filterState) {
        leadQuery.state = filterState;
        hasFilter = true;
      }
    }

    // Safety: if no filter criteria provided, don't add any leads (prevents adding ALL leads)
    let leads: { id: string }[] = [];
    if (hasFilter) {
      leads = await prisma.lead.findMany({
        where: leadQuery,
        select: { id: true },
      });
    }

    if (leads.length > 0) {
      await prisma.campaignLead.createMany({
        data: leads.map((lead) => ({
          campaignId: campaign.id,
          leadId: lead.id,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalLeads: leads.length },
      });
    }

    res.status(201).json({
      campaign: {
        ...campaign,
        totalLeads: leads.length,
      },
    });
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, description, messageTemplate, numberPoolId, sendingSpeed, scheduledAt } = req.body;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      throw new AppError('Can only edit draft or scheduled campaigns', 400);
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(messageTemplate && { messageTemplate }),
        ...(numberPoolId && { numberPoolId }),
        ...(sendingSpeed && { sendingSpeed }),
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
      },
    });

    res.json({ campaign: updated });
  }

  static async start(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { _count: { select: { leads: true } } },
    });
    if (!campaign) throw new AppError('Campaign not found', 404);

    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
      throw new AppError('Campaign cannot be started in current status', 400);
    }

    // Pre-validate: check quiet hours before queueing
    if (await ComplianceService.isQuietHours()) {
      throw new AppError('Cannot start campaign during quiet hours. Adjust quiet hours in Settings → Compliance.', 400);
    }

    // Pre-validate: check that leads exist
    if (campaign._count.leads === 0) {
      throw new AppError('Campaign has no leads. Add leads before starting.', 400);
    }

    let pendingCount = await prisma.campaignLead.count({
      where: { campaignId: id, status: 'PENDING' },
    });
    if (pendingCount === 0 && ['PAUSED', 'COMPLETED'].includes(campaign.status)) {
      const hasUnsentGap = (campaign.totalSent || 0) < campaign._count.leads;
      if (hasUnsentGap) {
        const skippedCandidates = await prisma.campaignLead.findMany({
          where: {
            campaignId: id,
            status: 'SKIPPED',
          },
          select: {
            id: true,
            leadId: true,
            lead: {
              select: {
                phone: true,
                assignedRepId: true,
                optedOut: true,
                isSuppressed: true,
              },
            },
          },
          take: 10000,
        });

        if (skippedCandidates.length > 0) {
          const leadIds = skippedCandidates.map((row) => row.leadId);
          const phones = skippedCandidates.map((row) => row.lead.phone);

          const [existingConvos, suppressedEntries] = await Promise.all([
            prisma.conversation.findMany({
              where: { leadId: { in: leadIds } },
              select: {
                leadId: true,
                assignedRepId: true,
                _count: { select: { messages: true } },
              },
            }),
            prisma.suppressionEntry.findMany({
              where: { phone: { in: phones } },
              select: { phone: true },
            }),
          ]);

          const blockedPhones = new Set(suppressedEntries.map((row) => row.phone));
          const convoByLead = new Map(existingConvos.map((row) => [row.leadId, row]));
          const recoverableIds = skippedCandidates
            .filter((row) => {
              const conversation = convoByLead.get(row.leadId);
              const hasExistingThread = (conversation?._count?.messages || 0) > 0;
              if (hasExistingThread) return false;

              const effectiveOwnerId = conversation?.assignedRepId || row.lead.assignedRepId || null;
              if (effectiveOwnerId && effectiveOwnerId !== campaign.createdById) return false;

              if (row.lead.optedOut || row.lead.isSuppressed || blockedPhones.has(row.lead.phone)) return false;

              return true;
            })
            .map((row) => row.id);

          if (recoverableIds.length === 0) {
            logger.info(`Campaign ${id}: no policy-eligible skipped leads to recover on resume`);
          } else {
            await prisma.campaignLead.updateMany({
              where: { id: { in: recoverableIds } },
              data: {
                status: 'PENDING',
                sentAt: null,
                deliveredAt: null,
                repliedAt: null,
                fromNumber: null,
                errorCode: null,
              },
            });
            pendingCount = recoverableIds.length;
            logger.warn(
              `Campaign ${id}: recovered ${recoverableIds.length} eligible skipped leads back to PENDING on resume`,
            );
          }
        }

        if (pendingCount === 0) {
          logger.info(`Campaign ${id}: no recoverable leads found for resume`);
        }
      }
    }
    if (pendingCount === 0) {
      throw new AppError('Campaign has no pending leads. All leads were already processed or filtered out.', 400);
    }

    let restrictToPhoneNumberIds: string[] | undefined;
    const creator = await prisma.user.findUnique({
      where: { id: campaign.createdById },
      select: { role: true },
    });
    const assignedActiveNumberIds = await NumberService.getActiveAssignedNumberIds(campaign.createdById);

    if (creator?.role === 'REP') {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
      if (restrictToPhoneNumberIds.length === 0) {
        throw new AppError('This rep has no active assigned numbers. Assign numbers in Numbers page first.', 400);
      }
    } else if (assignedActiveNumberIds.length > 0) {
      // Admin/manager campaigns are also pinned to assigned active numbers when assignments exist.
      restrictToPhoneNumberIds = assignedActiveNumberIds;
    }

    // Pre-validate: check that at least one sending number is available
    const availableNumber = await NumberService.getBestAvailableNumber(
      [],
      campaign.numberPoolId || undefined,
      restrictToPhoneNumberIds,
    );
    if (!availableNumber) {
      throw new AppError('No available phone numbers for sending. Check Numbers settings.', 400);
    }

    // Add to processing queue
    await campaignQueue.add('campaign-start', {
      action: 'start',
      campaignId: id,
    });

    res.json({ message: 'Campaign queued for sending' });
  }

  static async retargetPreview(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const preview = await CampaignController.buildRetargetPreview(id);
    CampaignController.ensureRetargetAccess(preview.sourceCampaign, req);

    res.json({
      sourceCampaign: {
        id: preview.sourceCampaign.id,
        name: preview.sourceCampaign.name,
      },
      defaults: preview.defaults,
      summary: preview.summary,
    });
  }

  static async retargetCreate(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, messageTemplate } = req.body as { name: string; messageTemplate: string };

    const preview = await CampaignController.buildRetargetPreview(id);
    CampaignController.ensureRetargetAccess(preview.sourceCampaign, req);

    if (preview.summary.willReceive === 0) {
      throw new AppError('No eligible recipients. All delivered contacts have replied or are on DNC.', 400);
    }

    if (await ComplianceService.isQuietHours()) {
      throw new AppError('Cannot start retarget campaign during quiet hours. Adjust quiet hours in Settings.', 400);
    }

    let restrictToPhoneNumberIds: string[] | undefined;
    const assignedActiveNumberIds = await NumberService.getActiveAssignedNumberIds(req.user!.id);
    if (req.user?.role === 'REP') {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
      if (restrictToPhoneNumberIds.length === 0) {
        throw new AppError('This rep has no active assigned numbers. Assign numbers in Numbers page first.', 400);
      }
    } else if (assignedActiveNumberIds.length > 0) {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
    }

    const availableNumber = await NumberService.getBestAvailableNumber(
      [],
      preview.sourceCampaign.numberPoolId || undefined,
      restrictToPhoneNumberIds,
    );
    if (!availableNumber) {
      throw new AppError('No available phone numbers for sending. Check Numbers settings.', 400);
    }

    const campaign = await prisma.$transaction(async (tx: any) => {
      const createdCampaign = await (tx.campaign as any).create({
        data: {
          name,
          messageTemplate,
          numberPoolId: preview.sourceCampaign.numberPoolId || null,
          sendingSpeed: preview.sourceCampaign.sendingSpeed || 60,
          dailyLimit: preview.sourceCampaign.dailyLimit,
          createdById: req.user!.id,
          status: 'DRAFT',
          totalLeads: preview.eligibleLeadIds.length,
          isRetarget: true,
          sourceCampaignId: preview.sourceCampaign.id,
        },
      });

      await tx.campaignLead.createMany({
        data: preview.eligibleLeadIds.map((leadId) => ({
          campaignId: createdCampaign.id,
          leadId,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      });

      return createdCampaign;
    });

    try {
      await campaignQueue.add('campaign-start', {
        action: 'start',
        campaignId: campaign.id,
      });
    } catch (error: any) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'DRAFT', startedAt: null },
      });
      throw new AppError(`Failed to queue retarget campaign: ${error.message}`, 500);
    }

    res.status(201).json({
      campaign,
      summary: preview.summary,
      message: 'Retarget campaign created and queued for sending',
    });
  }

  static async pause(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    res.json({ message: 'Campaign paused' });
  }

  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    await prisma.campaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Cancel pending campaign leads
    await prisma.campaignLead.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'SKIPPED' },
    });

    res.json({ message: 'Campaign cancelled' });
  }

  static async getAnalytics(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        totalLeads: true,
        totalSent: true,
        totalDelivered: true,
        totalFailed: true,
        totalBlocked: true,
        totalReplied: true,
        totalOptedOut: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!campaign) throw new AppError('Campaign not found', 404);

    // Lead status breakdown
    const leadStatuses = await prisma.campaignLead.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    res.json({
      campaign,
      leadStatuses: leadStatuses.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      deliveryRate: campaign.totalSent > 0 ? ((campaign.totalDelivered / campaign.totalSent) * 100).toFixed(1) : '0',
      replyRate:
        campaign.totalDelivered > 0 ? ((campaign.totalReplied / campaign.totalDelivered) * 100).toFixed(1) : '0',
    });
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    // Cannot delete active campaigns
    if (campaign.status === 'SENDING') {
      throw new AppError('Cannot delete an active campaign. Pause or cancel it first.', 400);
    }

    await prisma.$transaction([
      prisma.campaignLead.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.delete({ where: { id } }),
    ]);

    res.json({ message: 'Campaign deleted successfully' });
  }

  /**
   * Sync stuck message statuses from Twilio API.
   * Queries Twilio for actual status of messages stuck in SENT/QUEUED/SENDING.
   */
  static async syncStatuses(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    const stuckMessages = await prisma.message.findMany({
      where: {
        campaignId: id,
        status: { in: ['SENT', 'QUEUED', 'SENDING'] },
        twilioMessageSid: { not: null },
      },
      select: { id: true, twilioMessageSid: true, status: true, phoneNumberId: true, conversationId: true },
    });

    if (stuckMessages.length === 0) {
      res.json({ message: 'No stuck messages to sync', synced: 0 });
      return;
    }

    const client = await getActiveTwilioClient();
    if (!client) throw new AppError('Twilio client not configured', 500);

    let delivered = 0;
    let failed = 0;
    let unchanged = 0;
    let errors = 0;

    for (const msg of stuckMessages) {
      try {
        const twilioMsg = await client.messages(msg.twilioMessageSid!).fetch();
        const statusMap: Record<string, string> = {
          queued: 'QUEUED',
          sending: 'SENDING',
          sent: 'SENT',
          delivered: 'DELIVERED',
          failed: 'FAILED',
          undelivered: 'UNDELIVERED',
        };
        const newStatus = statusMap[twilioMsg.status] || twilioMsg.status.toUpperCase();
        const isBlocked = twilioMsg.errorCode === 30007 || twilioMsg.errorCode === 30034;
        const finalStatus = isBlocked ? 'BLOCKED' : newStatus;

        if (finalStatus === msg.status) {
          unchanged++;
          continue;
        }

        await prisma.message.update({
          where: { id: msg.id },
          data: {
            status: finalStatus as any,
            ...(finalStatus === 'DELIVERED' && { deliveredAt: new Date() }),
            ...(finalStatus === 'FAILED' || finalStatus === 'UNDELIVERED' || isBlocked
              ? {
                  failedAt: new Date(),
                  errorCode: String(twilioMsg.errorCode || ''),
                  errorMessage: twilioMsg.errorMessage || '',
                }
              : {}),
          },
        });

        if (finalStatus === 'DELIVERED') delivered++;
        else if (['FAILED', 'UNDELIVERED', 'BLOCKED'].includes(finalStatus)) failed++;
        else unchanged++;
      } catch (err: any) {
        logger.error(`Sync error for ${msg.twilioMessageSid}: ${err.message}`);
        errors++;
      }
    }

    // Recalculate campaign counters from actual data
    const statusCounts = await prisma.message.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    const counts: Record<string, number> = {};
    for (const s of statusCounts) counts[s.status] = s._count;

    await prisma.campaign.update({
      where: { id },
      data: {
        totalSent:
          (counts['SENT'] || 0) +
          (counts['DELIVERED'] || 0) +
          (counts['FAILED'] || 0) +
          (counts['UNDELIVERED'] || 0) +
          (counts['BLOCKED'] || 0),
        totalDelivered: counts['DELIVERED'] || 0,
        totalFailed: (counts['FAILED'] || 0) + (counts['UNDELIVERED'] || 0),
        totalBlocked: counts['BLOCKED'] || 0,
      },
    });

    res.json({
      message: `Synced ${stuckMessages.length} messages`,
      delivered,
      failed,
      unchanged,
      errors,
    });
  }
}
