import { describe, expect, it } from 'vitest';
import { resolveInboundOwnerRepId } from '../src/webhooks/inboundOwnership';

describe('Inbound ownership policy', () => {
  it('должна сохранять текущего owner, даже если другой активный rep писал последним', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: 'rep-marcos',
      leadAssignedRepId: 'rep-marcos',
      inboundNumberAssignedRepId: 'rep-alex',
      recentHumanOutboundRepIds: ['rep-yahuda', 'rep-marcos'],
      activeRepIds: ['rep-yahuda', 'rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-marcos');
  });

  it('должна сохранять lead owner, если conversation owner пустой', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: null,
      leadAssignedRepId: 'rep-marcos',
      inboundNumberAssignedRepId: 'rep-alex',
      recentHumanOutboundRepIds: ['rep-yahuda'],
      activeRepIds: ['rep-yahuda', 'rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-marcos');
  });

  it('должна сохранять текущего owner, если свежего активного sender нет', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: 'rep-marcos',
      leadAssignedRepId: 'rep-marcos',
      inboundNumberAssignedRepId: 'rep-alex',
      recentHumanOutboundRepIds: ['rep-inactive'],
      activeRepIds: ['rep-marcos'],
    });

    expect(ownerRepId).toBe('rep-marcos');
  });

  it('должна назначать последнего активного sender, если owner не назначен', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: null,
      leadAssignedRepId: null,
      inboundNumberAssignedRepId: 'rep-alex',
      recentHumanOutboundRepIds: ['rep-yahuda', 'rep-marcos'],
      activeRepIds: ['rep-yahuda', 'rep-marcos', 'rep-alex'],
    });

    expect(ownerRepId).toBe('rep-yahuda');
  });

  it('должна брать owner от receiving number, если thread новый и sender history нет', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: null,
      leadAssignedRepId: null,
      inboundNumberAssignedRepId: 'rep-alex',
      recentHumanOutboundRepIds: [],
      activeRepIds: ['rep-alex'],
    });

    expect(ownerRepId).toBe('rep-alex');
  });

  it('не должна брать неактивного owner от receiving number', () => {
    const ownerRepId = resolveInboundOwnerRepId({
      currentAssignedRepId: null,
      leadAssignedRepId: null,
      inboundNumberAssignedRepId: 'rep-inactive',
      recentHumanOutboundRepIds: [],
      activeRepIds: [],
    });

    expect(ownerRepId).toBeNull();
  });
});
