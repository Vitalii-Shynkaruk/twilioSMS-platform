import { describe, expect, it } from 'vitest';
import {
  canUseUnscopedTeamScope,
  fundingRepScopeFilter,
  repFilter,
  repScopeFilter,
} from '../src/services/dealScopePolicy';
import type { AuthRequest } from '../src/middleware/auth';

const repUser: AuthRequest['user'] = {
  id: 'rep-1',
  email: 'rep@sclcapital.io',
  role: 'REP',
  firstName: 'Rep',
  lastName: 'One',
};

const adminUser: AuthRequest['user'] = {
  id: 'admin-1',
  email: 'admin@sclcapital.io',
  role: 'ADMIN',
  firstName: 'Admin',
  lastName: 'One',
};

describe('Deal scope policy', () => {
  it('должен включать primary и shared deals для rep по умолчанию', () => {
    expect(repFilter(repUser)).toEqual(repScopeFilter('rep-1', true));
  });

  it('должен поддерживать primary-only режим для точечных фильтров', () => {
    expect(repFilter(repUser, { primaryOnly: true })).toEqual({ assignedRepId: 'rep-1' });
  });

  it('не должен разрешать unscoped teamView обычному rep', () => {
    expect(canUseUnscopedTeamScope(repUser, 'true')).toBe(false);
  });

  it('должен разрешать unscoped teamView admin без выбранного rep', () => {
    expect(canUseUnscopedTeamScope(adminUser, 'true')).toBe(true);
  });

  it('должен scope teamView admin к выбранному rep', () => {
    expect(canUseUnscopedTeamScope(adminUser, 'true', 'rep-1')).toBe(false);
  });

  it('должен считать funding events только в рамках credited или видимых rep deals', () => {
    expect(fundingRepScopeFilter('rep-1')).toEqual({
      OR: [{ repId: 'rep-1' }, { deal: repScopeFilter('rep-1', true) }],
    });
  });
});
