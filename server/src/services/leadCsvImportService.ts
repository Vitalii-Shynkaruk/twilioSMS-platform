import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { lookupErrorQueue } from '../jobs/lookupQueues';
import { LookupDecision, LookupTransientError, LookupValidationService } from './lookupValidationService';
import { SUPPRESSION_REASONS, isLookupSuppressionReason } from './suppressionReasons';

const LEAD_VARCHAR_LIMIT = 191;
const CHUNK_SIZE = 500;
const LOOKUP_CONCURRENCY = 5;

type LeadUpsertPayload = Prisma.LeadUncheckedCreateInput & { phone: string };

export interface CsvImportUser {
  id: string;
  role: string;
}

export interface CsvImportMapping {
  phone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  city?: string;
  state?: string;
  source?: string;
  notes?: string;
  industry?: string;
  monthlyRevenue?: string;
  annualRevenue?: string;
}

export interface LookupImportSummary {
  valid: number;
  suppressed: number;
  quarantined: number;
  retryPending: number;
  failedReview: number;
  lookupErrors: number;
  shadowModeActive: boolean;
  shadowModeStartedAt: string | null;
  shadowModeEndsAt: string | null;
  applied: boolean;
  validationLine: string;
}

export interface CsvImportSummary {
  imported: number;
  duplicates: number;
  errors: number;
  total: number;
  leadIds: string[];
  uniqueLeadCount: number;
  eligibleLeadIds: string[];
  campaignReadyLeadCount: number;
  suppressedExcluded: number;
  errorDetails: string[];
  lookupSummary: LookupImportSummary;
}

interface PreparedLead {
  payload: LeadUpsertPayload;
  lookupDecision: LookupDecision;
}

interface ExistingLeadState {
  id: string;
  phone: string;
  deletedAt: Date | null;
  assignedRepId: string | null;
  industry: string | null;
  monthlyRevenue: Prisma.Decimal | null;
  monthlyRevenueSource: string | null;
  optedOut: boolean;
  isSuppressed: boolean;
  suppressReason: string | null;
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

function parseMonthlyRevenue(value: unknown, annual = false): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(annual ? value / 12 : value);
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const compact = normalized.replace(/[$,\s]/g, '');
  const match = compact.match(/(\d+(?:\.\d+)?)([km])?/i);
  if (!match) return null;

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const suffix = String(match[2] || '').toLowerCase();
  const multiplier = suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;

  const monthly = numeric * multiplier;
  const looksAnnual = annual || /annual|year|yr/.test(normalized);
  return Math.round(looksAnnual ? monthly / 12 : monthly);
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

function importLeadEnrichmentFields(fields: {
  industry?: unknown;
  monthlyRevenue?: unknown;
  annualRevenue?: unknown;
}): Partial<Prisma.LeadUncheckedCreateInput> {
  const industry = nullableLeadValue(fields.industry, 100);
  const monthlyRevenue = parseMonthlyRevenue(fields.monthlyRevenue) ?? parseMonthlyRevenue(fields.annualRevenue, true);

  return {
    ...(industry ? { industry } : {}),
    ...(monthlyRevenue !== null
      ? {
          monthlyRevenue,
          monthlyRevenueSource: 'csv_import',
        }
      : {}),
  };
}

function buildImportEnrichmentUpdate(
  lead: LeadUpsertPayload,
  existing?: Pick<ExistingLeadState, 'industry' | 'monthlyRevenue' | 'monthlyRevenueSource'>,
): Prisma.LeadUncheckedUpdateInput {
  const update: Prisma.LeadUncheckedUpdateInput = {};

  if (lead.industry && !existing?.industry) {
    update.industry = lead.industry;
  }

  if (lead.monthlyRevenue && !existing?.monthlyRevenue && existing?.monthlyRevenueSource !== 'manual') {
    update.monthlyRevenue = lead.monthlyRevenue;
    update.monthlyRevenueSource = 'csv_import';
  }

  return update;
}

function normalizePhone(rawValue: unknown): string | null {
  const rawPhone = normalizeCell(rawValue).replace(/\D/g, '');
  if (!rawPhone) return null;
  return rawPhone.startsWith('1') ? `+${rawPhone}` : `+1${rawPhone}`;
}

function getRecordValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function buildPayloadFromRecord(input: {
  record: Record<string, unknown>;
  mapping?: CsvImportMapping | null;
  listName?: string;
  importAssignedRepId?: string;
}): LeadUpsertPayload | null {
  const { record, mapping, listName, importAssignedRepId } = input;
  const phone = mapping?.phone
    ? normalizePhone(record[mapping.phone])
    : normalizePhone(getRecordValue(record, ['phone', 'Phone', 'PHONE', 'Phone Number', 'phone_number']));
  if (!phone) return null;

  const city = normalizeCell(mapping?.city ? record[mapping.city] : '');
  const state = normalizeCell(
    mapping?.state ? record[mapping.state] : getRecordValue(record, ['state', 'State', 'STATE']),
  );
  const combinedState = [city, state].filter(Boolean).join(', ');

  const industry = mapping?.industry
    ? record[mapping.industry]
    : getRecordValue(record, ['industry', 'Industry', 'INDUSTRY']);
  const monthlyRevenue = mapping?.monthlyRevenue
    ? record[mapping.monthlyRevenue]
    : getRecordValue(record, ['monthlyRevenue', 'monthly_revenue', 'Monthly Revenue', 'revenue', 'Revenue']);
  const annualRevenue = mapping?.annualRevenue
    ? record[mapping.annualRevenue]
    : getRecordValue(record, ['annualRevenue', 'annual_revenue', 'Annual Revenue']);

  return {
    phone,
    firstName: requiredLeadValue(
      mapping?.firstName
        ? record[mapping.firstName]
        : getRecordValue(record, ['firstName', 'first_name', 'FirstName', 'FIRST_NAME', 'First Name']),
      'Unknown',
    ),
    lastName: requiredLeadValue(
      mapping?.lastName
        ? record[mapping.lastName]
        : getRecordValue(record, ['lastName', 'last_name', 'LastName', 'LAST_NAME', 'Last Name']),
      '',
    ),
    email: nullableLeadValue(
      mapping?.email ? record[mapping.email] : getRecordValue(record, ['email', 'Email', 'EMAIL']),
    ),
    company: nullableLeadValue(
      mapping?.company ? record[mapping.company] : getRecordValue(record, ['company', 'Company', 'COMPANY']),
    ),
    state: nullableLeadValue(combinedState),
    source: requiredLeadValue(
      mapping?.source ? record[mapping.source] : getRecordValue(record, ['source', 'Source']),
      listName?.trim() || 'csv_import',
    ),
    notes: nullableLeadValue(
      mapping?.notes ? record[mapping.notes] : getRecordValue(record, ['notes', 'Notes', 'NOTE', 'COMMENTS']),
      4000,
    ),
    customFields: importCustomFields({ industry, monthlyRevenue, annualRevenue }),
    ...importLeadEnrichmentFields({ industry, monthlyRevenue, annualRevenue }),
    ...(importAssignedRepId ? { assignedRepId: importAssignedRepId } : {}),
  };
}

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

function createInitialLookupSummary(shadowMode: {
  active: boolean;
  startedAt: Date | null;
  endsAt: Date | null;
}): LookupImportSummary {
  return {
    valid: 0,
    suppressed: 0,
    quarantined: 0,
    retryPending: 0,
    failedReview: 0,
    lookupErrors: 0,
    shadowModeActive: shadowMode.active,
    shadowModeStartedAt: shadowMode.startedAt?.toISOString() || null,
    shadowModeEndsAt: shadowMode.endsAt?.toISOString() || null,
    applied: !shadowMode.active,
    validationLine: '',
  };
}

function updateLookupSummary(summary: LookupImportSummary, decision: LookupDecision): void {
  if (decision.status === 'PASS') summary.valid++;
  if (decision.status === 'SUPPRESS') summary.suppressed++;
  if (decision.status === 'QUARANTINE') summary.quarantined++;
  if (decision.status === 'RETRY_PENDING') summary.retryPending++;
  if (decision.status === 'FAILED_REVIEW') summary.failedReview++;
  if (decision.source === 'error') summary.lookupErrors++;
}

function finalizeValidationLine(summary: LookupImportSummary): string {
  const base = `${summary.valid.toLocaleString()} valid · ${summary.suppressed.toLocaleString()} suppressed · ${summary.quarantined.toLocaleString()} quarantined · ${summary.retryPending.toLocaleString()} retry pending`;
  return summary.shadowModeActive ? `${base} (shadow mode — no leads held)` : base;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor++;
      results[index] = await handler(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function getEligibleLeadIds(leadIds: string[], user?: CsvImportUser | null): Promise<string[]> {
  if (leadIds.length === 0) return [];

  const where: Prisma.LeadWhereInput = {
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

function hasProtectedSuppression(existing?: ExistingLeadState, suppressionReason?: string | null): boolean {
  if (existing?.optedOut) return true;
  if (existing?.isSuppressed && !isLookupSuppressionReason(existing.suppressReason)) {
    return true;
  }
  return !!suppressionReason && !isLookupSuppressionReason(suppressionReason);
}

function buildLookupCreatePatch(input: {
  decision: LookupDecision;
  suppressionReason?: string | null;
  shadowModeActive: boolean;
}): Partial<Prisma.LeadUncheckedCreateInput> {
  const { decision, suppressionReason, shadowModeActive } = input;
  const metadata = {
    lineType: decision.lineType || null,
    carrierName: decision.carrierName || null,
    validatedAt: decision.validatedAt || null,
  };

  if (suppressionReason && !isLookupSuppressionReason(suppressionReason)) {
    return {
      ...metadata,
      isSuppressed: true,
      suppressedAt: new Date(),
      suppressReason: suppressionReason,
    };
  }

  if (shadowModeActive || decision.status === 'PASS') {
    return metadata;
  }

  return {
    ...metadata,
    isSuppressed: true,
    suppressedAt: new Date(),
    suppressReason: decision.reason || SUPPRESSION_REASONS.LOOKUP_QUARANTINE,
  };
}

function buildLookupUpdatePatch(input: {
  decision: LookupDecision;
  existing?: ExistingLeadState;
  suppressionReason?: string | null;
  shadowModeActive: boolean;
}): Prisma.LeadUncheckedUpdateInput {
  const { decision, existing, suppressionReason, shadowModeActive } = input;
  const patch: Prisma.LeadUncheckedUpdateInput = {
    lineType: decision.lineType || null,
    carrierName: decision.carrierName || null,
    validatedAt: decision.validatedAt || null,
  };

  if (shadowModeActive || hasProtectedSuppression(existing, suppressionReason)) {
    return patch;
  }

  if (decision.status === 'PASS') {
    if (existing?.isSuppressed && isLookupSuppressionReason(existing.suppressReason)) {
      patch.isSuppressed = false;
      patch.suppressedAt = null;
      patch.suppressReason = null;
    }
    return patch;
  }

  patch.isSuppressed = true;
  patch.suppressedAt = new Date();
  patch.suppressReason = decision.reason || SUPPRESSION_REASONS.LOOKUP_QUARANTINE;
  return patch;
}

export class LeadCsvImportService {
  static parseCsvContent(csvContent: string): Record<string, unknown>[] {
    return parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  }

  static async importRecords(input: {
    records: Record<string, unknown>[];
    mapping?: CsvImportMapping | null;
    listName?: string;
    user?: CsvImportUser | null;
    onProgress?: (processedRows: number) => Promise<void>;
  }): Promise<CsvImportSummary> {
    const { records, mapping, listName, user, onProgress } = input;
    const importAssignedRepId = user?.role === 'REP' ? user.id : undefined;
    const shadowMode = await LookupValidationService.getShadowModeStatus({ ensureStarted: true });
    const lookupSummary = createInitialLookupSummary(shadowMode);

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const allLeadIds = new Set<string>();

    const leadsToUpsert: LeadUpsertPayload[] = [];
    for (const record of records) {
      const payload = buildPayloadFromRecord({ record, mapping, listName, importAssignedRepId });
      if (!payload) {
        errors++;
        errorDetails.push('Row missing phone number');
        continue;
      }
      leadsToUpsert.push(payload);
    }

    const deduped = dedupeLeadUpserts(leadsToUpsert);
    duplicates += deduped.duplicateRows;

    const defaultStage =
      (await prisma.pipelineStage.findFirst({ where: { isDefault: true } })) ||
      (await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } }));

    const preparedLeads = await runWithConcurrency(deduped.uniqueLeadsToUpsert, LOOKUP_CONCURRENCY, async (payload) => {
      try {
        const lookupDecision = await LookupValidationService.validatePhone(payload.phone);
        updateLookupSummary(lookupSummary, lookupDecision);
        return { payload, lookupDecision };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Lookup failed';
        const lookupDecision: LookupDecision = {
          phone: payload.phone,
          status: 'RETRY_PENDING',
          reason: SUPPRESSION_REASONS.LOOKUP_RETRY_PENDING,
          lineType: null,
          carrierName: null,
          validatedAt: null,
          source: error instanceof LookupTransientError ? 'error' : 'error',
          errorMessage: message,
        };
        updateLookupSummary(lookupSummary, lookupDecision);
        return { payload, lookupDecision };
      }
    });

    for (let chunk = 0; chunk < preparedLeads.length; chunk += CHUNK_SIZE) {
      const batch = preparedLeads.slice(chunk, chunk + CHUNK_SIZE);
      const phones = batch.map((lead) => lead.payload.phone);
      const [existingLeads, suppressionEntries] = await Promise.all([
        prisma.lead.findMany({
          where: { phone: { in: phones } },
          select: {
            id: true,
            phone: true,
            deletedAt: true,
            assignedRepId: true,
            industry: true,
            monthlyRevenue: true,
            monthlyRevenueSource: true,
            optedOut: true,
            isSuppressed: true,
            suppressReason: true,
          },
        }),
        prisma.suppressionEntry.findMany({
          where: { phone: { in: phones } },
          select: { phone: true, reason: true },
        }),
      ]);
      const existingPhoneMap = new Map(existingLeads.map((lead) => [lead.phone, lead]));
      const suppressionReasonByPhone = new Map(suppressionEntries.map((entry) => [entry.phone, entry.reason]));

      const results = await prisma.$transaction(
        batch.map(({ payload, lookupDecision }) => {
          const existing = existingPhoneMap.get(payload.phone);
          const restoreOwnerPatch =
            existing?.deletedAt && !existing.assignedRepId && importAssignedRepId
              ? { assignedRepId: importAssignedRepId }
              : {};
          const enrichmentPatch = buildImportEnrichmentUpdate(payload, existing);
          const suppressionReason = suppressionReasonByPhone.get(payload.phone);
          const lookupCreatePatch = buildLookupCreatePatch({
            decision: lookupDecision,
            suppressionReason,
            shadowModeActive: shadowMode.active,
          });
          const lookupUpdatePatch = buildLookupUpdatePatch({
            decision: lookupDecision,
            existing,
            suppressionReason,
            shadowModeActive: shadowMode.active,
          });

          return prisma.lead.upsert({
            where: { phone: payload.phone },
            create: { ...payload, ...lookupCreatePatch },
            update: {
              deletedAt: null,
              ...restoreOwnerPatch,
              ...enrichmentPatch,
              ...lookupUpdatePatch,
            },
          });
        }),
      );

      const newLeadIds: string[] = [];
      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        const prepared = batch[index] as PreparedLead;
        allLeadIds.add(result.id);
        const existing = existingPhoneMap.get(result.phone);
        if (!existing || existing.deletedAt !== null) {
          newLeadIds.push(result.id);
          imported++;
        } else {
          duplicates++;
        }

        if (!shadowMode.active && prepared.lookupDecision.status === 'PASS') {
          await LookupValidationService.clearLookupSuppression(result.phone, result.id);
        }

        if (!shadowMode.active && prepared.lookupDecision.status !== 'PASS') {
          await LookupValidationService.upsertSuppressionEntry(
            result.phone,
            prepared.lookupDecision.reason || SUPPRESSION_REASONS.LOOKUP_QUARANTINE,
            prepared.lookupDecision.status === 'RETRY_PENDING' ? 'lookup_retry_pending' : 'lookup_upload',
          );
        }

        if (!shadowMode.active && prepared.lookupDecision.status === 'RETRY_PENDING') {
          await lookupErrorQueue.add(
            'retry-lookup',
            {
              leadId: result.id,
              phone: result.phone,
              requestedByUserId: user?.id || null,
            },
            {
              delay: 24 * 60 * 60 * 1000,
              jobId: `lookup-retry:${result.id}`,
            },
          );
        }
      }

      if (defaultStage && newLeadIds.length > 0) {
        await prisma.pipelineCard.createMany({
          data: newLeadIds.map((leadId) => ({ leadId, stageId: defaultStage.id })),
          skipDuplicates: true,
        });
      }

      if (onProgress) {
        await onProgress(Math.min(chunk + CHUNK_SIZE, preparedLeads.length));
      }
    }

    const uniqueLeadIds = Array.from(allLeadIds);
    if (listName && uniqueLeadIds.length > 0) {
      if (!user?.id) throw new AppError('Import user is required', 400);
      const tagName = listName.trim();
      const tag = await prisma.tag.upsert({
        where: { name_createdById: { name: tagName, createdById: user.id } },
        create: { name: tagName, color: '#3b82f6', createdById: user.id, isImportList: true },
        update: {},
      });
      await prisma.leadTag.createMany({
        data: uniqueLeadIds.map((leadId) => ({ leadId, tagId: tag.id })),
        skipDuplicates: true,
      });
    }

    const eligibleLeadIds = await getEligibleLeadIds(uniqueLeadIds, user);
    lookupSummary.validationLine = finalizeValidationLine(lookupSummary);

    return {
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
      lookupSummary,
    };
  }

  static userFromAuth(user?: AuthRequest['user']): CsvImportUser | null {
    if (!user) return null;
    return { id: user.id, role: user.role };
  }
}
