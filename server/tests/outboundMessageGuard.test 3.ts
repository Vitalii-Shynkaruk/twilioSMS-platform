import { describe, expect, it } from 'vitest';
import { validateOutboundMessageBody } from '../src/services/outboundMessageGuard';

describe('validateOutboundMessageBody', () => {
  it('allows normal sales copy', () => {
    const result = validateOutboundMessageBody('Send me your best email and monthly revenue.');
    expect(result.allowed).toBe(true);
  });

  it('blocks unresolved template tokens', () => {
    const result = validateOutboundMessageBody('Hi {{firstName}}, this is Alex.');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unresolved template token');
  });

  it('blocks accidental test messages', () => {
    expect(validateOutboundMessageBody('test').allowed).toBe(false);
    expect(validateOutboundMessageBody('TEST!!!').allowed).toBe(false);
  });

  it('does not falsely block words containing test', () => {
    const result = validateOutboundMessageBody('I can send you latest rates today.');
    expect(result.allowed).toBe(true);
  });
});
