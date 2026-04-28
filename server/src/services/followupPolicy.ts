export type FollowupStatus = 'scheduled' | 'due_now' | 'completed' | 'cleared';

export interface FollowupPolicyInput {
  classification: string | null;
  conversationState?: string | null;
  signals?: Record<string, unknown> | null;
  latestInboundText?: string | null;
  now?: Date;
}

export interface FollowupPolicyResult {
  time: Date | null;
  reason: string | null;
  status: FollowupStatus;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function atUtcHour(now: Date, daysFromNow: number, hour: number): Date {
  const target = new Date(now.getTime());
  target.setUTCDate(target.getUTCDate() + daysFromNow);
  target.setUTCHours(hour, 0, 0, 0);
  return target;
}

function nextMondayUtc(now: Date, hour: number): Date {
  const currentDay = now.getUTCDay();
  const daysUntilMonday = (8 - currentDay) % 7 || 7;
  return atUtcHour(now, daysUntilMonday, hour);
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasSameDayUrgency(signals: Record<string, unknown>, latestInboundText: string): boolean {
  const urgency = textValue(signals.urgency).toLowerCase();
  const text = latestInboundText.toLowerCase();
  return /\b(today|now|asap|right away|immediately|same day|this morning|this afternoon|tonight)\b/.test(
    `${urgency} ${text}`,
  );
}

function buildReason(label: string, signals: Record<string, unknown>): string {
  const parts = [label];
  const urgency = textValue(signals.urgency);
  const ask = textValue(signals.ask);
  const objections = textValue(signals.objections);
  const product = textValue(signals.product);

  if (urgency && urgency !== 'no urgency') parts.push(`urgency: ${urgency}`);
  if (ask) parts.push(`ask: ${ask}`);
  if (product) parts.push(`product: ${product}`);
  if (objections) parts.push(`signal: ${objections}`);

  return parts.join(' · ');
}

export function buildSuggestedFollowup(input: FollowupPolicyInput): FollowupPolicyResult {
  const now = input.now || new Date();
  const classification = (input.classification || '').toUpperCase();
  const conversationState = (input.conversationState || '').toUpperCase();
  const signals = input.signals || {};
  const latestInboundText = input.latestInboundText || '';

  if (classification === 'DEAD' || classification === 'WRONG_NUMBER') {
    return { time: null, reason: null, status: 'cleared' };
  }

  if (conversationState === 'SENSITIVE') {
    return {
      time: nextMondayUtc(now, 9),
      reason: buildReason('Sensitive conversation: soft follow-up next week', signals),
      status: 'scheduled',
    };
  }

  if (classification === 'HOT') {
    if (hasSameDayUrgency(signals, latestInboundText)) {
      return {
        time: new Date(now.getTime() + TWO_HOURS_MS),
        reason: buildReason('HOT lead with same-day urgency: follow up in 2 hours', signals),
        status: 'scheduled',
      };
    }

    return {
      time: atUtcHour(now, 1, 9),
      reason: buildReason('HOT lead: follow up tomorrow morning', signals),
      status: 'scheduled',
    };
  }

  if (classification === 'WARM') {
    const nextMorning = atUtcHour(now, 1, 9);
    const plus24Hours = new Date(now.getTime() + ONE_DAY_MS);
    return {
      time: nextMorning.getTime() <= plus24Hours.getTime() ? nextMorning : plus24Hours,
      reason: buildReason('WARM lead: follow up by next morning or within 24 hours', signals),
      status: 'scheduled',
    };
  }

  if (classification === 'NURTURE') {
    return {
      time: atUtcHour(now, 3, 9),
      reason: buildReason('NURTURE lead: follow up in 3 days', signals),
      status: 'scheduled',
    };
  }

  return { time: null, reason: null, status: 'cleared' };
}

export function resolveFollowupStatus(
  time: Date | null,
  requestedStatus?: string | null,
  now = new Date(),
): FollowupStatus {
  if (requestedStatus === 'completed') return 'completed';
  if (requestedStatus === 'cleared') return 'cleared';
  if (!time) return 'cleared';
  return time.getTime() <= now.getTime() ? 'due_now' : 'scheduled';
}
