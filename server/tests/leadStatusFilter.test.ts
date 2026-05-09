import { describe, expect, it } from 'vitest';
import { buildLeadStatusWhere } from '../src/utils/leadStatusFilter';

describe('buildLeadStatusWhere', () => {
  it('должен учитывать funded deal stage, даже если lead.status отстал', () => {
    expect(buildLeadStatusWhere('FUNDED')).toEqual({
      OR: [{ status: { in: ['FUNDED'] } }, { deal: { is: { stage: { in: ['FUNDED'] } } } }],
    });
  });

  it('должен оставлять обычные статусы фильтром по lead.status', () => {
    expect(buildLeadStatusWhere('CONTACTED')).toEqual({
      status: { in: ['CONTACTED'] },
    });
  });

  it('должен отбрасывать пустые и невалидные значения', () => {
    expect(buildLeadStatusWhere('')).toBeNull();
    expect(buildLeadStatusWhere('UNKNOWN')).toBeNull();
  });
});