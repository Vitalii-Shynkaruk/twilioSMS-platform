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
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const DEFAULT_EXPLICIT_FOLLOWUP_TIMEZONE = 'America/New_York';

interface ScheduledTimeCandidate {
  hour12: number;
  minute: number;
  meridiem: 'am' | 'pm';
  index: number;
  raw: string;
}

const EXPLICIT_FOLLOWUP_TIMEZONES: Array<{ pattern: RegExp; timeZone: string; label: string }> = [
  { pattern: /\b(?:central(?:\s+time)?|ct|cst|cdt)\b/i, timeZone: 'America/Chicago', label: 'CT' },
  { pattern: /\b(?:eastern(?:\s+time)?|et|est|edt)\b/i, timeZone: 'America/New_York', label: 'ET' },
  { pattern: /\b(?:mountain(?:\s+time)?|mt|mst|mdt)\b/i, timeZone: 'America/Denver', label: 'MT' },
  { pattern: /\b(?:pacific(?:\s+time)?|pt|pst|pdt)\b/i, timeZone: 'America/Los_Angeles', label: 'PT' },
];

const FOLLOWUP_NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  couple: 2,
  three: 3,
  few: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

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

function getZonedDateParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function addUtcDays(
  parts: { year: number; month: number; day: number },
  days: number,
): {
  year: number;
  month: number;
  day: number;
} {
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  target.setUTCDate(target.getUTCDate() + days);
  return {
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: target.getUTCDate(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const zoned = getZonedDateParts(date, timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return zonedAsUtc - date.getTime();
}

function zonedDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  const utcGuess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, input.timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
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

function getScheduledTimeCandidates(text: string): ScheduledTimeCandidate[] {
  const candidates: ScheduledTimeCandidate[] = [];
  const timePattern = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi;
  let match = timePattern.exec(text);

  while (match) {
    const hour12 = Number(match[1]);
    const minute = Number(match[2] || '0');
    if (hour12 >= 1 && hour12 <= 12 && minute >= 0 && minute <= 59) {
      candidates.push({
        hour12,
        minute,
        meridiem: match[3].toLowerCase().startsWith('p') ? 'pm' : 'am',
        index: match.index,
        raw: match[0],
      });
    }

    match = timePattern.exec(text);
  }

  const noonMatch = text.match(/\b(?:noon|midday)\b/i);
  if (noonMatch && typeof noonMatch.index === 'number') {
    candidates.push({ hour12: 12, minute: 0, meridiem: 'pm', index: noonMatch.index, raw: noonMatch[0] });
  }

  return candidates.sort((first, second) => first.index - second.index);
}

function scoreScheduledTimeCandidate(text: string, candidate: ScheduledTimeCandidate): number {
  const lower = text.toLowerCase();
  const before = lower.slice(Math.max(0, candidate.index - 45), candidate.index);
  const after = lower.slice(candidate.index + candidate.raw.length, candidate.index + candidate.raw.length + 45);
  const around = `${before} ${after}`;
  let score = 0;

  if (/\b(call|callback|call back|quick call|phone|talk|speak|chat|reach)\b/.test(around)) score += 6;
  if (/\b(around|about|at|after|before|by|near|approximately)\s*$/.test(before)) score += 3;
  if (/\b(can|could|available|free|works?|possible|good)\b/.test(around)) score += 2;
  if (/\b(get off|off work|work at|shift|clock out)\b/.test(before)) score -= 5;

  return score;
}

function pickScheduledTimeCandidate(text: string): ScheduledTimeCandidate | null {
  const candidates = getScheduledTimeCandidates(text);
  if (candidates.length === 0) return null;

  return candidates.reduce<ScheduledTimeCandidate | null>((best, candidate) => {
    if (!best) return candidate;

    const candidateScore = scoreScheduledTimeCandidate(text, candidate);
    const bestScore = scoreScheduledTimeCandidate(text, best);
    if (candidateScore > bestScore) return candidate;
    if (candidateScore === bestScore && candidate.index > best.index) return candidate;
    return best;
  }, null);
}

function parseExplicitScheduledCall(latestInboundText: string, now: Date): { time: Date; label: string } | null {
  const text = String(latestInboundText || '').trim();
  const lower = text.toLowerCase();
  if (
    !/\b(call|callback|call back|quick call|phone|talk|speak|chat|reach|available|free|works?|possible)\b/.test(lower)
  )
    return null;

  const tzMatch = EXPLICIT_FOLLOWUP_TIMEZONES.find((candidate) => candidate.pattern.test(text));
  const timeZone = tzMatch?.timeZone || DEFAULT_EXPLICIT_FOLLOWUP_TIMEZONE;
  const timeZoneLabel = tzMatch?.label || '';

  const timeCandidate = pickScheduledTimeCandidate(text);
  if (!timeCandidate) return null;

  let hour24 = timeCandidate.hour12 % 12;
  if (timeCandidate.meridiem === 'pm') hour24 += 12;

  const zonedNow = getZonedDateParts(now, timeZone);
  let targetDate = {
    year: zonedNow.year,
    month: zonedNow.month,
    day: zonedNow.day,
  };

  const mentionsTomorrow = /\btomorrow\b/.test(lower);
  const mentionsToday = /\btoday\b/.test(lower);
  if (mentionsTomorrow) {
    targetDate = addUtcDays(targetDate, 1);
  }

  let scheduledUtc = zonedDateTimeToUtc({
    ...targetDate,
    hour: hour24,
    minute: timeCandidate.minute,
    timeZone,
  });
  let dayLabel = mentionsTomorrow ? 'tomorrow' : 'today';

  if (!mentionsToday && !mentionsTomorrow && scheduledUtc.getTime() < now.getTime() - 15 * ONE_MINUTE_MS) {
    targetDate = addUtcDays(targetDate, 1);
    scheduledUtc = zonedDateTimeToUtc({
      ...targetDate,
      hour: hour24,
      minute: timeCandidate.minute,
      timeZone,
    });
    dayLabel = 'tomorrow';
  }

  const minuteLabel = timeCandidate.minute > 0 ? `:${String(timeCandidate.minute).padStart(2, '0')}` : '';
  const timeZoneLabelPart = timeZoneLabel ? ` ${timeZoneLabel}` : '';

  return {
    time: scheduledUtc,
    label: `${timeCandidate.hour12}${minuteLabel}${timeCandidate.meridiem}${timeZoneLabelPart} ${dayLabel}`,
  };
}

function parseExplicitFollowupWindow(latestInboundText: string): { delayMs: number; label: string } | null {
  const text = latestInboundText.toLowerCase();
  if (!text.trim()) return null;

  const match = text.match(
    /\b(?:in|after|need|give me|give us|call back in|follow up in|follow-up in|reach out in|text me in|check back in)?\s*(\d{1,2}|a|an|one|two|couple|three|few|four|five|six|seven|eight|nine|ten)\s*(?:more\s+)?(?:of\s+)?(hours?|hrs?|hr|minutes?|mins?|min)\b/i,
  );
  if (!match) return null;

  const rawAmount = String(match[1] || '').toLowerCase();
  const unit = String(match[2] || '').toLowerCase();
  const numericAmount = Number.parseInt(rawAmount, 10);
  const amount = Number.isFinite(numericAmount) ? numericAmount : FOLLOWUP_NUMBER_WORDS[rawAmount];
  if (!amount || amount < 1) return null;

  const isHours = /^hours?$|^hrs?$/.test(unit);
  const delayMs = amount * (isHours ? ONE_HOUR_MS : ONE_MINUTE_MS);
  const labelUnit = isHours ? (amount === 1 ? 'hour' : 'hours') : amount === 1 ? 'minute' : 'minutes';

  return {
    delayMs,
    label: `${amount} ${labelUnit}`,
  };
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
  const explicitScheduledCall = parseExplicitScheduledCall(latestInboundText, now);
  const explicitFollowupWindow = parseExplicitFollowupWindow(latestInboundText);

  if (classification === 'DEAD' || classification === 'WRONG_NUMBER') {
    return { time: null, reason: null, status: 'cleared' };
  }

  if (explicitScheduledCall && ['HOT', 'WARM', 'NURTURE'].includes(classification)) {
    return {
      time: explicitScheduledCall.time,
      reason: buildReason(`Lead confirmed call for ${explicitScheduledCall.label}`, signals),
      status: 'scheduled',
    };
  }

  if (explicitFollowupWindow && ['HOT', 'WARM', 'NURTURE'].includes(classification)) {
    return {
      time: new Date(now.getTime() + explicitFollowupWindow.delayMs),
      reason: buildReason(`Lead requested follow-up in ${explicitFollowupWindow.label}`, signals),
      status: 'scheduled',
    };
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
