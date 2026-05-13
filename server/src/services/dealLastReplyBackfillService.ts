export const DEAL_LAST_REPLY_BACKFILL_SOURCE = {
  DEAL_LEAD_LAST_REPLIED_AT: 'deal_lead_last_replied_at',
  DEAL_CONVERSATION_LATEST_INBOUND: 'deal_conversation_latest_inbound',
  PHONE_MATCHED_LEAD_LAST_REPLIED_AT: 'phone_matched_lead_last_replied_at',
  PHONE_MATCHED_LEAD_CONVERSATION_LATEST_INBOUND: 'phone_matched_lead_conversation_latest_inbound',
} as const;

export type DealLastReplyBackfillSource =
  (typeof DEAL_LAST_REPLY_BACKFILL_SOURCE)[keyof typeof DEAL_LAST_REPLY_BACKFILL_SOURCE];

export interface DealLastReplyBackfillCandidate {
  readonly source: DealLastReplyBackfillSource;
  readonly at: Date | string | null | undefined;
}

export interface DealLastReplyBackfillSelection {
  readonly source: DealLastReplyBackfillSource;
  readonly at: Date;
}

function normalizeCandidateDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) return null;

  return normalized;
}

export function selectDealLastReplyBackfill(
  candidates: readonly DealLastReplyBackfillCandidate[],
): DealLastReplyBackfillSelection | null {
  let selected: DealLastReplyBackfillSelection | null = null;

  for (const candidate of candidates) {
    const normalizedAt = normalizeCandidateDate(candidate.at);
    if (!normalizedAt) continue;

    if (!selected || normalizedAt.getTime() > selected.at.getTime()) {
      selected = {
        source: candidate.source,
        at: normalizedAt,
      };
    }
  }

  return selected;
}
