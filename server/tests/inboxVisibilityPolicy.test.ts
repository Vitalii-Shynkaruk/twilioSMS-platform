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

    const hasUnreadBranch = (condition: Record<string, unknown>): boolean => {
      if (!('AND' in condition) || !Array.isArray(condition.AND)) return false;

      return condition.AND.some(
        (entry) => typeof entry === 'object' && entry !== null && 'unreadCount' in (entry as Record<string, unknown>),
      );
    };

    const allUnreadDncCondition = (allConditions[0] as { OR?: Array<Record<string, unknown>> }).OR?.find(
      hasUnreadBranch,
    ) as { AND?: unknown[] } | undefined;
    const unreadDncCondition = (unreadConditions[0] as { OR?: Array<Record<string, unknown>> }).OR?.find(
      hasUnreadBranch,
    ) as { AND?: unknown[] } | undefined;

    expect(allUnreadDncCondition).toMatchObject({
      AND: [{ unreadCount: { gt: 0 } }, { lastMessageAt: { gte: expect.any(Date) } }],
    });
    expect(unreadDncCondition).toMatchObject({
      AND: [{ unreadCount: { gt: 0 } }, { lastMessageAt: { gte: expect.any(Date) } }],
    });
    expect(hotConditions[0]).not.toHaveProperty('OR');
  });
});
