import { describe, expect, it } from 'vitest';
import { resolveInboundOwnerRepId } from '../src/webhooks/inboundOwnership';

describe('Inbound ownership policy', () => {
  it('должна сохранять текущего owner, даже если другой активный rep писал последним', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: 'rep-marcos',
      leadAssignedRepId: 'rep-marcos',
      recentHumanOutboundRepIds: ['rep-yahuda', 'rep-marcos'],
      activeRepIds: ['rep-yahuda', 'rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-marcos');
  });

  it('должна сохранять lead owner, если conversation owner пустой', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: null,
      leadAssignedRepId: 'rep-marcos',
      recentHumanOutboundRepIds: ['rep-yahuda'],
      activeRepIds: ['rep-yahuda', 'rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-marcos');
  });

  it('должна сохранять текущего owner, если свежего активного sender нет', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: 'rep-marcos',
      leadAssignedRepId: 'rep-marcos',
      recentHumanOutboundRepIds: ['rep-inactive'],
      activeRepIds: ['rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-marcos');
  });

  it('должна назначать последнего активного sender, если owner не назначен', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: null,
      leadAssignedRepId: null,
      recentHumanOutboundRepIds: ['rep-yahuda', 'rep-marcos'],
      activeRepIds: ['rep-yahuda', 'rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-yahuda');
  });
});
