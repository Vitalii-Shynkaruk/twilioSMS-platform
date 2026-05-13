import { describe, expect, it } from 'vitest';

import {
  DEAL_LAST_REPLY_BACKFILL_SOURCE,
  selectDealLastReplyBackfill,
} from '../src/services/dealLastReplyBackfillService';

describe('backfill Deal.lastReplyAt', () => {
  it('должен выбирать самый свежий valid timestamp из доступных historical sources', () => {
    const selected = selectDealLastReplyBackfill([
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_LEAD_LAST_REPLIED_AT,
        at: new Date('2026-05-10T08:00:00.000Z'),
      },
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_CONVERSATION_LATEST_INBOUND,
        at: new Date('2026-05-12T09:30:00.000Z'),
      },
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.PHONE_MATCHED_LEAD_LAST_REPLIED_AT,
        at: new Date('2026-05-11T14:15:00.000Z'),
      },
    ]);

    expect(selected).toEqual({
      source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_CONVERSATION_LATEST_INBOUND,
      at: new Date('2026-05-12T09:30:00.000Z'),
    });
  });

  it('должен игнорировать null, undefined и invalid date values', () => {
    const selected = selectDealLastReplyBackfill([
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_LEAD_LAST_REPLIED_AT,
        at: null,
      },
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_CONVERSATION_LATEST_INBOUND,
        at: undefined,
      },
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.PHONE_MATCHED_LEAD_LAST_REPLIED_AT,
        at: 'not-a-date',
      },
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.PHONE_MATCHED_LEAD_CONVERSATION_LATEST_INBOUND,
        at: '2026-05-13T10:45:00.000Z',
      },
    ]);

    expect(selected).toEqual({
      source: DEAL_LAST_REPLY_BACKFILL_SOURCE.PHONE_MATCHED_LEAD_CONVERSATION_LATEST_INBOUND,
      at: new Date('2026-05-13T10:45:00.000Z'),
    });
  });

  it('должен возвращать null если historical sources не дали valid timestamp', () => {
    const selected = selectDealLastReplyBackfill([
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_LEAD_LAST_REPLIED_AT,
        at: null,
      },
      {
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_CONVERSATION_LATEST_INBOUND,
        at: 'still-not-a-date',
      },
    ]);

    expect(selected).toBeNull();
  });
});
