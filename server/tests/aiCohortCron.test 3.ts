import { afterEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/database';
import { CampaignController } from '../src/controllers/campaignController';
import { runAiCohortRefreshOnce } from '../src/jobs/aiCohortCron';

describe('M2.3 AI cohort cron', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('не останавливает cron refresh, если один пользователь падает', async () => {
    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      {
        id: 'admin-1',
        email: 'admin@sclcapital.io',
        role: 'ADMIN',
        firstName: 'Admin',
        lastName: 'One',
      },
      {
        id: 'rep-1',
        email: 'rep@sclcapital.io',
        role: 'REP',
        firstName: 'Rep',
        lastName: 'One',
      },
      {
        id: 'rep-2',
        email: 'rep2@sclcapital.io',
        role: 'REP',
        firstName: 'Rep',
        lastName: 'Two',
      },
    ] as never);
    const warm = vi.spyOn(CampaignController, 'warmAiCohortsForUser');
    warm
      .mockResolvedValueOnce({ attempted: 3, refreshed: 3, failures: 0 })
      .mockRejectedValueOnce(new Error('temporary database error'))
      .mockResolvedValueOnce({ attempted: 2, refreshed: 1, failures: 1 });

    const summary = await runAiCohortRefreshOnce();

    expect(warm).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({
      userCount: 3,
      attempted: 5,
      refreshed: 4,
      failures: 2,
    });
  });
});
