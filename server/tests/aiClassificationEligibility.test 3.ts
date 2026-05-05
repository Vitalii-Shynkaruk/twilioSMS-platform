import { describe, expect, it } from 'vitest';
import { getClassificationSkipReason } from '../src/services/aiService';

describe('getClassificationSkipReason', () => {
  it('skips classification for opted-out lead', () => {
    const reason = getClassificationSkipReason({
      leadStatus: 'REPLIED',
      leadOptedOut: true,
      inboundMessagesCount: 1,
    });

    expect(reason).toBe('lead_opted_out_or_dnc');
  });

  it('skips classification for DNC lead status', () => {
    const reason = getClassificationSkipReason({
      leadStatus: 'DNC',
      leadOptedOut: false,
      inboundMessagesCount: 2,
    });

    expect(reason).toBe('lead_opted_out_or_dnc');
  });

  it('skips classification for threads without inbound messages', () => {
    const reason = getClassificationSkipReason({
      leadStatus: 'REPLIED',
      leadOptedOut: false,
      inboundMessagesCount: 0,
    });

    expect(reason).toBe('no_inbound_messages');
  });

  it('allows classification for active thread with inbound', () => {
    const reason = getClassificationSkipReason({
      leadStatus: 'REPLIED',
      leadOptedOut: false,
      inboundMessagesCount: 3,
    });

    expect(reason).toBeNull();
  });
});
