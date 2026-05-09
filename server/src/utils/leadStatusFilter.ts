import { DealStage, LeadStatus, Prisma } from '@prisma/client';

const DEAL_STAGE_FILTERS_BY_LEAD_STATUS: Partial<Record<LeadStatus, DealStage[]>> = {
  FUNDED: [DealStage.FUNDED],
};

export function parseLeadStatuses(value: unknown): LeadStatus[] {
  const validStatuses = new Set(Object.values(LeadStatus));

  return String(value || '')
    .split(',')
    .map((status) => status.trim().toUpperCase())
    .filter((status): status is LeadStatus => validStatuses.has(status as LeadStatus));
}

export function buildLeadStatusWhere(value: unknown): Prisma.LeadWhereInput | null {
  const statuses = parseLeadStatuses(value);
  if (statuses.length === 0) return null;

  const orConditions: Prisma.LeadWhereInput[] = [{ status: { in: statuses } }];

  for (const status of statuses) {
    const dealStages = DEAL_STAGE_FILTERS_BY_LEAD_STATUS[status];
    if (!dealStages || dealStages.length === 0) continue;

    orConditions.push({
      deal: {
        is: {
          stage: { in: dealStages },
        },
      },
    });
  }

  return orConditions.length === 1 ? orConditions[0] : { OR: orConditions };
}