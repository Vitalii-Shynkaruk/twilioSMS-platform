import { describe, expect, it } from 'vitest';
import { canUseUnscopedTeamScope, repFilter, repScopeFilter } from '../src/services/dealScopePolicy';

describe('Deal ownership preservation', () => {
  it('должен сохранять видимость rep по primary и assisting ownership', () => {
    expect(repScopeFilter('rep-1')).toEqual({
      OR: [{ assignedRepId: 'rep-1' }, { assistingRepIds: { array_contains: 'rep-1' } }],
    });

    expect(repFilter({ id: 'rep-1', role: 'REP' })).toEqual({
      OR: [{ assignedRepId: 'rep-1' }, { assistingRepIds: { array_contains: 'rep-1' } }],
    });
  });

  it('должен запрещать unscoped team view для rep и разрешать admin/manager', () => {
    expect(canUseUnscopedTeamScope({ id: 'rep-1', role: 'REP' }, 'true')).toBe(false);
    expect(canUseUnscopedTeamScope({ id: 'rep-1', role: 'REP' }, false, 'rep-2')).toBe(false);
    expect(canUseUnscopedTeamScope({ id: 'admin-1', role: 'ADMIN' }, 'true')).toBe(true);
    expect(canUseUnscopedTeamScope({ id: 'manager-1', role: 'MANAGER' }, 'true')).toBe(true);
  });
});
