/**
 * Number Service Tests
 * Tests number rotation, ramp-up, cooling, daily reset.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/config/database';
import { NumberService } from '../src/services/numberService';

const TEST_NUMBER_SID = 'PN_TEST_001';
const TEST_NUMBER_SID_2 = 'PN_TEST_002';
const TEST_PHONE = '+10009990001';
const TEST_PHONE_2 = '+10009990002';

describe('NumberService', () => {
  beforeAll(async () => {
    // Clean up test data
    await prisma.numberAssignment.deleteMany({
      where: { phoneNumber: { twilioSid: { startsWith: 'PN_TEST_' } } },
    });
    await prisma.phoneNumber.deleteMany({
      where: { twilioSid: { startsWith: 'PN_TEST_' } },
    });

    // Create test numbers
    await prisma.phoneNumber.create({
      data: {
        twilioSid: TEST_NUMBER_SID,
        phoneNumber: TEST_PHONE,
        friendlyName: 'Test Number 1',
        status: 'ACTIVE',
        dailyLimit: 350,
        dailySentCount: 0,
        deliveryRate: 95.0,
      },
    });

    await prisma.phoneNumber.create({
      data: {
        twilioSid: TEST_NUMBER_SID_2,
        phoneNumber: TEST_PHONE_2,
        friendlyName: 'Test Number 2',
        status: 'ACTIVE',
        dailyLimit: 350,
        dailySentCount: 300,
        deliveryRate: 85.0,
      },
    });
  });

  afterAll(async () => {
    await prisma.numberAssignment.deleteMany({
      where: { phoneNumber: { twilioSid: { startsWith: 'PN_TEST_' } } },
    });
    await prisma.phoneNumber.deleteMany({
      where: { twilioSid: { startsWith: 'PN_TEST_' } },
    });
  });

  describe('getBestAvailableNumber', () => {
    it('returns the best available number for sending', async () => {
      const number = await NumberService.getBestAvailableNumber();

      // Should return one of our ACTIVE numbers with remaining limit
      expect(number).toBeTruthy();
      expect(number?.status).toBe('ACTIVE');
    });
  });

  describe('recordSend', () => {
    it('increments dailySentCount and totalSent', async () => {
      const numberBefore = await prisma.phoneNumber.findUnique({
        where: { twilioSid: TEST_NUMBER_SID },
      });
      const countBefore = numberBefore!.dailySentCount;

      await NumberService.recordSend(numberBefore!.id, true);

      const numberAfter = await prisma.phoneNumber.findUnique({
        where: { twilioSid: TEST_NUMBER_SID },
      });
      expect(numberAfter!.dailySentCount).toBe(countBefore + 1);
      expect(numberAfter!.totalSent).toBeGreaterThan(numberBefore!.totalSent);
      // totalDelivered is now updated by Twilio webhook, not recordSend
      expect(numberAfter!.errorStreak).toBe(0);
    });

    it('increments totalFailed on error', async () => {
      const number = await prisma.phoneNumber.findUnique({
        where: { twilioSid: TEST_NUMBER_SID },
      });

      await NumberService.recordSend(number!.id, false);

      const updated = await prisma.phoneNumber.findUnique({
        where: { twilioSid: TEST_NUMBER_SID },
      });
      expect(updated!.totalFailed).toBeGreaterThan(number!.totalFailed);
    });
  });

  describe('coolNumber', () => {
    it('sets number status to COOLING', async () => {
      const number = await prisma.phoneNumber.findUnique({
        where: { twilioSid: TEST_NUMBER_SID_2 },
      });

      await NumberService.coolNumber(number!.id, 'Test cooling', 24);

      const cooled = await prisma.phoneNumber.findUnique({
        where: { twilioSid: TEST_NUMBER_SID_2 },
      });
      expect(cooled!.status).toBe('COOLING');
      expect(cooled!.cooldownReason).toBe('Test cooling');
      expect(cooled!.coolingUntil).toBeTruthy();
    });
  });

  describe('resetDailyCounters', () => {
    it('resets dailySentCount for all numbers', async () => {
      await NumberService.resetDailyCounters();

      const numbers = await prisma.phoneNumber.findMany({
        where: { twilioSid: { startsWith: 'PN_TEST_' } },
      });
      numbers.forEach((n) => {
        expect(n.dailySentCount).toBe(0);
      });
    });
  });
});
