/**
 * Compliance Service Tests
 * Tests STOP/HELP keyword handling, suppression list, quiet hours.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import prisma from '../src/config/database';
import { ComplianceService } from '../src/services/complianceService';

const TEST_PHONE = '+10005550001';
const TEST_PHONE_2 = '+10005550002';
const TEST_PHONE_3 = '+10005550003';
const hasMysqlDatabaseUrl = (process.env.DATABASE_URL || '').startsWith('mysql://');
const describeWithDb = hasMysqlDatabaseUrl ? describe : describe.skip;

describeWithDb('ComplianceService', () => {
  beforeAll(async () => {
    // Mock isQuietHours so tests don't depend on current time
    vi.spyOn(ComplianceService, 'isQuietHours').mockResolvedValue(false);

    // Clean up test data
    await prisma.suppressionEntry.deleteMany({
      where: { phone: { startsWith: '+1000555' } },
    });
    await prisma.lead.deleteMany({
      where: { phone: { startsWith: '+1000555' } },
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.suppressionEntry.deleteMany({
      where: { phone: { startsWith: '+1000555' } },
    });
    await prisma.lead.deleteMany({
      where: { phone: { startsWith: '+1000555' } },
    });
  });

  describe('processInboundKeywords', () => {
    it('STOP — marks as opt-out and returns response', async () => {
      // Create a lead so opt-out works
      await prisma.lead.create({
        data: { firstName: 'Test', phone: TEST_PHONE, source: 'test' },
      });

      const result = await ComplianceService.processInboundKeywords(TEST_PHONE, 'STOP');

      expect(result.isKeyword).toBe(true);
      expect(result.response).toBeTruthy();

      // Verify suppression list
      const entry = await prisma.suppressionEntry.findUnique({
        where: { phone: TEST_PHONE },
      });
      expect(entry).not.toBeNull();
      expect(entry?.reason).toBe('STOP');
    });

    it('stop (lowercase) — also works', async () => {
      await prisma.lead.create({
        data: { firstName: 'Test2', phone: TEST_PHONE_2, source: 'test' },
      });

      const result = await ComplianceService.processInboundKeywords(TEST_PHONE_2, 'stop');

      expect(result.isKeyword).toBe(true);
    });

    it('HELP — returns help response', async () => {
      const result = await ComplianceService.processInboundKeywords('+10005550099', 'HELP');

      expect(result.isKeyword).toBe(true);
      expect(result.response).toContain('Secure Credit Lines');
    });

    it('regular message — not a keyword', async () => {
      const result = await ComplianceService.processInboundKeywords('+10005550099', 'Hello, I am interested');

      expect(result.isKeyword).toBe(false);
    });

    it('END with punctuation — still treated as opt-out', async () => {
      const phone = '+10005550111';
      await prisma.lead.create({
        data: { firstName: 'EndCase', phone, source: 'test' },
      });

      const result = await ComplianceService.processInboundKeywords(phone, 'End!!!');
      expect(result.isKeyword).toBe(true);
      expect(result.action).toBe('opt_out');
    });

    it('Send it — must NOT trigger opt-out via END substring', async () => {
      const result = await ComplianceService.processInboundKeywords('+10005550112', 'Send it');
      expect(result.isKeyword).toBe(false);
    });

    it('Weekend works for me — must NOT trigger opt-out via END substring', async () => {
      const result = await ComplianceService.processInboundKeywords('+10005550113', 'Weekend works for me');
      expect(result.isKeyword).toBe(false);
    });
  });

  describe('canSendTo', () => {
    it('blocks sending to a number in the suppression list', async () => {
      // TEST_PHONE is already in suppression list after the STOP test
      const result = await ComplianceService.canSendTo(TEST_PHONE);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it('allows sending to a clean number', async () => {
      const result = await ComplianceService.canSendTo('+10005550077');

      expect(result.allowed).toBe(true);
    });
  });

  describe('handleOptOut / handleOptIn', () => {
    it('opt-in after opt-out — removes suppression', async () => {
      // First, opt-in
      await ComplianceService.handleOptIn(TEST_PHONE);

      const entry = await prisma.suppressionEntry.findUnique({
        where: { phone: TEST_PHONE },
      });
      // Entry should be deleted
      expect(entry).toBeNull();

      // Now canSendTo should allow it
      const result = await ComplianceService.canSendTo(TEST_PHONE);
      expect(result.allowed).toBe(true);
    });

    it('START opt-in must clear DNC and suppression state', async () => {
      const lead = await prisma.lead.create({
        data: {
          firstName: 'OptIn',
          phone: TEST_PHONE_3,
          source: 'test',
          status: 'DNC',
          optedOut: true,
          optedOutAt: new Date(),
          isSuppressed: true,
          suppressedAt: new Date(),
          suppressReason: 'DNC',
        },
      });

      await prisma.conversation.create({
        data: {
          leadId: lead.id,
          leadStatus: 'DNC',
        },
      });

      await prisma.suppressionEntry.create({
        data: {
          phone: TEST_PHONE_3,
          reason: 'DNC',
          source: 'inbox_manual',
        },
      });

      await ComplianceService.handleOptIn(TEST_PHONE_3);

      const updatedLead = await prisma.lead.findUnique({
        where: { id: lead.id },
        select: {
          status: true,
          optedOut: true,
          isSuppressed: true,
          suppressReason: true,
        },
      });

      const updatedConversation = await prisma.conversation.findUnique({
        where: { leadId: lead.id },
        select: { leadStatus: true },
      });

      const suppressionEntry = await prisma.suppressionEntry.findUnique({
        where: { phone: TEST_PHONE_3 },
      });

      expect(updatedLead).toMatchObject({
        status: 'REPLIED',
        optedOut: false,
        isSuppressed: false,
        suppressReason: null,
      });
      expect(updatedConversation?.leadStatus).toBeNull();
      expect(suppressionEntry).toBeNull();

      const result = await ComplianceService.canSendTo(TEST_PHONE_3);
      expect(result.allowed).toBe(true);
    });
  });
});
