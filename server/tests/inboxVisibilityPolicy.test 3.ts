import { describe, expect, it } from 'vitest';
import { InboxController } from '../src/controllers/inboxController';

describe('Inbox visibility policy', () => {
  const hasUnreadBranch = (condition: Record<string, unknown>): boolean => {
    if (!('AND' in condition) || !Array.isArray(condition.AND)) return false;

    return condition.AND.some(
      (entry) => typeof entry === 'object' && entry !== null && 'unreadCount' in (entry as Record<string, unknown>),
    );
  };

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

  it('должна считать sidebar unread summary по той же visibility policy, что и inbox list', () => {
    const helper = InboxController as unknown as {
      buildUnreadSummaryWhere: (req: { user?: { role?: string; id?: string } }) => Record<string, unknown>;
    };

    const summaryWhere = helper.buildUnreadSummaryWhere({ user: { role: 'ADMIN', id: 'admin-1' } });
    const andConditions = Array.isArray(summaryWhere.AND) ? (summaryWhere.AND as Array<Record<string, unknown>>) : [];
    const visibilityCondition = andConditions.find((condition) => 'OR' in condition) as
      | { OR?: Array<Record<string, unknown>> }
      | undefined;

    const unreadDncCondition = visibilityCondition?.OR?.find(hasUnreadBranch) as { AND?: unknown[] } | undefined;

    expect(andConditions).toContainEqual({ unreadCount: { gt: 0 } });
    expect(unreadDncCondition).toMatchObject({
      AND: [{ unreadCount: { gt: 0 } }, { lastMessageAt: { gte: expect.any(Date) } }],
    });
  });
});
