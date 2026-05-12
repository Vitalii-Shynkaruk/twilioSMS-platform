import { afterEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/database';
import { classifyLookupLineType, LookupValidationService } from '../src/services/lookupValidationService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LookupValidationService line type mapping', () => {
  it('должен пропускать mobile', () => {
    const decision = classifyLookupLineType({ phone: '+15551234567', lineType: 'mobile', carrierName: 'Verizon' });

    expect(decision.status).toBe('PASS');
    expect(decision.reason).toBeNull();
    expect(decision.carrierName).toBe('Verizon');
  });

  it('должен suppress landline, fixedVoip и invalid как LOOKUP_INVALID', () => {
    for (const lineType of ['landline', 'fixedVoip', 'invalid']) {
      const decision = classifyLookupLineType({ phone: '+15551234567', lineType });

      expect(decision.status).toBe('SUPPRESS');
      expect(decision.reason).toBe('LOOKUP_INVALID');
    }
  });

  it('должен quarantine nonFixedVoip, unknown, personal, tollFree, pager и voicemail', () => {
    for (const lineType of ['nonFixedVoip', 'unknown', 'personal', 'tollFree', 'pager', 'voicemail']) {
      const decision = classifyLookupLineType({ phone: '+15551234567', lineType });

      expect(decision.status).toBe('QUARANTINE');
      expect(decision.reason).toBe('LOOKUP_QUARANTINE');
    }
  });
});

describe('LookupValidationService suppression protection', () => {
  it('не должен очищать delivery-generated suppression при Lookup PASS', async () => {
    vi.spyOn(prisma.lead, 'findUnique').mockResolvedValue({
      optedOut: false,
      isSuppressed: true,
      suppressReason: 'INVALID_DESTINATION',
    } as never);
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue({ reason: 'INVALID_DESTINATION' } as never);
    const updateMany = vi.spyOn(prisma.lead, 'updateMany').mockReturnValue({} as never);
    const deleteMany = vi.spyOn(prisma.suppressionEntry, 'deleteMany').mockReturnValue({} as never);
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never);

    await LookupValidationService.clearLookupSuppression('+15551234567', 'lead-1');

    expect(updateMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('не должен перезаписывать delivery-generated suppression при Lookup non-PASS', async () => {
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue({ reason: 'QUARANTINE_TRANSIENT' } as never);
    const upsert = vi.spyOn(prisma.suppressionEntry, 'upsert').mockReturnValue({} as never);

    await LookupValidationService.upsertSuppressionEntry('+15551234567', 'LOOKUP_INVALID', 'lookup_upload');

    expect(upsert).not.toHaveBeenCalled();
  });
});
