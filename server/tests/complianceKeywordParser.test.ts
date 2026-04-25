import { describe, expect, it } from 'vitest';
import { ComplianceService } from '../src/services/complianceService';

describe('ComplianceService.classifyInboundKeyword', () => {
  it('detects opt-out keywords including END variants', () => {
    expect(ComplianceService.classifyInboundKeyword('END')).toBe('opt_out');
    expect(ComplianceService.classifyInboundKeyword('End!!!')).toBe('opt_out');
    expect(ComplianceService.classifyInboundKeyword('STOP')).toBe('opt_out');
    expect(ComplianceService.classifyInboundKeyword('stoP all')).toBe('opt_out');
  });

  it('does not false-match words containing END', () => {
    expect(ComplianceService.classifyInboundKeyword('Send it')).toBeNull();
    expect(ComplianceService.classifyInboundKeyword('Weekend works for me')).toBeNull();
    expect(ComplianceService.classifyInboundKeyword('I can send docs tonight')).toBeNull();
  });

  it('detects help and opt-in keywords', () => {
    expect(ComplianceService.classifyInboundKeyword('HELP')).toBe('help');
    expect(ComplianceService.classifyInboundKeyword('info')).toBe('help');
    expect(ComplianceService.classifyInboundKeyword('START')).toBe('opt_in');
    expect(ComplianceService.classifyInboundKeyword('UNSTOP')).toBe('opt_in');
  });

  it('does not treat conversational yes as opt-in', () => {
    expect(ComplianceService.classifyInboundKeyword('Yes')).toBeNull();
  });
});
