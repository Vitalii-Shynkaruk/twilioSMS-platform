import { describe, expect, it } from 'vitest';
import { InboxController } from '../src/controllers/inboxController';

describe('Inbox visibility policy', () => {
  it('должна оставлять unread DNC replies видимыми в default inbox filters', () => {
    const helper = InboxController as unknown as {
      buildVisibilityConditions: (input: {
        filter: 'all' | 'unread' | 'hot';
        hasCampaignFilter: boolean;
        unreadOnly?: boolean;
      }) => Array<Record<string, unknown>>;
    };

    const allConditions = helper.buildVisibilityConditions({ filter: 'all', hasCampaignFilter: false });
    const unreadConditions = helper.buildVisibilityConditions({ filter: 'unread', hasCampaignFilter: false });
    const hotConditions = helper.buildVisibilityConditions({ filter: 'hot', hasCampaignFilter: false });

    expect((allConditions[0] as { OR?: unknown[] }).OR).toContainEqual({ unreadCount: { gt: 0 } });
    expect((unreadConditions[0] as { OR?: unknown[] }).OR).toContainEqual({ unreadCount: { gt: 0 } });
    expect(hotConditions[0]).not.toHaveProperty('OR');
  });
});
