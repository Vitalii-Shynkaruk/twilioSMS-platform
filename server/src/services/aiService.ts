import Anthropic from '@anthropic-ai/sdk';
import prisma from '../config/database';
import logger from '../config/logger';
import { readFile } from 'fs/promises';
import path from 'path';
import { buildSuggestedFollowup } from './followupPolicy';

/**
 * AIService — Multi-provider LLM integration (Anthropic + OpenAI).
 *
 * Phase 1 AI Inbox: provider switcher через SystemSetting.aiProvider:
 *   - "anthropic" (default)  → claude-sonnet-4-5
 *   - "openai"               → gpt-4.1-mini / gpt-4o
 *
 * Все ключи и выбор модели хранятся в таблице SystemSetting.
 */
export type AIProvider = 'anthropic' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

export interface CohortReasoningLeadSample {
  company?: string | null;
  source?: string | null;
  status: string;
  industry?: string | null;
  revenue?: number | null;
  assignedRepInitials?: string | null;
}

export interface CohortReasoningInput {
  cohortId: string;
  cohortType: string;
  title: string;
  criteria: Record<string, unknown>;
  counts: {
    totalMatchCount: number;
    eligibleCount: number;
    resolvedLeadCount: number;
    cooldownExcluded: number;
    capTrimmed: number;
  };
  capacity: {
    campaignCap: number;
    dailyCap: number;
    dailyUsed: number;
    dailyRemaining: number;
  };
  historicalAnchor: string;
  sampleLeads: CohortReasoningLeadSample[];
}

// Дефолтные модели если в Settings не выбрано
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4.1-mini',
};

const HANDOFF_BASE_DIR = path.resolve(process.cwd(), '..', 'SCL-HandOff');
const LOCKED_PROMPT_PATH = path.join(HANDOFF_BASE_DIR, 'classifier_prompt_v4_LOCKED.md');
const LOCKED_SCHEMA_PATH = path.join(HANDOFF_BASE_DIR, 'classification_schema.json');

type LockedSchemaMeta = {
  required: Set<string>;
  allowed: Set<string>;
};

let lockedPromptCache: string | null = null;
let lockedSchemaMetaCache: LockedSchemaMeta | null = null;

async function loadLockedPrompt(): Promise<string | null> {
  if (lockedPromptCache) return lockedPromptCache;
  try {
    const file = await readFile(LOCKED_PROMPT_PATH, 'utf-8');
    const normalized = file.trim();
    lockedPromptCache = normalized || null;
    return lockedPromptCache;
  } catch (error) {
    logger.warn('AI: locked prompt not found, fallback to built-in prompt', {
      path: LOCKED_PROMPT_PATH,
      error: (error as Error).message,
    });
    return null;
  }
}

async function loadLockedSchemaMeta(): Promise<LockedSchemaMeta | null> {
  if (lockedSchemaMetaCache) return lockedSchemaMetaCache;
  try {
    const raw = await readFile(LOCKED_SCHEMA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { required?: string[]; properties?: Record<string, unknown> };
    const required = new Set(Array.isArray(parsed.required) ? parsed.required : []);
    const allowed = new Set(Object.keys(parsed.properties || {}));
    lockedSchemaMetaCache = { required, allowed };
    return lockedSchemaMetaCache;
  } catch (error) {
    logger.warn('AI: locked schema not found, strict validation disabled', {
      path: LOCKED_SCHEMA_PATH,
      error: (error as Error).message,
    });
    return null;
  }
}

async function validateLockedSchemaShape(payload: unknown): Promise<{ ok: boolean; errors: string[] }> {
  const schemaMeta = await loadLockedSchemaMeta();
  if (!schemaMeta) return { ok: true, errors: [] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['payload is not an object'] };
  }

  const obj = payload as Record<string, unknown>;
  const missing = [...schemaMeta.required].filter((key) => !(key in obj));
  const extra = Object.keys(obj).filter((key) => !schemaMeta.allowed.has(key));

  const errors: string[] = [];
  if (missing.length > 0) errors.push(`missing required fields: ${missing.join(', ')}`);
  if (extra.length > 0) errors.push(`unexpected fields: ${extra.join(', ')}`);

  return { ok: errors.length === 0, errors };
}

export function extractJsonObjectFromLlmResponse(raw: string | null | undefined): string | null {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;

  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fencedMatch?.[1] || normalized).trim();
  const firstBraceIndex = candidate.indexOf('{');

  if (firstBraceIndex < 0) {
    return candidate || null;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = firstBraceIndex; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(firstBraceIndex, index + 1);
      }
    }
  }

  return candidate;
}

function normalizeLockedProduct(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized.includes('heloc')) return 'HELOC';
  if (normalized.includes('bridge')) return 'Bridge';
  if (normalized.includes('equipment')) return 'Equipment';
  if (normalized.includes('sba')) return 'SBA';
  if (normalized === 'cre' || normalized.includes('commercial')) return 'CRE';
  if (normalized.includes('mca') || normalized.includes('merchant')) return 'MCA';
  if (normalized === 'loc' || normalized.includes('line of credit')) return 'LOC';
  return 'Unknown';
}

function normalizeLockedUrgency(value: unknown, classification: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  if (/today|now|asap|urgent/.test(normalized)) return 'high';
  if (/week|soon|medium/.test(normalized)) return 'medium';
  return classification === 'HOT' ? 'medium' : 'low';
}

function normalizeCohortReasoningText(raw: string | null | undefined): string | null {
  const normalized = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  if (!normalized) return null;

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]+/g);
  const oneOrTwoSentences = sentenceMatches?.slice(0, 2).join(' ').trim() || normalized;
  return oneOrTwoSentences.slice(0, 700).trim() || null;
}

export function normalizeLockedClassifierPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const raw = payload as Record<string, unknown>;
  const classificationCandidate = String(raw.classification || '')
    .trim()
    .toUpperCase();
  const classification = ['HOT', 'WARM', 'NURTURE', 'DEAD', 'WRONG_NUMBER'].includes(classificationCandidate)
    ? classificationCandidate
    : 'NURTURE';
  const productCandidate = raw.product ?? raw.inferredProduct ?? raw.productInference;
  const objections = Array.isArray(raw.objections)
    ? raw.objections.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
    : typeof raw.objections === 'string' && raw.objections.trim()
      ? [raw.objections.trim()]
      : [];
  const staleState =
    raw.staleState === 'fresh' || raw.staleState === 'stale' || raw.staleState === 'ghosted' ? raw.staleState : null;
  const revenueConfidence =
    raw.revenueConfidence === 'high' ||
    raw.revenueConfidence === 'medium' ||
    raw.revenueConfidence === 'low' ||
    raw.revenueConfidence === 'none'
      ? raw.revenueConfidence
      : 'none';
  const repBehavior =
    raw.repBehavior === 'good' || raw.repBehavior === 'concerning' || raw.repBehavior === 'poor'
      ? raw.repBehavior
      : 'good';

  return {
    classification,
    leadScore: typeof raw.leadScore === 'number' ? raw.leadScore : 0,
    creditProfile: typeof raw.creditProfile === 'string' && raw.creditProfile.trim() ? raw.creditProfile.trim() : null,
    propertyOwnership:
      typeof raw.propertyOwnership === 'string' && raw.propertyOwnership.trim() ? raw.propertyOwnership.trim() : null,
    revenueMonthly: typeof raw.revenueMonthly === 'number' ? raw.revenueMonthly : null,
    revenueAnnual: typeof raw.revenueAnnual === 'number' ? raw.revenueAnnual : null,
    revenueConfidence,
    amountRequested: typeof raw.amountRequested === 'number' ? raw.amountRequested : null,
    useOfFunds: typeof raw.useOfFunds === 'string' && raw.useOfFunds.trim() ? raw.useOfFunds.trim() : null,
    product: normalizeLockedProduct(productCandidate),
    urgency: normalizeLockedUrgency(raw.urgency, classification),
    objections,
    suggestedReply: typeof raw.suggestedReply === 'string' ? raw.suggestedReply : '',
    suggestedFollowupTime:
      typeof raw.suggestedFollowupTime === 'string' && raw.suggestedFollowupTime.trim()
        ? raw.suggestedFollowupTime.trim()
        : null,
    suggestedFollowupReason:
      typeof raw.suggestedFollowupReason === 'string' && raw.suggestedFollowupReason.trim()
        ? raw.suggestedFollowupReason.trim()
        : null,
    staleState,
    hadMeaningfulEngagement: typeof raw.hadMeaningfulEngagement === 'boolean' ? raw.hadMeaningfulEngagement : false,
    suggestedReengageMessage:
      typeof raw.suggestedReengageMessage === 'string' && raw.suggestedReengageMessage.trim()
        ? raw.suggestedReengageMessage.trim()
        : null,
    repBehavior,
    coachingNote: typeof raw.coachingNote === 'string' ? raw.coachingNote : '',
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
  };
}

interface ClassificationEligibilityInput {
  leadStatus?: string | null;
  leadOptedOut?: boolean | null;
  inboundMessagesCount: number;
}

export function resolveClassifierPromptVersion(rawValue: string | null | undefined): string {
  const normalized = String(rawValue || '').trim();
  return normalized || 'v4_locked';
}

export function getClassificationSkipReason(input: ClassificationEligibilityInput): string | null {
  const status = String(input.leadStatus || '').toUpperCase();
  if (input.leadOptedOut || status === 'DNC') {
    return 'lead_opted_out_or_dnc';
  }
  if (input.inboundMessagesCount <= 0) {
    return 'no_inbound_messages';
  }
  return null;
}

export function extractEmailAddress(text: string | null | undefined): string | null {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const match = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (match?.[0]) {
    return match[0].trim().replace(/[>,.;:!?]+$/u, '');
  }

  // Recover emails where SMS spacing breaks tokens:
  // "john @ gmail . com", "john.doe @ domain.com", etc.
  const compactAroundEmailSeparators = normalized.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.');
  const compactMatch = compactAroundEmailSeparators.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (compactMatch?.[0]) {
    return compactMatch[0].trim().replace(/[>,.;:!?]+$/u, '');
  }

  // Some short SMS replies replace @ with ? (for example: Billprichard07?gmail.com).
  // When the whole token still looks like an email address, normalize it back to @.
  for (const rawToken of normalized.split(/\s+/u)) {
    const token = rawToken.replace(/^[<({\["']+/u, '').replace(/[>)}\]"',.;:!?]+$/u, '');
    const obfuscatedMatch = token.match(/^([A-Z0-9._%+-]{2,})\?([A-Z0-9.-]+\.[A-Z]{2,})$/i);
    if (obfuscatedMatch) {
      return `${obfuscatedMatch[1]}@${obfuscatedMatch[2]}`;
    }
  }

  return null;
}

interface DeterministicClassificationInput {
  classification: string;
  latestInboundText?: string | null;
  previousOutboundText?: string | null;
  knownEmail?: string | null;
  emailReceived?: boolean;
}

export function resolveDeterministicClassification(input: DeterministicClassificationInput): {
  classification: string;
  triggers: Record<string, boolean>;
} {
  const originalClassification = input.classification;
  const latestInboundText = String(input.latestInboundText || '').trim();
  const lower = latestInboundText.toLowerCase();
  if (!lower) return { classification: originalClassification, triggers: {} };

  const previousOutboundText = String(input.previousOutboundText || '').toLowerCase();
  const detectedInboundEmail = extractEmailAddress(latestInboundText);
  const knownEmail = extractEmailAddress(input.knownEmail);
  const hasKnownEmail = !!(detectedInboundEmail || knownEmail || input.emailReceived);
  const hasEmail = !!detectedInboundEmail;
  const emailRequestContext = /email|terms?|funding link|details/.test(previousOutboundText);
  const strongYes =
    /^(yes|yeah|yep|yup|sure|ok(ay)?|sounds good|i('?m| am)? in|let'?s (do it|go)|send (it|the)?|i'?m interested|interested|please send|send me|go ahead)\b/.test(
      lower,
    );
  const asksRealBuyingQuestion =
    /(what are your rates|what('?s| is) the rate|what are the fees|what('?s| is) the fee|what are your fees|what are the terms|what('?s| is) the term|how much can i get|how much would i qualify|how much would we qualify|how soon can you fund|when can i have it|how does this work|how would this work|what do you need|what do i need|what docs do you need|what paperwork do you need|what are the requirements|what is heloc|what is loc)/.test(
      lower,
    );
  const mentionsRevenue =
    /(\$?\d[\d.,]*(?:\s?[kKmM])?(?:\s*(?:\/|per|a)\s*(?:mo|month|monthly|yr|year|annual|annually))|\b\d[\d.,]*\s*(?:a month|per month|monthly|a year|per year|annual|annually)\b)/.test(
      lower,
    );
  const mentionsSpecificAmount =
    /\$\s*\d[\d.,]*(?:\s?[kKmM])?\b/.test(latestInboundText) ||
    (/\b\d{4,7}\b/.test(latestInboundText) &&
      /\b(need|want|looking for|trying to get|around|about|for|access|fund|loan)\b/.test(lower));
  const statesUseOfFunds =
    /\b(consolidat|working capital|inventory|equipment|expansion|marketing|payroll|taxes|bridge|refi|renovat|purchase|project|jobs|debt|cash flow|catch up|hire|truck|real estate)\b/.test(
      lower,
    );
  const providesQualificationData =
    /\b(address|mortgage|balance|fico|credit score|dob|date of birth|property|equity|home value)\b/.test(lower) &&
    /\d/.test(latestInboundText);
  const hasProductOutreachContext =
    /\b(funding|funding link|capital|mca|loc|line of credit|sba|equipment|cre|bridge|heloc|home equity|offer|approved|approval|terms?|lender|finance|financing)\b/.test(
      previousOutboundText,
    );
  const contextualClarifyingQuestion =
    hasProductOutreachContext &&
    /^(what('?s| is) (that|this|it)|what does that mean|what do you mean|can you explain|explain that)\??$/.test(lower);
  const termPreference =
    hasProductOutreachContext && /\b\d{1,2}\s*(?:to|-|\/)\s*\d{1,2}\s*(?:years?|yrs?|year|yr)\b/.test(lower);
  const givesUrgency =
    /\b(today|asap|right now|this week|tomorrow|by (monday|tuesday|wednesday|thursday|friday)|need (it )?(now|soon))\b/.test(
      lower,
    );
  const sharesAltPhone = /(?:^|\D)(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?:\D|$)/.test(latestInboundText);
  const strongYesWithProductContext = strongYes && hasProductOutreachContext;
  const affirmativeWithContext =
    strongYes &&
    (asksRealBuyingQuestion ||
      mentionsRevenue ||
      mentionsSpecificAmount ||
      statesUseOfFunds ||
      providesQualificationData);
  const contactInfoWithContext =
    hasKnownEmail &&
    (asksRealBuyingQuestion ||
      mentionsRevenue ||
      mentionsSpecificAmount ||
      statesUseOfFunds ||
      providesQualificationData ||
      emailRequestContext);
  const emailConfirmationWithContext = hasKnownEmail && strongYes && (emailRequestContext || hasProductOutreachContext);
  const emailIntentOverride = hasKnownEmail && (hasEmail || emailConfirmationWithContext) && emailRequestContext;

  if ((originalClassification === 'DEAD' || originalClassification === 'WRONG_NUMBER') && !emailIntentOverride) {
    return { classification: originalClassification, triggers: {} };
  }

  const triggers = {
    hasEmail,
    hasKnownEmail,
    emailIntentOverride,
    strongYes,
    asksRealBuyingQuestion,
    mentionsRevenue,
    mentionsSpecificAmount,
    statesUseOfFunds,
    providesQualificationData,
    contextualClarifyingQuestion,
    termPreference,
    givesUrgency,
    sharesAltPhone,
    strongYesWithProductContext,
    affirmativeWithContext,
    contactInfoWithContext,
    emailConfirmationWithContext,
  };

  const hasSubstantiveHotSignal =
    asksRealBuyingQuestion ||
    mentionsRevenue ||
    mentionsSpecificAmount ||
    statesUseOfFunds ||
    providesQualificationData ||
    contextualClarifyingQuestion ||
    termPreference ||
    givesUrgency ||
    strongYesWithProductContext ||
    affirmativeWithContext ||
    contactInfoWithContext ||
    emailConfirmationWithContext;

  return hasSubstantiveHotSignal && originalClassification !== 'HOT'
    ? { classification: 'HOT', triggers }
    : { classification: originalClassification, triggers };
}

export function sanitizeAiSuggestionText(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return normalized;

  return normalized
    .replace(
      /\s*Do you own (?:any )?(?:property|a home|real estate)(?: with equity)?\??/gi,
      ' I can explain the HELOC option and compare other funding paths. What amount are you looking for?',
    )
    .replace(
      /\s*Do you have (?:home )?equity\??/gi,
      ' I can explain the HELOC option and compare other funding paths. What amount are you looking for?',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

type SuggestionResolutionMessage = {
  direction?: string | null;
  body?: string | null;
};

type ResolvedAISuggestion = {
  type: string;
  text: string;
  cta: string;
};

function hasSuggestionText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeAiSuggestions(input: unknown): ResolvedAISuggestion[] {
  if (!Array.isArray(input)) return [];

  const normalized: ResolvedAISuggestion[] = [];
  const seen = new Set<string>();

  for (const rawItem of input) {
    if (!rawItem || typeof rawItem !== 'object') continue;

    const item = rawItem as Record<string, unknown>;
    const text = sanitizeAiSuggestionText(String(item.text || '')).trim();
    if (!text) continue;

    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push({
      type: hasSuggestionText(item.type) ? item.type.trim() : normalized.length === 0 ? 'BEST' : 'ALT',
      text,
      cta: hasSuggestionText(item.cta) ? item.cta.trim() : normalized.length === 0 ? '→ SEND' : '→ RE-ENGAGE',
    });

    if (normalized.length >= 2) break;
  }

  return normalized;
}

function extractLatestInboundText(messages: SuggestionResolutionMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message.direction || '').toUpperCase() !== 'INBOUND') continue;
    const body = String(message.body || '').trim();
    if (body) return body;
  }
  return '';
}

function extractRecentInboundContextText(messages: SuggestionResolutionMessage[], maxMessages = 3): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const collected: string[] = [];
  let foundInbound = false;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const direction = String(message.direction || '').toUpperCase();
    const body = String(message.body || '').trim();

    if (direction === 'INBOUND') {
      if (body) {
        foundInbound = true;
        collected.push(body);
        if (collected.length >= maxMessages) break;
      }
      continue;
    }

    if (foundInbound) break;
  }

  return collected.reverse().join('\n').trim();
}

function extractPreviousOutboundText(messages: SuggestionResolutionMessage[]): string {
  let latestInboundIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (String(messages[index].direction || '').toUpperCase() === 'INBOUND') {
      latestInboundIndex = index;
      break;
    }
  }

  if (latestInboundIndex > 0) {
    return findPreviousOutboundText(messages, latestInboundIndex);
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message.direction || '').toUpperCase() !== 'OUTBOUND') continue;
    const body = String(message.body || '').trim();
    if (body) return body;
  }

  return '';
}

function findPreviousOutboundText(messages: SuggestionResolutionMessage[], startIndexExclusive: number): string {
  for (let index = startIndexExclusive - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message.direction || '').toUpperCase() !== 'OUTBOUND') continue;
    const body = String(message.body || '').trim();
    if (body) return body;
  }

  return '';
}

export function extractConversationEmail(messages: SuggestionResolutionMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message.direction || '').toUpperCase() !== 'INBOUND') continue;

    const detectedEmail = extractEmailAddress(message.body);
    if (detectedEmail) return detectedEmail;
  }

  return null;
}

function formatCreditProfileLabel(match: RegExpMatchArray): string | null {
  const qualifier = String(match[1] || '')
    .trim()
    .toLowerCase();
  const score = Number.parseInt(String(match[2] || ''), 10);
  const plus = String(match[3] || '')
    .trim()
    .toLowerCase();
  if (!Number.isFinite(score) || score < 400 || score > 850) return null;

  if (plus === '+' || plus === 'plus' || qualifier === 'over' || qualifier === 'above') {
    return `${score}+`;
  }
  if (qualifier === 'under' || qualifier === 'below') {
    return `<${score}`;
  }
  if (qualifier === 'around' || qualifier === 'about' || qualifier === 'near' || qualifier === 'close to') {
    return `~${score}`;
  }

  return `${score}`;
}

function hasCreditSignalContext(bodyLower: string, previousOutboundLower: string): boolean {
  return /\b(credit|score|fico)\b/.test(bodyLower) || /\b(credit|score|fico)\b/.test(previousOutboundLower);
}

export function extractConversationCreditProfile(messages: SuggestionResolutionMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message.direction || '').toUpperCase() !== 'INBOUND') continue;

    const body = String(message.body || '').trim();
    const lower = body.toLowerCase();
    if (!lower) continue;

    const previousOutboundLower = findPreviousOutboundText(messages, index).toLowerCase();
    const bodyLooksLikeBareScore =
      /^\s*(?:over|above|under|below|around|about|near|close to)?\s*[4-8]\d{2}\s*(?:\+|plus)?\s*$/i.test(body);
    const scoreMatch = body.match(
      /\b(over|above|under|below|around|about|near|close to)?\s*([4-8]\d{2})\s*(\+|plus)?\b/i,
    );

    if (scoreMatch && (hasCreditSignalContext(lower, previousOutboundLower) || bodyLooksLikeBareScore)) {
      const label = formatCreditProfileLabel(scoreMatch);
      if (label) return label;
    }

    if (/\bexcellent credit\b/.test(lower)) return 'Excellent credit';
    if (/\bgreat credit\b/.test(lower)) return 'Great credit';
    if (/\bgood credit\b/.test(lower)) return 'Good credit';
    if (/\bfair credit\b/.test(lower)) return 'Fair credit';
    if (/\bpoor credit\b|\bbad credit\b|\brough credit\b/.test(lower)) return 'Poor credit';
  }

  return null;
}

function hasPropertySignalContext(bodyLower: string, previousOutboundLower: string): boolean {
  return (
    /\b(property|properties|real estate|home|house|equity|homeowner|home owner)\b/.test(bodyLower) ||
    /\b(property|properties|real estate|home|house|equity|homeowner|home owner)\b/.test(previousOutboundLower)
  );
}

function extractPropertyOwnershipFromText(bodyLower: string): string | null {
  if (!bodyLower.trim()) return null;

  if (/\bhas equity\b|\bequity\b/.test(bodyLower)) return 'Has equity';
  if (/\blots? of it\b|\ba lot of it\b|\bplenty\b|\bseveral\b|\bmany\b/.test(bodyLower)) {
    return 'Owns property';
  }
  if (
    /\b(yes|yeah|yep|yup|i do|own property|own a home|own a house|own real estate|have property|have a home|have a house|have real estate|homeowner)\b/.test(
      bodyLower,
    )
  ) {
    return 'Owns property';
  }
  if (/\b(no property|no home|no house|not a homeowner|rent|renter|none|do not|don't)\b/.test(bodyLower)) {
    return 'No property';
  }

  return null;
}

export function extractConversationPropertyOwnership(messages: SuggestionResolutionMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message.direction || '').toUpperCase() !== 'INBOUND') continue;

    const bodyLower = String(message.body || '')
      .trim()
      .toLowerCase();
    if (!bodyLower) continue;

    const previousOutboundLower = findPreviousOutboundText(messages, index).toLowerCase();
    if (!hasPropertySignalContext(bodyLower, previousOutboundLower)) continue;

    const label = extractPropertyOwnershipFromText(bodyLower);
    if (label) return label;
  }

  return null;
}

function normalizeAiNoteBodies(noteBodies: unknown): string[] {
  if (!Array.isArray(noteBodies)) return [];

  return noteBodies
    .map((note) => String(note || '').trim())
    .filter((note) => note.length > 0)
    .slice(-5);
}

function buildNoteAwareCallbackSuggestion(noteBodies: string[]): string | null {
  const mergedNotes = normalizeAiNoteBodies(noteBodies).join(' | ');
  if (!mergedNotes) return null;

  const amountMatch = mergedNotes.match(/\$\s*[\d,.]+(?:\s?[kKmM])?/);
  const lenderMatch =
    mergedNotes.match(/\$\s*[\d,.]+(?:\s?[kKmM])?\s+([A-Za-z][A-Za-z0-9&.-]{2,})/i) ||
    mergedNotes.match(/\bwith\s+([A-Za-z][A-Za-z0-9&.-]{2,})\b/i);
  const priorBalanceLabel = [amountMatch?.[0]?.trim(), lenderMatch?.[1]?.trim()].filter(Boolean).join(' ');

  if (priorBalanceLabel) {
    return `I just tried again. Is the prior ${priorBalanceLabel} balance still active, and are you trying to lower that payment or add fresh working capital?`;
  }

  if (/mca|daily|weekly|stack|payment|payback|advance|merchant cash|kapitus/i.test(mergedNotes)) {
    return 'I just tried again. Are you trying to lower an existing payment or add fresh working capital?';
  }

  if (/revenue|monthly|annual|per month|per year|year/i.test(mergedNotes)) {
    return 'I just tried again. With the business profile on file, are you trying to lower payment pressure or add fresh working capital?';
  }

  return null;
}

function extractConversationProductContext(messages: SuggestionResolutionMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const body = String(messages[index].body || '').toLowerCase();
    if (!body) continue;
    if (/heloc|home equity/.test(body)) return 'HELOC';
    if (/equipment/.test(body)) return 'equipment';
    if (/line of credit|\bloc\b/.test(body)) return 'LOC';
    if (/\bsba\b/.test(body)) return 'SBA';
    if (/bridge/.test(body)) return 'bridge';
    if (/commercial real estate|\bcre\b/.test(body)) return 'CRE';
    if (/invoice factoring|factoring/.test(body)) return 'invoice factoring';
  }

  return null;
}

function extractScheduledCallLabel(latestInboundText: string): string | null {
  const text = String(latestInboundText || '').trim();
  const lower = text.toLowerCase();
  if (!/\b(call|callback|call back|quick call|phone)\b/.test(lower)) return null;

  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || '0');
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const meridiem = timeMatch[3].toLowerCase().startsWith('p') ? 'pm' : 'am';
  const minuteLabel = minute > 0 ? `:${String(minute).padStart(2, '0')}` : '';

  const timezoneMatch = text.match(
    /\b(central(?:\s+time)?|ct|cst|cdt|eastern(?:\s+time)?|et|est|edt|mountain(?:\s+time)?|mt|mst|mdt|pacific(?:\s+time)?|pt|pst|pdt)\b/i,
  );
  const timezoneLabel = timezoneMatch
    ? (() => {
        const value = timezoneMatch[1].toLowerCase();
        if (/central|\bct\b|cst|cdt/.test(value)) return 'CT';
        if (/eastern|\bet\b|est|edt/.test(value)) return 'ET';
        if (/mountain|\bmt\b|mst|mdt/.test(value)) return 'MT';
        if (/pacific|\bpt\b|pst|pdt/.test(value)) return 'PT';
        return null;
      })()
    : null;
  const dayLabel = /\btomorrow\b/i.test(text) ? ' tomorrow' : /\btoday\b/i.test(text) ? ' today' : ' today';

  return `${hour}${minuteLabel}${meridiem}${timezoneLabel ? ` ${timezoneLabel}` : ''}${dayLabel}`;
}

function extractFollowupWindowLabel(latestInboundText: string): string | null {
  const text = String(latestInboundText || '')
    .toLowerCase()
    .trim();
  if (!text) return null;

  const match = text.match(
    /\b(?:in|after|need|give me|give us|call back in|follow up in|follow-up in|reach out in|text me in|check back in)?\s*(\d{1,2}|a|an|one|two|couple|three|few|four|five|six|seven|eight|nine|ten)\s*(?:more\s+)?(?:of\s+)?(hours?|hrs?|hr|minutes?|mins?|min)\b/i,
  );
  if (!match) return null;

  const rawAmount = String(match[1] || '').toLowerCase();
  const amountMap: Record<string, number> = {
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
  const parsedAmount = Number.parseInt(rawAmount, 10);
  const amount = Number.isFinite(parsedAmount) ? parsedAmount : amountMap[rawAmount];
  if (!amount || amount < 1) return null;

  const unit = String(match[2] || '').toLowerCase();
  const isHours = /^hours?$|^hrs?$/.test(unit);
  const unitLabel = isHours ? (amount === 1 ? 'hour' : 'hours') : amount === 1 ? 'minute' : 'minutes';

  return `${amount} ${unitLabel}`;
}

function suggestionLooksContradictoryToScheduledCall(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  if (
    /\bcall\b/.test(lower) &&
    !/funding link|best email|what problem are you trying to solve|how much capital/.test(lower)
  ) {
    return false;
  }

  return /funding link|best email|what problem are you trying to solve|how much capital|terms|email|working capital/i.test(
    lower,
  );
}

function suggestionLooksContradictoryToFollowupWindow(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  if (/\b(i('| wi)ll|will)\s+(follow up|reach out|text|call|check back|circle back)\b.*\b(in|after)\b/.test(lower)) {
    return false;
  }

  return true;
}

function parseMoneyToken(amountRaw: string, suffixRaw?: string | null): number | null {
  const normalized = String(amountRaw || '')
    .replace(/,/g, '')
    .trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const suffix = String(suffixRaw || '')
    .trim()
    .toLowerCase();
  if (suffix === 'm') return Math.round(amount * 1_000_000);
  if (suffix === 'k') return Math.round(amount * 1_000);
  return Math.round(amount);
}

function extractDisclosedMoneyAmount(text: string): number | null {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const withSuffixPattern = /\$?\s*([\d,.]+)\s*([kKmM])\b/g;
  let match: RegExpExecArray | null;
  while ((match = withSuffixPattern.exec(normalized)) !== null) {
    const parsed = parseMoneyToken(match[1], match[2]);
    if (parsed && parsed >= 1000) return parsed;
  }

  const dollarPattern = /\$\s*([\d,.]+)\b/g;
  while ((match = dollarPattern.exec(normalized)) !== null) {
    const parsed = parseMoneyToken(match[1], '');
    if (parsed && parsed >= 1000) return parsed;
  }

  const plainPattern = /\b(\d{4,8})\b/g;
  while ((match = plainPattern.exec(normalized)) !== null) {
    const parsed = parseMoneyToken(match[1], '');
    if (parsed && parsed >= 1000) return parsed;
  }

  return null;
}

function formatCompactMoneyLabel(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}k`;
  }
  return `$${Math.round(amount)}`;
}

function extractAmountDisclosureFromContext(latestInboundText: string, previousOutboundText: string): number | null {
  const amount = extractDisclosedMoneyAmount(latestInboundText);
  if (!amount) return null;

  const inboundLower = String(latestInboundText || '').toLowerCase();
  const previousOutboundLower = String(previousOutboundText || '').toLowerCase();

  const outboundAsksRevenue =
    /monthly\s+gross\s+revenue|monthly\s+revenue|gross\s+revenue|revenue\s+per\s+month|annual\s+revenue|yearly\s+revenue|what(?:'s| is)\s+your\s+monthly/.test(
      previousOutboundLower,
    );
  const outboundAsksRequestedAmount =
    /how\s+much\s+(?:are\s+you|do\s+you|would\s+you|you)\s+(?:looking|seek|seeking|need|want)|looking\s+to\s+receive|amount\s+are\s+you|what\s+amount|how\s+much\s+capital/.test(
      previousOutboundLower,
    );
  const inboundRevenueCue = /\b(monthly|revenue|gross|sales|annual|yearly|per\s*month|per\s*year)\b/.test(inboundLower);
  const inboundAskCue =
    /\b(need|looking|seek|seeking|want|amount|capital|equipment|inventory|expansion|working capital|debt|payoff|loan)\b/.test(
      inboundLower,
    );
  const amountOnlyReply = /^\s*\$?\s*[\d,.]+\s*[kKmM]?\s*$/.test(String(latestInboundText || '').trim());

  if (outboundAsksRequestedAmount) return amount;
  if (!outboundAsksRevenue && !inboundRevenueCue && (inboundAskCue || amountOnlyReply)) return amount;
  return null;
}

function hasPaymentTermsContext(latestInboundLower: string): boolean {
  if (hasSendTermsIntent(latestInboundLower)) {
    return false;
  }
  if (hasPayoffPenaltyContext(latestInboundLower)) {
    return true;
  }
  return /monthly payments?|low monthly|interest rate|%\s*interest|how many years|\brate\b|\brates\b|\bterm\b|\bterms\b|\bpayment\b|\bpayments\b|\bcost\b/.test(
    latestInboundLower,
  );
}

function hasSendTermsIntent(latestInboundLower: string): boolean {
  const normalized = String(latestInboundLower || '').toLowerCase();
  if (!normalized) return false;

  const asksToSendTerms =
    /\b(send|sending|sent|email|emailed|forward|forwarded|shoot|drop)\b.{0,80}\b(terms?|funding link|link|details|docs?|breakdown)\b/.test(
      normalized,
    ) ||
    /\b(terms?|funding link|link|details|docs?|breakdown)\b.{0,40}\b(to|at)\b/.test(normalized) ||
    /\bcan you send\b.{0,40}\b(terms?|link|details|docs?)\b/.test(normalized);

  return asksToSendTerms;
}

function hasPayoffPenaltyContext(latestInboundLower: string): boolean {
  const normalized = String(latestInboundLower || '').toLowerCase();
  if (!normalized) return false;

  return /\b(early\s+payoff|payoff\s+early|pay(?:ing)?\s+off\s+early|prepay(?:ment)?(?:\s+penalty)?|payoff\s+penalty|penalty\s+for\s+pay(?:ing)?\s+off)\b/.test(
    normalized,
  );
}

function hasPhoneCallLogisticsContext(
  latestInboundLower: string,
  previousOutboundLower: string,
  recentInboundLower?: string,
): boolean {
  const recentLower = String(recentInboundLower || latestInboundLower || '').toLowerCase();
  const merged = `${recentLower} ${previousOutboundLower}`;
  const hasCallContext = /\b(call|called|calling|quick call|phone|number)\b/.test(merged);
  const hasPhoneNumberInLatest = /(?:^|\D)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?:\D|$)/.test(
    latestInboundLower,
  );
  const hasRecentCallNowIntent =
    /\b(can we do a call now|can we (?:do )?a quick call|call now|can you call now|give me a call now|talk now|available now)\b/.test(
      recentLower,
    );
  const hasLogisticsSignal =
    /heads?\s*up|save(?:d)? (?:the )?(?:number|phone)|number not saved|not saved|declines?|blocked|does(?:n'?t| not) go through|go through|still available|right now|quick call/.test(
      `${recentLower} ${latestInboundLower}`,
    );

  if (hasPhoneNumberInLatest && hasRecentCallNowIntent) return true;

  return hasCallContext && hasLogisticsSignal;
}

function extractSenderIntroName(previousOutboundText: string): string | null {
  const normalized = String(previousOutboundText || '').trim();
  if (!normalized) return null;

  const patterns = [
    /\b([A-Za-z]+)\s+with\s+secure\s*credit\s*lines\b/i,
    /\b([A-Za-z]+)\s+with\s+securecreditlines\b/i,
    /\b(?:this is|it'?s|it is|i am|i'm)\s+([A-Za-z]+)\b/i,
  ];

  for (const pattern of patterns) {
    const matchedName = normalized.match(pattern)?.[1]?.trim();
    if (!matchedName) continue;
    return `${matchedName.charAt(0).toUpperCase()}${matchedName.slice(1).toLowerCase()}`;
  }

  return null;
}

function hasIdentityClarificationContext(latestInboundLower: string, previousOutboundLower: string): boolean {
  const normalizedInbound = String(latestInboundLower || '').toLowerCase();
  if (!normalizedInbound) return false;

  const asksWhoSenderIs =
    /\b(who('?s| is)\s+(?:this|that|you|[a-z]+)|who are you|what company is this|what company are you with|what is secure\s*credit\s*lines|what is securecreditlines|remind me who this is)\b/.test(
      normalizedInbound,
    );
  if (!asksWhoSenderIs) return false;

  return (
    !!extractSenderIntroName(previousOutboundLower) ||
    /\bsecure\s*credit\s*lines\b|\bsecurecreditlines\b/.test(previousOutboundLower)
  );
}

function hasCreditScoreContext(latestInboundLower: string, previousOutboundLower: string): boolean {
  if (/credit score|fico|\bscore\b/.test(latestInboundLower)) return true;
  if (
    /\bcredit\b/.test(latestInboundLower) &&
    /score|pull|hard|soft|qualif|under|over|above|below|[4-8]\d{2}/.test(latestInboundLower)
  ) {
    return true;
  }

  const hasScoreNumber = /\b(?:under|over|above|below|around|about|near|close to)\s*[4-8]\d{2}\b/.test(
    latestInboundLower,
  );
  const previousAskedScoreRange = /\b(?:under|over|above|below|around|about|near|close to)\s*[4-8]\d{2}\b/.test(
    previousOutboundLower,
  );

  return hasScoreNumber && previousAskedScoreRange;
}

function hasGeneralProgramInquiryContext(
  latestInboundLower: string,
  previousOutboundLower: string,
  recentInboundLower?: string,
): boolean {
  const recentLower = String(recentInboundLower || latestInboundLower || '').toLowerCase();

  // Direct questions about what programs/products are available
  const directProgramQuestion =
    /\b(what(?:'?s| is|are)\s+(?:your\s+)?(?:general\s+)?programs?|what programs?\s+do\s+you\s+(?:have|offer|do)|what(?:'?s| is)\s+(?:the|your)\s+program|what are\s+(?:the\s+)?programs?|what do\s+you\s+(?:offer|do|have|provide)|what do\s+you\s+guys?\s+(?:do|offer)|what(?:'?s| is)\s+(?:your\s+)?(?:product|service|offering|option)s?)\b/.test(
      recentLower,
    );

  // "What are they based on" / "what's it based on" — follow-up after outbound mentioned programs
  const basedOnFollowup =
    /\bwhat(?:\s+(?:is|are)|'s)\s+(?:it|they|this|that|those)\s+based\s+on\b|\bbased\s+on\s+what\b/.test(recentLower);

  const hasProgramIntroOutbound =
    /longer[- ]?term|program|option|line\s+of\s+credit|loc|heloc|revolving|term\s+loan|credit\s+line/.test(
      previousOutboundLower,
    );

  return directProgramQuestion || (basedOnFollowup && hasProgramIntroOutbound);
}

function suggestionLooksStaleForCreditScore(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;
  if (/credit|score|fico|qualif(?:y|ies)|minimum|600|hard pull|soft pull|starter business credit line/.test(lower)) {
    return false;
  }

  return true;
}

function suggestionLooksStaleForProgramInquiry(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  // Suggestions that assume lead wants email/funding link are stale when lead is asking about programs
  return /i have your email|i am sending|sending the funding link|funding link there now|send the funding link|i'll send the funding link|i have your email[.,]/.test(
    lower,
  );
}

function suggestionLooksStaleForIdentityClarification(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;
  if (/secure\s*credit\s*lines|securecreditlines|i help business owners|longer-term funding options/.test(lower)) {
    return false;
  }

  return true;
}

function suggestionLooksStaleForPaymentTerms(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;
  if (
    /funding link|best email|i have your email|sending (?:the )?(?:terms|link)|what problem are you trying|how much capital|email/.test(
      lower,
    )
  ) {
    return true;
  }

  return !/rate|payment|monthly|interest|years?|collateral|debt|prepayment|payoff|penalty|30yr|10yr|term/.test(lower);
}

function suggestionLooksStaleForSendTermsIntent(text: string, hasKnownEmailContext: boolean): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  if (hasKnownEmailContext) {
    return !/funding link|i have your email|sending (?:the )?(?:funding link|terms)|send options to your email/.test(
      lower,
    );
  }

  return !/best email|email to send|send terms right away|what is the best email/.test(lower);
}

function suggestionLooksStaleForPhoneCallLogistics(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;
  if (/heads?\s*-?up|save this number|save the number|call|phone|blocked|declines?|available/.test(lower)) {
    return false;
  }

  return true;
}

function suggestionLooksStaleForAmountDisclosure(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  if (/\$\s*\d[\d.,]*(?:\s?[kKmM])?\b/.test(lower)) return false;
  if (
    /working capital|equipment|inventory|pay(?:ing)? down debt|debt payoff|use of funds|what would you use/.test(lower)
  )
    return false;

  return true;
}

function hasSubstantiveCurrentTopicContext(
  latestInboundLower: string,
  previousOutboundLower: string,
  recentInboundLower?: string,
): boolean {
  const recentLower = String(recentInboundLower || latestInboundLower || '').toLowerCase();

  return (
    extractAmountDisclosureFromContext(latestInboundLower, previousOutboundLower) != null ||
    hasPaymentTermsContext(latestInboundLower) ||
    hasPayoffPenaltyContext(latestInboundLower) ||
    hasPhoneCallLogisticsContext(latestInboundLower, previousOutboundLower, recentLower) ||
    hasIdentityClarificationContext(latestInboundLower, previousOutboundLower) ||
    hasCreditScoreContext(latestInboundLower, previousOutboundLower) ||
    hasGeneralProgramInquiryContext(latestInboundLower, previousOutboundLower, recentLower) ||
    /hard pull|credit pull|hard credit|predatory|another mca|stacked mca|daily pay|weekly pay|\bfee|fees\b|payoff|prepay|penalty|statement|bank statement|tried to call|call(?:ed)? you back|call me back|got a recording|voicemail|recording|what('?s| is) (that|this|it)|how does it work|what do you mean|can you explain|what('?s| is)(?: a)? (heloc|loc|line of credit|home equity line of credit)|explain (?:a )?(heloc|loc|line of credit)|tell me about (?:a )?(heloc|loc|line of credit)|\b\d{1,2}\s*(?:to|-|\/)\s*\d{1,2}\s*(?:years?|yrs?|year|yr)\b/.test(
      recentLower,
    )
  );
}

function buildDeterministicFallbackSuggestionText(input: {
  classification?: string | null;
  latestInboundText?: string;
  recentInboundContextText?: string;
  previousOutboundText?: string;
  sharedEmail?: string | null;
  noteBodies?: string[];
  knownEmail?: string | null;
  emailReceived?: boolean;
  productContext?: string | null;
}): string {
  const classification = String(input.classification || '').toUpperCase();
  const latestInboundText = String(input.latestInboundText || '').trim();
  const latestInboundLower = latestInboundText.toLowerCase();
  const recentInboundContextText = String(input.recentInboundContextText || latestInboundText).trim();
  const recentInboundLower = recentInboundContextText.toLowerCase();
  const previousOutboundLower = String(input.previousOutboundText || '').toLowerCase();
  const availableEmail =
    extractEmailAddress(latestInboundText) ||
    extractEmailAddress(String(input.sharedEmail || '').trim()) ||
    extractEmailAddress(String(input.knownEmail || '').trim()) ||
    null;
  const hasEmailContext = !!(availableEmail || input.emailReceived);
  const noteBodies = normalizeAiNoteBodies(input.noteBodies);
  const emailRequestContext = /email|terms?|funding link|details/.test(previousOutboundLower);
  const positiveConfirmation =
    /^(yes|yeah|yep|yup|sure|ok(ay)?|sounds good|i('?m| am)? in|let'?s (do it|go)|send (it|the)?|i'?m interested|interested|please send|send me|go ahead)\b/.test(
      latestInboundLower,
    );
  const scheduledCallLabel = extractScheduledCallLabel(recentInboundContextText);
  const followupWindowLabel = extractFollowupWindowLabel(recentInboundContextText);
  const disclosedAmount = extractAmountDisclosureFromContext(
    latestInboundText,
    String(input.previousOutboundText || ''),
  );
  const senderIntroName = extractSenderIntroName(String(input.previousOutboundText || ''));
  const hasCallContext = /\b(call|callback|call back|quick call|phone)\b/.test(
    `${recentInboundLower} ${previousOutboundLower}`,
  );
  const phoneCallLogisticsContext = hasPhoneCallLogisticsContext(
    latestInboundLower,
    previousOutboundLower,
    recentInboundLower,
  );
  const identityClarificationContext = hasIdentityClarificationContext(latestInboundLower, previousOutboundLower);
  const hasCurrentTopicContext = hasSubstantiveCurrentTopicContext(
    latestInboundLower,
    previousOutboundLower,
    recentInboundLower,
  );

  if (identityClarificationContext) {
    const senderIntro = senderIntroName ? `${senderIntroName} with SecureCreditLines here.` : 'SecureCreditLines here.';
    if (hasEmailContext) {
      return `${senderIntro} I help business owners review longer-term funding options that can lower monthly pressure and free up cash flow. If you want, I can send the Funding Link to your email now.`;
    }
    return `${senderIntro} I help business owners review longer-term funding options that can lower monthly pressure and free up cash flow. If you want the Funding Link, send the best email and I will send it over.`;
  }

  if (classification === 'WRONG_NUMBER') {
    return 'Got it - sorry about that. Is there a better contact for the business, or should I close this out?';
  }

  if (
    /wrong number|my personal cell|personal cell phone|did not give you this number|remove (me|this number|it) from (your )?(list|system)/i.test(
      latestInboundLower,
    )
  ) {
    return 'Understood - I will remove this number from our list. Thanks for clarifying.';
  }

  if (/hard pull|credit pull|hard credit/i.test(latestInboundLower)) {
    return 'No hard pull to review options. Send the statements and I will look them over first so we can see whether this relieves the pressure without adding the wrong payment.';
  }

  if (hasCreditScoreContext(latestInboundLower, previousOutboundLower)) {
    if (/\b(?:no\s+)?(?:over|above)\s*600\b|\b[6-8]\d{2}\b/.test(latestInboundLower)) {
      return 'Over 600 can work for the starter business credit line. The minimum is around 600, so you may still qualify. What amount of access would help, and would you use it for cash flow or paying down debt?';
    }
    if (/\b(?:under|below)\s*500\b|\b4\d{2}\b/.test(latestInboundLower)) {
      return 'If it is under 500, this may not be the right fit today. If you are closer to 600, I can still review options with no hard pull upfront. Where are you roughly?';
    }
    return 'You may be surprised. What credit score range are you around? I can usually review starter business credit options around 600+, and checking options does not require a hard pull upfront.';
  }

  if (phoneCallLogisticsContext) {
    if (
      /(?:^|\D)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?:\D|$)/.test(latestInboundText) &&
      /\b(can we do a call now|can we (?:do )?a quick call|call now|can you call now|give me a call now|talk now|available now)\b/.test(
        recentInboundLower,
      )
    ) {
      return 'Perfect, I can call now on that number. Save this number first if your phone blocks unknown callers, and I will call right away.';
    }
    if (
      /heads?\s*up|number not saved|not saved|declines?|blocked|save(?:d)? (?:the )?(?:number|phone)/.test(
        recentInboundLower,
      )
    ) {
      return 'Got it. I will text you a heads-up before I call so you can save this number and the call does not get blocked. Is now still good for a 2 minute call?';
    }
    if (/does(?:n'?t| not) go through|go through|called yours/.test(recentInboundLower)) {
      return 'Thanks for trying. The call may not connect from that number. I can text you right before I call from the direct number, or you can send the best number to reach you on.';
    }
    if (/right now|still available|quick call|call now|talk now/.test(recentInboundLower)) {
      return 'Yes, I can call now. If your phone blocks unknown numbers, save this number first and I will call right away.';
    }
    return 'Got it. I will text you before I call so you know it is me and the call does not get blocked.';
  }

  if (scheduledCallLabel && hasCallContext) {
    if (input.productContext) {
      return `Perfect, I'll call you at ${scheduledCallLabel}. Looking forward to discussing your ${input.productContext} options.`;
    }
    return `Perfect, I'll call you at ${scheduledCallLabel}. Looking forward to speaking then.`;
  }

  if (followupWindowLabel) {
    if (/docs?|email|confirm receipt|terms/.test(previousOutboundLower)) {
      return `No problem, take your time. I'll follow up in ${followupWindowLabel} to answer any questions once you've had a chance to review the docs.`;
    }
    return `No problem, take your time. I'll follow up in ${followupWindowLabel}.`;
  }

  if (hasPayoffPenaltyContext(latestInboundLower)) {
    return 'No early payoff penalty on this structure. You can pay down early without a fee. If you want, I can text the exact payoff terms and payment options side-by-side.';
  }

  if (disclosedAmount != null) {
    const amountLabel = formatCompactMoneyLabel(disclosedAmount);
    if (hasEmailContext) {
      return `Perfect, ${amountLabel} noted. I can send options to your email now. Is this mainly for working capital, equipment, or paying down debt?`;
    }
    return `Perfect, ${amountLabel} noted. What is the best email to send options to, and is this mainly for working capital, equipment, or paying down debt?`;
  }

  if (
    hasEmailContext &&
    !hasCurrentTopicContext &&
    (extractEmailAddress(latestInboundText) || (emailRequestContext && positiveConfirmation))
  ) {
    return 'Great, I have your email. I am sending the Funding Link now. Once you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?';
  }

  if (
    /(what('?s| is)(?: a)? (heloc|home equity line of credit)|explain (?:a )?heloc|tell me about (?:a )?heloc)/i.test(
      latestInboundLower,
    )
  ) {
    return 'Good question - a HELOC is a Home Equity Line of Credit. It uses available equity to give you longer-term access to capital without stacking another short-term payment. If you want, I can break down how it works and whether it fits your situation.';
  }

  if (
    /(what('?s| is)(?: a)? (loc|line of credit)|explain (?:a )?(loc|line of credit)|tell me about (?:a )?(loc|line of credit))/i.test(
      latestInboundLower,
    )
  ) {
    return 'Good question - a LOC is a Line of Credit, which gives you flexible access to capital you can draw from as needed instead of taking one rigid lump sum. If you want, I can break down how it works and what problem you are trying to solve.';
  }

  if (/\b\d{1,2}\s*(?:to|-|\/)\s*\d{1,2}\s*(?:years?|yrs?|year|yr)\b/.test(latestInboundLower)) {
    return 'That range makes sense. Longer-term options are exactly the lane we would look at here. What is the best email to send options to, and about what monthly revenue is the business doing?';
  }

  if (/tried to call|call(?:ed)? you back|call me back|got a recording|voicemail|recording/.test(recentInboundLower)) {
    const noteAwareCallbackSuggestion = buildNoteAwareCallbackSuggestion(noteBodies);
    if (noteAwareCallbackSuggestion) return noteAwareCallbackSuggestion;
    return 'I just tried again. Are you trying to lower an existing payment or add fresh working capital?';
  }

  if (/what('?s| is) (that|this|it)|how does it work|what do you mean|can you explain/i.test(latestInboundLower)) {
    return 'It is a longer-term funding option meant to relieve short-term cash-flow pressure, not pile on the wrong payment. What are you trying to solve right now, and about how much would actually fix it?';
  }

  if (/predatory|another mca|stacked mca|daily pay|weekly pay/.test(latestInboundLower)) {
    return 'Fair concern. The goal is not to stack another daily-payback MCA. It is to replace short-term pressure with a structure the business can actually carry. What balance or cash-flow problem are you trying to solve, and about how much would fix it?';
  }

  if (/\bfee|fees\b/.test(latestInboundLower)) {
    return 'Fair question. Fees depend on structure, risk, and how long you need the money out. To give you the cleanest quote, about how much do you need and is the goal to lower payment pressure or add working capital?';
  }

  if (hasSendTermsIntent(latestInboundLower)) {
    if (hasEmailContext) {
      return 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?';
    }
    return 'Absolutely. I can send terms right away. What is the best email to send them to?';
  }

  if (/rate|rates|term|terms|payment|cost|payoff|prepay|penalty/.test(latestInboundLower)) {
    return 'Fair question. Rate depends on credit and collateral, but the bigger issue is what problem the capital needs to solve so we size the right option. Are you trying to clear expensive debt, cover working capital, or fund growth?';
  }

  if (/statement|bank statement/i.test(latestInboundLower) || /statement|bank statement/i.test(previousOutboundLower)) {
    return 'Send the statements when you have them and I will review them right away. I want to see where the cash-flow squeeze is coming from so we match the right structure instead of layering on the wrong payment.';
  }

  if (hasGeneralProgramInquiryContext(latestInboundLower, previousOutboundLower, recentInboundLower)) {
    return 'The main program is a revolving business credit line - up to 750K, structured over longer terms, rates starting at 6.6%. It is based on business revenue, time in business, and credit profile. What amount of access would help, and are you looking to lower an existing payment or add working capital?';
  }

  if (availableEmail) {
    return 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?';
  }

  if (/email/i.test(latestInboundLower) || /email/i.test(previousOutboundLower)) {
    return 'Absolutely. What is the best email to send the terms to? Once I have it, what problem are you trying to solve in the business, and about how much capital would fix it?';
  }

  switch (classification) {
    case 'HOT':
      return 'Thanks for the update. What is the main problem you are trying to solve in the business right now, and about how much capital would actually fix it?';
    case 'WARM':
      return 'Fair question. Before I point you to terms, what is the main bottleneck you are trying to solve, and about how much capital would move the needle?';
    case 'NURTURE':
      return 'No pressure. When timing makes sense, what problem would you want capital to solve first, and about how much would it take?';
    default:
      return 'Thanks for the update. What is the main problem you are trying to solve in the business, and about how much capital would fix it?';
  }
}

function suggestionRequestsEmail(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  if (!lower) return false;

  return /(best email|what('?s| is) the best email|email to send (the )?(terms|details|info)|email for (the )?(terms|details|info))/i.test(
    lower,
  );
}

function suggestionLooksContradictoryToEmailIntent(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  return /remove (me|this number|it) from (your )?(list|system)|removing (you|me|this number|it) from (our|your )?(list|system)|wrong number|have a good one\.?$|best of luck(?: with the business)?\.?$|stop contacting/i.test(
    lower,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectKnownConversationEmails(input: {
  latestInboundText?: string;
  sharedEmail?: string | null;
  knownEmail?: string | null;
}): string[] {
  const emails = [
    extractEmailAddress(String(input.latestInboundText || '').trim()),
    extractEmailAddress(String(input.sharedEmail || '').trim()),
    extractEmailAddress(String(input.knownEmail || '').trim()),
  ].filter((email): email is string => !!email);

  return [...new Set(emails.map((email) => email.toLowerCase()))];
}

function suggestionMisusesClientEmailAsSender(text: string, knownEmails: readonly string[]): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower || knownEmails.length === 0) return false;

  return knownEmails.some(
    (email) =>
      lower.includes(email) && /(reply here\s+or\s+email|email|send|reach me|email me).{0,120}\bto me at\b/.test(lower),
  );
}

function repairClientEmailSenderMisuse(text: string, knownEmails: readonly string[]): string {
  let repaired = String(text || '');

  for (const email of knownEmails) {
    const escapedEmail = escapeRegExp(email);
    repaired = repaired.replace(
      new RegExp(
        `reply here\\s+or\\s+(?:email|send)\\s+(?:those|them|that|it|everything|the docs?|the info|the information)\\s+to\\s+me\\s+at\\s+${escapedEmail}`,
        'ig',
      ),
      'reply here or send that over by email',
    );
    repaired = repaired.replace(
      new RegExp(
        `(?:email|send)\\s+(?:those|them|that|it|everything|the docs?|the info|the information)\\s+to\\s+me\\s+at\\s+${escapedEmail}`,
        'ig',
      ),
      'send that over by email',
    );
    repaired = repaired.replace(new RegExp(`email me at\\s+${escapedEmail}`, 'ig'), 'email me');
    repaired = repaired.replace(new RegExp(`reach me at\\s+${escapedEmail}`, 'ig'), 'reach me by email');
    repaired = repaired.replace(new RegExp(escapedEmail, 'ig'), '');
  }

  return sanitizeAiSuggestionText(
    repaired
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/\.\s*\./g, '.')
      .trim(),
  );
}

function suggestionLooksGenericFallback(text: string): boolean {
  const lower = String(text || '')
    .trim()
    .toLowerCase();
  if (!lower) return false;

  return /^(thanks for the update\.|got it\. quick question|no pressure\.|no rush\.|absolutely\. what is the best email|it is a longer-term funding option|it is a business funding option)/.test(
    lower,
  );
}

function repairSuggestionsForInboundContext(input: {
  suggestions: ResolvedAISuggestion[];
  classification?: string | null;
  latestInboundText?: string;
  recentInboundContextText?: string;
  previousOutboundText?: string;
  sharedEmail?: string | null;
  noteBodies?: string[];
  knownEmail?: string | null;
  emailReceived?: boolean;
  productContext?: string | null;
}): ResolvedAISuggestion[] {
  const latestInboundLower = String(input.latestInboundText || '').toLowerCase();
  const recentInboundLower = String(input.recentInboundContextText || input.latestInboundText || '').toLowerCase();
  const sharedEmail = String(input.sharedEmail || '').trim();
  const noteBodies = normalizeAiNoteBodies(input.noteBodies);
  const knownEmail = extractEmailAddress(String(input.knownEmail || '').trim());
  const knownConversationEmails = collectKnownConversationEmails({
    latestInboundText: input.latestInboundText,
    sharedEmail,
    knownEmail,
  });
  const scheduledCallLabel = extractScheduledCallLabel(
    String(input.recentInboundContextText || input.latestInboundText || ''),
  );
  const followupWindowLabel = extractFollowupWindowLabel(
    String(input.recentInboundContextText || input.latestInboundText || ''),
  );
  const scheduledCallContext =
    !!scheduledCallLabel &&
    /\b(call|callback|call back|quick call|phone)\b/.test(
      `${recentInboundLower} ${String(input.previousOutboundText || '').toLowerCase()}`,
    );
  const followupWindowContext = !!followupWindowLabel;
  const amountDisclosureContext =
    extractAmountDisclosureFromContext(
      String(input.latestInboundText || ''),
      String(input.previousOutboundText || ''),
    ) != null;
  const paymentTermsContext = hasPaymentTermsContext(latestInboundLower);
  const sendTermsIntentContext = hasSendTermsIntent(latestInboundLower);
  const hasKnownEmailContext = !!(
    extractEmailAddress(String(input.latestInboundText || '').trim()) ||
    extractEmailAddress(sharedEmail) ||
    knownEmail ||
    input.emailReceived
  );
  const phoneCallLogisticsContext = hasPhoneCallLogisticsContext(
    latestInboundLower,
    String(input.previousOutboundText || '').toLowerCase(),
    recentInboundLower,
  );
  const identityClarificationContext = hasIdentityClarificationContext(
    latestInboundLower,
    String(input.previousOutboundText || '').toLowerCase(),
  );
  const creditScoreContext = hasCreditScoreContext(
    latestInboundLower,
    String(input.previousOutboundText || '').toLowerCase(),
  );
  const generalProgramInquiryContext = hasGeneralProgramInquiryContext(
    latestInboundLower,
    String(input.previousOutboundText || '').toLowerCase(),
    recentInboundLower,
  );
  const emailIntentContext =
    hasKnownEmailContext &&
    /email|terms?|funding link|details/.test(String(input.previousOutboundText || '').toLowerCase());
  const callbackWithNotes =
    noteBodies.length > 0 &&
    /tried to call|call(?:ed)? you back|call me back|got a recording|voicemail|recording/.test(recentInboundLower);
  const needsContextualRepair =
    !!sharedEmail ||
    !!knownEmail ||
    !!input.emailReceived ||
    scheduledCallContext ||
    followupWindowContext ||
    amountDisclosureContext ||
    paymentTermsContext ||
    sendTermsIntentContext ||
    phoneCallLogisticsContext ||
    identityClarificationContext ||
    creditScoreContext ||
    generalProgramInquiryContext ||
    callbackWithNotes ||
    /predatory|another mca|stacked mca|daily pay|weekly pay|fee|fees|payoff|prepay|penalty|rate|rates|term|terms|payment|cost|hard pull|credit pull|wrong number|my personal cell|did not give you this number|remove (me|this number|it) from (your )?(list|system)|what('?s| is) (that|this|it)|how does this work|what('?s| is)(?: a)? (heloc|loc|line of credit|home equity line of credit)|explain (?:a )?(heloc|loc|line of credit)|tell me about (?:a )?(heloc|loc|line of credit)|\b\d{1,2}\s*(?:to|-|\/)\s*\d{1,2}\s*(?:years?|yrs?|year|yr)\b/.test(
      recentInboundLower,
    );
  if (!needsContextualRepair) return input.suggestions;

  const repairedBestText = sanitizeAiSuggestionText(
    buildDeterministicFallbackSuggestionText({
      classification: input.classification,
      latestInboundText: input.latestInboundText,
      recentInboundContextText: input.recentInboundContextText,
      previousOutboundText: input.previousOutboundText,
      sharedEmail,
      noteBodies,
      knownEmail,
      emailReceived: input.emailReceived,
      productContext: input.productContext,
    }),
  );
  if (!repairedBestText) return input.suggestions;

  let changed = false;
  const repaired = input.suggestions.map((suggestion) => {
    const misusesClientEmailAsSender = suggestionMisusesClientEmailAsSender(suggestion.text, knownConversationEmails);
    const shouldRepairSuggestion =
      misusesClientEmailAsSender ||
      suggestionRequestsEmail(suggestion.text) ||
      (scheduledCallContext && suggestionLooksContradictoryToScheduledCall(suggestion.text)) ||
      (followupWindowContext && suggestionLooksContradictoryToFollowupWindow(suggestion.text)) ||
      (amountDisclosureContext && suggestionLooksStaleForAmountDisclosure(suggestion.text)) ||
      (paymentTermsContext && suggestionLooksStaleForPaymentTerms(suggestion.text)) ||
      (sendTermsIntentContext && suggestionLooksStaleForSendTermsIntent(suggestion.text, hasKnownEmailContext)) ||
      (phoneCallLogisticsContext && suggestionLooksStaleForPhoneCallLogistics(suggestion.text)) ||
      (identityClarificationContext && suggestionLooksStaleForIdentityClarification(suggestion.text)) ||
      (creditScoreContext && suggestionLooksStaleForCreditScore(suggestion.text)) ||
      (generalProgramInquiryContext && suggestionLooksStaleForProgramInquiry(suggestion.text)) ||
      (emailIntentContext && suggestionLooksContradictoryToEmailIntent(suggestion.text)) ||
      (needsContextualRepair && suggestionLooksGenericFallback(suggestion.text));
    if (!shouldRepairSuggestion) return suggestion;
    changed = true;

    if (misusesClientEmailAsSender) {
      const repairedSuggestionText = repairClientEmailSenderMisuse(suggestion.text, knownConversationEmails);
      return {
        ...suggestion,
        text: repairedSuggestionText || repairedBestText,
      };
    }

    return {
      ...suggestion,
      text: repairedBestText,
    };
  });

  if (!changed) return input.suggestions;

  const deduped: ResolvedAISuggestion[] = [];
  const seen = new Set<string>();
  for (const suggestion of repaired) {
    const dedupeKey = suggestion.text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(suggestion);
    if (deduped.length >= 2) break;
  }

  return deduped;
}

export function resolveAiSuggestions(input: {
  suggestions?: unknown;
  fallbackSuggestions?: unknown;
  classification?: string | null;
  signals?: Record<string, unknown> | null;
  messages?: SuggestionResolutionMessage[];
  notes?: string[];
  knownEmail?: string | null;
  emailReceived?: boolean;
}): ResolvedAISuggestion[] {
  const chronologicalMessages = Array.isArray(input.messages) ? input.messages : [];
  const latestInboundText = extractLatestInboundText(chronologicalMessages);
  const recentInboundContextText = extractRecentInboundContextText(chronologicalMessages);
  const previousOutboundText = extractPreviousOutboundText(chronologicalMessages);
  const sharedEmail = extractConversationEmail(chronologicalMessages);
  const noteBodies = normalizeAiNoteBodies(input.notes);
  const productContext = extractConversationProductContext(chronologicalMessages);

  const directSuggestions = repairSuggestionsForInboundContext({
    suggestions: normalizeAiSuggestions(input.suggestions),
    classification: input.classification,
    latestInboundText,
    recentInboundContextText,
    previousOutboundText,
    sharedEmail,
    noteBodies,
    knownEmail: input.knownEmail,
    emailReceived: input.emailReceived,
    productContext,
  });
  if (directSuggestions.length > 0) return directSuggestions;

  const preservedSuggestions = repairSuggestionsForInboundContext({
    suggestions: normalizeAiSuggestions(input.fallbackSuggestions),
    classification: input.classification,
    latestInboundText,
    recentInboundContextText,
    previousOutboundText,
    sharedEmail,
    noteBodies,
    knownEmail: input.knownEmail,
    emailReceived: input.emailReceived,
    productContext,
  });
  if (preservedSuggestions.length > 0) return preservedSuggestions;

  const signals = (input.signals || {}) as Record<string, unknown>;
  const signalSuggestions = repairSuggestionsForInboundContext({
    suggestions: normalizeAiSuggestions([
      {
        type: 'BEST',
        text: hasSuggestionText(signals.suggestedReply) ? signals.suggestedReply : '',
        cta: '→ SEND',
      },
      {
        type: 'ALT',
        text: hasSuggestionText(signals.suggestedReengageMessage) ? signals.suggestedReengageMessage : '',
        cta: '→ RE-ENGAGE',
      },
    ]),
    classification: input.classification,
    latestInboundText,
    recentInboundContextText,
    previousOutboundText,
    sharedEmail,
    noteBodies,
    knownEmail: input.knownEmail,
    emailReceived: input.emailReceived,
    productContext,
  });
  if (signalSuggestions.length > 0) return signalSuggestions;

  const bestText = sanitizeAiSuggestionText(
    buildDeterministicFallbackSuggestionText({
      classification: input.classification,
      latestInboundText,
      recentInboundContextText,
      previousOutboundText,
      sharedEmail,
      noteBodies,
      knownEmail: input.knownEmail,
      emailReceived: input.emailReceived,
      productContext,
    }),
  );

  if (!bestText) return [];

  const resolved: ResolvedAISuggestion[] = [{ type: 'BEST', text: bestText, cta: '→ SEND' }];
  const staleState = String(signals.staleState || '').toLowerCase();
  if (staleState === 'stale' || staleState === 'ghosted') {
    const altText = sanitizeAiSuggestionText(
      'Quick check-in: should I send your Funding Link or circle back next week?',
    );
    if (altText && altText.toLowerCase() !== bestText.toLowerCase()) {
      resolved.push({ type: 'ALT', text: altText, cta: '→ RE-ENGAGE' });
    }
  }

  return resolved;
}

export class AIService {
  /**
   * Загружает активную AI-конфигурацию из SystemSetting.
   * Если выбран провайдер, но ключ пустой — возвращает null (AI не активен).
   */
  private static async getConfig(): Promise<AIConfig | null> {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['aiProvider', 'anthropicApiKey', 'anthropicModel', 'openaiApiKey', 'openaiModel'],
        },
      },
    });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    // По умолчанию anthropic (Phase 1 спека). Можно переключить в Settings UI.
    const provider: AIProvider = map.aiProvider === 'openai' ? 'openai' : 'anthropic';

    const apiKey = provider === 'anthropic' ? String(map.anthropicApiKey || '') : String(map.openaiApiKey || '');

    if (!apiKey) {
      logger.warn('AI: Provider configured but API key missing', { provider });
      return null;
    }

    const modelKey = provider === 'anthropic' ? 'anthropicModel' : 'openaiModel';
    const model = String(map[modelKey] || DEFAULT_MODELS[provider]);

    return { provider, apiKey, model };
  }

  private static async getAnthropicCohortConfig(): Promise<AIConfig | null> {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['anthropicApiKey', 'anthropicModel'],
        },
      },
    });
    const map = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
    const apiKey = String(map.anthropicApiKey || '');

    if (!apiKey) {
      logger.warn('AI cohort reasoning: Anthropic API key missing');
      return null;
    }

    const configuredModel = String(map.anthropicModel || '');
    const model = configuredModel.includes('claude-sonnet-4-5') ? configuredModel : DEFAULT_MODELS.anthropic;

    return { provider: 'anthropic', apiKey, model };
  }

  private static async getClassifierPromptVersion(): Promise<string> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'classifierPromptVersion' },
      select: { value: true },
    });
    return resolveClassifierPromptVersion(typeof setting?.value === 'string' ? setting.value : null);
  }

  private static getProviderErrorStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === 'number' && Number.isFinite(maybeStatus)) return maybeStatus;

    const nestedStatus = (error as { error?: { status?: unknown } }).error?.status;
    if (typeof nestedStatus === 'number' && Number.isFinite(nestedStatus)) return nestedStatus;

    const message = String((error as { message?: unknown }).message || '');
    const matchedStatus = message.match(/\b(429|500|502|503|504|529)\b/);
    return matchedStatus ? Number.parseInt(matchedStatus[1], 10) : null;
  }

  private static isRetryableProviderError(error: unknown): boolean {
    const status = AIService.getProviderErrorStatus(error);
    if (status === 429 || status === 529) return true;
    return typeof status === 'number' && status >= 500;
  }

  private static async waitForRetry(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Унифицированный low-level вызов LLM. Возвращает текст ответа.
   * Поддерживает messages-API (system + user/assistant turns).
   */
  private static async callLLM(
    cfg: AIConfig,
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<string | null> {
    const maxTokens = opts.maxTokens ?? 800;
    const temperature = opts.temperature ?? 0.4;
    const maxAttempts = cfg.provider === 'anthropic' ? 3 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (cfg.provider === 'anthropic') {
          const client = new Anthropic({ apiKey: cfg.apiKey });
          const resp = await client.messages.create({
            model: cfg.model,
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          });
          const block = resp.content.find((b) => b.type === 'text');
          return block && block.type === 'text' ? block.text.trim() : null;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            max_tokens: maxTokens,
            temperature,
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          const apiError = new Error(`OpenAI API ${response.status}: ${errText}`) as Error & { status?: number };
          apiError.status = response.status;
          throw apiError;
        }
        const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content?.trim() || null;
      } catch (err) {
        const retryable = AIService.isRetryableProviderError(err);
        logger.error('AI: LLM call failed', {
          provider: cfg.provider,
          model: cfg.model,
          attempt,
          maxAttempts,
          retryable,
          status: AIService.getProviderErrorStatus(err),
          error: (err as Error).message,
        });

        if (retryable && attempt < maxAttempts) {
          await AIService.waitForRetry(1500 * attempt);
          continue;
        }

        return null;
      }
    }

    return null;
  }

  static async generateCohortReasoning(input: CohortReasoningInput): Promise<{ text: string; model: string } | null> {
    const cfg = await AIService.getAnthropicCohortConfig();
    if (!cfg) return null;

    const systemPrompt = [
      'You write AI Retarget cohort reasoning for SCL Capital campaign operators.',
      'Use Claude Sonnet 4.5 reasoning to produce one or two business-specific sentences.',
      'Do not mention private lead names, phone numbers, or emails.',
      'Be concrete about why this cohort should be prioritized and mention capacity/cooldown only when relevant.',
    ].join(' ');

    const userPrompt = JSON.stringify({
      task: 'Generate concise cohort reasoning for an SMS retarget recommendation.',
      cohort: {
        id: input.cohortId,
        type: input.cohortType,
        title: input.title,
      },
      criteria: input.criteria,
      counts: input.counts,
      capacity: input.capacity,
      fundedHistoryAggregate: input.historicalAnchor,
      anonymizedSampleLeads: input.sampleLeads,
      output: 'One or two sentences. No markdown. No bullets.',
    });

    const raw = await AIService.callLLM(cfg, systemPrompt, [{ role: 'user', content: userPrompt }], {
      maxTokens: 260,
      temperature: 0.2,
    });
    const text = normalizeCohortReasoningText(raw);

    return text ? { text, model: cfg.model } : null;
  }

  // ────────────────────────────────────────────────────────────────
  //  Phase 1 AI Inbox: classifyInbound() — main entry point
  // ────────────────────────────────────────────────────────────────

  /**
   * Системный промпт для classifyInbound. Принимает флаг CA compliance.
   */
  private static async getSystemPrompt(isCA: boolean): Promise<string> {
    const lockedPrompt = await loadLockedPrompt();
    if (lockedPrompt) {
      if (isCA) {
        return `${lockedPrompt}\n\nCA NOTE: Apply California-safe phrasing and do not include APR/rate promises in suggested reply.`;
      }
      return lockedPrompt;
    }

    const caBlock = isCA
      ? `\n\nCA COMPLIANCE MODE: California consumer detected. Do NOT propose discussing APR, interest rates, factor rates, or specific cost-of-capital numbers in suggestions. Redirect any rate question to disclosure docs or licensed advisor only.`
      : '';

    return `You are an AI assistant helping sales reps at SCL Capital, a private lending brokerage.

METHODOLOGY: Gap Selling (Keenan). Every suggestion must reference a gap — the cost of the problem if unfilled.
TONE: Direct, confident, Patrick Bet-David energy. Never soft, never overly formal, never apologetic.
TERMINOLOGY: Never say "application" — always say "Funding Link."
PRODUCTS: MCA, LOC (Line of Credit), SBA, Equipment financing, CRE, Bridge, HELOC, Invoice Factoring. Match the product to what the lead actually describes.
OWNER NOTES: Treat owner/admin/rep notes as first-class context. If notes mention prior fundings, lenders, revenue, objections, or follow-up constraints, use them in classification, signals, and reply suggestions without mentioning internal notes explicitly.
TWILIO-SAFE PHRASING: Never ask "Do you own property?", "Do you own any property?", or "Do you own property with equity?" in a suggested SMS. For HELOC, explain the option and ask for funding amount or preferred next step instead.
EMAIL SHARE RULE: If the latest inbound is an email address or confirms an email request, treat it as buying intent, not hostility, even if the email local-part contains slang or profanity.
REVENUE NORMALIZATION: annual ÷ 12 = monthly. Range → midpoint. Always store both monthly and annual as integers (no $ or commas).
HELOC FLAG RULE: Set helocFitFlag=true only when the lead explicitly fits/asks for HELOC context. Set helocFitFlag=false only when there is explicit mismatch/decline for HELOC. Otherwise set helocFitFlag=null (never default to false).
BEST SUGGESTION LOGIC: HOT + urgency = aggressive close. WARM + evaluating = consultative. Always exactly 2 suggestions: one BEST, one ALT. Never 3.

CLASSIFICATION RULES (apply strictly to the LATEST inbound message):
- HOT — lead shares contact info (email address, alternate phone), explicitly says yes / interested / ready / send it / let's do it, asks for terms/Funding Link/docs/rate/fees/amount, requests a call back, gives revenue numbers, names urgency (today / this week / ASAP / now / 30 days), or selects a term range after financing outreach (example: "10 to 15 years"). ANY ONE of these = HOT. Sharing an email is the #1 buy-signal — always HOT.
- WARM — engaged but exploring: "tell me more", asks general questions without committing, gives partial info. If the latest inbound is a clarification such as "What is that?" immediately after an outbound financing/product message, treat it as HOT because the lead is actively engaging with the offer.
- NURTURE — polite but non-committal: "maybe later", "send info", "not right now but keep in touch".
- DEAD — clear refusal: "no", "not interested", "stop contacting", swearing, hostile.
- WRONG_NUMBER — "wrong number", "who is this", "don't know who you are", "I'm not [name]".${caBlock}

Respond with ONLY a single valid JSON object matching this exact schema (no markdown, no commentary):
{
  "classification": "HOT" | "WARM" | "NURTURE" | "DEAD" | "WRONG_NUMBER",
  "conversationState": "HOT_INBOUND" | "SENSITIVE" | null,
  "isCaliforniaNumber": boolean,
  "leadScore": <integer 0-100>,
  "signals": {
    "revenue": "<short label e.g. $850k/yr or null>",
    "revenueMonthly": <integer or null>,
    "revenueAnnual": <integer or null>,
    "revenueConfidence": "stated" | "inferred" | null,
    "ask": "<short label e.g. $1.06M or null>",
    "product": "MCA" | "LOC" | "SBA" | "CRE" | "EQUIPMENT" | "HELOC" | "BRIDGE" | "FACTORING" | null,
    "industry": "construction" | "trucking" | "restaurant" | "medical" | "retail" | <other lowercase> | null,
    "urgency": "today" | "this week" | "30 days" | "no urgency" | null,
    "objections": "rate sensitive" | "has other offers" | <other short label> | null,
    "helocFitFlag": boolean | null,
    "staleState": "active" | "stale" | "ghosted" | null,
    "suggestedReply": "<single-line best reply>" | null,
    "suggestedFollowupTime": "<ISO timestamp or null>",
    "suggestedFollowupReason": "<short reason or null>",
    "suggestedReengageMessage": "<message or null>",
    "repBehavior": "fast_follow_up" | "standard" | "slow_follow_up" | null
  },
  "suggestions": [
    { "type": "BEST", "text": "<draft reply>", "cta": "<short CTA caption e.g. → SEND FUNDING LINK>" },
    { "type": "ALT",  "text": "<alternative draft>", "cta": "<→ SURFACE THE GAP / → BOOK CALL / etc>" }
  ]
}`;
  }

  /**
   * Локальный детерминированный lead-score (0-100) по спеке Phase 1 PDF.
   * leadScore из LLM игнорируем для предсказуемости — пересчитываем от signals + классификации + recency.
   */
  static computeLeadScore(input: {
    classification: string | null;
    revenueMonthly: number | null;
    askLabel: string | null;
    urgency: string | null;
    lastInboundAt: Date | null;
  }): number {
    let score = 0;

    // Revenue (max 30)
    const rm = input.revenueMonthly;
    if (rm == null) score += 10;
    else if (rm >= 50000) score += 30;
    else if (rm >= 20000) score += 15;
    else score += 0;

    // Ask amount (max 25) — парсим $XYZk / $X.XM из label
    const askNum = AIService.parseMoneyLabel(input.askLabel);
    if (askNum == null) score += 5;
    else if (askNum >= 500000) score += 25;
    else if (askNum >= 250000) score += 20;
    else if (askNum >= 100000) score += 12;
    else if (askNum >= 50000) score += 6;
    else score += 0;

    // Urgency (max 20)
    const u = (input.urgency || '').toLowerCase();
    if (/today|now|asap/.test(u)) score += 20;
    else if (/this week/.test(u)) score += 10;
    else if (/30 days|month/.test(u)) score += 5;

    // Inbound recency (max 15)
    if (input.lastInboundAt) {
      const hours = (Date.now() - input.lastInboundAt.getTime()) / 36e5;
      if (hours < 2) score += 15;
      else if (hours < 24) score += 10;
      else if (hours < 72) score += 5;
    }

    // Classification (max 10)
    const c = input.classification;
    if (c === 'HOT') score += 10;
    else if (c === 'WARM') score += 5;
    else if (c === 'NURTURE') score += 2;

    return Math.max(0, Math.min(100, score));
  }

  private static parseMoneyLabel(label: string | null): number | null {
    if (!label) return null;
    const m = label.match(/\$?\s*([\d.]+)\s*([kKmM])?/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    const suffix = (m[2] || '').toLowerCase();
    if (suffix === 'm') return Math.round(n * 1_000_000);
    if (suffix === 'k') return Math.round(n * 1_000);
    return Math.round(n);
  }

  private static parseMoneyToken(amountRaw: string, suffixRaw?: string | null): number | null {
    const normalized = String(amountRaw || '')
      .replace(/,/g, '')
      .trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const suffix = String(suffixRaw || '')
      .trim()
      .toLowerCase();
    if (suffix === 'm') return Math.round(amount * 1_000_000);
    if (suffix === 'k') return Math.round(amount * 1_000);
    return Math.round(amount);
  }

  private static extractMoneyAmountFromText(text: string): number | null {
    if (!text) return null;
    const pattern = /\$?\s*([\d,.]+)\s*([kKmM])\b|\$\s*([\d,.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        const parsed = AIService.parseMoneyToken(match[1], match[2]);
        if (parsed) return parsed;
      }
      if (match[3]) {
        const parsed = AIService.parseMoneyToken(match[3], '');
        if (parsed && parsed >= 1000) return parsed;
      }
    }
    return null;
  }

  private static formatRevenueLabelFromMonthly(monthly: number): string {
    if (monthly >= 1_000_000) {
      return `$${(monthly / 1_000_000).toFixed(monthly % 1_000_000 === 0 ? 0 : 1)}M/mo`;
    }
    if (monthly >= 1_000) {
      return `$${Math.round(monthly / 1_000)}k/mo`;
    }
    return `$${Math.round(monthly)}/mo`;
  }

  private static formatMoneyCompact(amount: number): string {
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
    }
    if (amount >= 1_000) {
      return `$${Math.round(amount / 1_000)}k`;
    }
    return `$${Math.round(amount)}`;
  }

  private static applyDeterministicMoneySignalFallback(input: {
    latestInboundText: string;
    previousOutboundText: string;
    signals: Record<string, unknown>;
  }): void {
    const inbound = String(input.latestInboundText || '');
    if (!inbound.trim()) return;

    const moneyAmount = AIService.extractMoneyAmountFromText(inbound);
    if (!moneyAmount) return;

    const outbound = String(input.previousOutboundText || '').toLowerCase();
    const inboundLower = inbound.toLowerCase();

    const outboundAsksRevenue =
      /(monthly\s+gross\s+revenue|monthly\s+revenue|gross\s+revenue|revenue\s+per\s+month|what(?:'s| is)\s+your\s+monthly)/i.test(
        outbound,
      );
    const outboundAsksAsk =
      /(how\s+much\s+(?:are\s+you|do\s+you|would\s+you|you)\s+(?:looking|seek|seeking|need|want)|looking\s+to\s+receive|amount\s+are\s+you|what\s+amount)/i.test(
        outbound,
      );
    const inboundHasRevenueCue = /\b(monthly|gross|revenue|sales|per\s*month|\/\s*mo)\b/i.test(inboundLower);
    const inboundHasAskCue =
      /\b(need|looking|seek|seeking|want|amount|funding|capital|line of credit|loc|equipment|inventory|expansion|expense|working capital|receive)\b/i.test(
        inboundLower,
      );

    const hasRevenueSignal =
      typeof input.signals.revenueMonthly === 'number' && Number.isFinite(input.signals.revenueMonthly);
    const hasAskSignal = typeof input.signals.ask === 'string' && String(input.signals.ask || '').trim().length > 0;

    const preferRevenueContext = outboundAsksRevenue || inboundHasRevenueCue;

    if (!hasRevenueSignal && preferRevenueContext) {
      input.signals.revenueMonthly = moneyAmount;
      input.signals.revenueAnnual = moneyAmount * 12;
      if (!input.signals.revenueConfidence) input.signals.revenueConfidence = 'inferred';
      if (!input.signals.revenue) input.signals.revenue = AIService.formatRevenueLabelFromMonthly(moneyAmount);
    }

    const shouldSetAsk =
      !hasAskSignal &&
      ((outboundAsksAsk && moneyAmount > 0) || (!preferRevenueContext && inboundHasAskCue && moneyAmount > 0));
    if (shouldSetAsk) {
      input.signals.ask = AIService.formatMoneyCompact(moneyAmount);
    }
  }

  /**
   * Классифицирует inbound-сообщение и генерирует BEST+ALT предложения ответа.
   * Возвращает структурированный результат + рассчитанный leadScore.
   *
   * @param conversationId — id Conversation, для которой запускаем классификацию
   * @returns AI-результат или null если AI не сконфигурирован / ошибка
   */
  static async classifyInbound(conversationId: string): Promise<{
    classification: string;
    conversationState: string | null;
    isCaliforniaNumber: boolean;
    leadScore: number;
    promptVersion: string;
    signals: Record<string, unknown>;
    suggestions: { type: string; text: string; cta: string }[];
  } | null> {
    const cfg = await this.getConfig();
    if (!cfg) return null;
    const promptVersion = await this.getClassifierPromptVersion();

    // Подгружаем контекст: лид + полный тред сообщений (oldest -> newest) + sticky number area code
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
        stickyNumber: true,
        notes: {
          orderBy: { createdAt: 'asc' },
        },
        deals: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            stage: true,
            stageLabel: true,
            createdAt: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!conv) {
      logger.warn('AI: classifyInbound — conversation not found', { conversationId });
      return null;
    }

    const messagesAsc = conv.messages;
    const inboundMessages = messagesAsc.filter((m) => m.direction === 'INBOUND');
    const lastInbound = inboundMessages[inboundMessages.length - 1] || null;

    const skipReason = getClassificationSkipReason({
      leadStatus: conv.lead?.status,
      leadOptedOut: conv.lead?.optedOut,
      inboundMessagesCount: inboundMessages.length,
    });
    if (skipReason) {
      logger.info('AI: classifyInbound skipped by eligibility guard', {
        conversationId,
        skipReason,
        leadStatus: conv.lead?.status,
        leadOptedOut: conv.lead?.optedOut,
        inboundMessagesCount: inboundMessages.length,
      });
      return null;
    }

    // CA detection по area code lead.phone (best effort)
    const caAreaCodes = new Set([
      '209',
      '213',
      '279',
      '310',
      '323',
      '341',
      '350',
      '408',
      '415',
      '424',
      '442',
      '510',
      '530',
      '559',
      '562',
      '619',
      '626',
      '628',
      '650',
      '657',
      '661',
      '669',
      '707',
      '714',
      '747',
      '760',
      '805',
      '818',
      '820',
      '831',
      '840',
      '858',
      '909',
      '916',
      '925',
      '935',
      '949',
      '951',
    ]);
    const phoneDigits = (conv.lead?.phone || '').replace(/\D/g, '');
    const areaCode = phoneDigits.length >= 10 ? phoneDigits.slice(-10, -7) : '';
    const isCA = caAreaCodes.has(areaCode);

    const systemPrompt = await this.getSystemPrompt(isCA);

    const dealContext = conv.deals
      .map((deal) => `${deal.stageLabel || deal.stage} (${new Date(deal.createdAt).toISOString()})`)
      .join(' | ');
    const notesContext = conv.notes.map((note) => `[NOTE] ${note.body}`);

    const userBlock = [
      `Lead: ${conv.lead?.firstName || ''} ${conv.lead?.lastName || ''}`.trim() || 'Unknown',
      conv.lead?.company ? `Business: ${conv.lead.company}` : null,
      conv.lead?.email ? `Email on file: ${conv.lead.email}` : null,
      conv.lead?.phone ? `Phone: ${conv.lead.phone} (area ${areaCode || 'n/a'})` : null,
      `Owner state: leadStatus=${conv.leadStatus || 'none'}, emailReceived=${conv.emailReceived ? 'yes' : 'no'}, hotLead=${conv.hotLead ? 'yes' : 'no'}, followupTime=${conv.followupTime ? conv.followupTime.toISOString() : conv.nextFollowupAt ? conv.nextFollowupAt.toISOString() : 'none'}, followupStatus=${conv.followupStatus || conv.followupState || 'none'}`,
      dealContext ? `Pipeline context: ${dealContext}` : null,
      '',
      'Conversation history (oldest → newest):',
      ...messagesAsc.map((m) => `[${m.direction}] ${m.body}`),
      ...(notesContext.length > 0 ? ['', 'Owner notes (oldest → newest):', ...notesContext] : []),
      '',
      'Treat owner notes as first-class context. If they mention prior fundings, lenders, revenue, objections, or callback constraints, use that context in classification and suggestions without mentioning internal notes to the lead.',
      'Classify the lead based on the entire conversation and notes. Generate exactly two reply suggestions.',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.callLLM(cfg, systemPrompt, [{ role: 'user', content: userBlock }], {
      maxTokens: 1200,
      temperature: 0.3,
    });
    if (!raw) return null;

    let parsed: any;
    try {
      const extractedJson = extractJsonObjectFromLlmResponse(raw);
      if (!extractedJson) {
        return null;
      }
      parsed = JSON.parse(extractedJson);
    } catch (err) {
      logger.error('AI: classifyInbound JSON parse failed', {
        conversationId,
        snippet: raw.slice(0, 200),
      });
      return null;
    }

    const hasLockedShape =
      parsed &&
      typeof parsed === 'object' &&
      'classification' in parsed &&
      'leadScore' in parsed &&
      'suggestedReply' in parsed;

    if (hasLockedShape) {
      const normalizedLockedPayload = normalizeLockedClassifierPayload(parsed);
      if (normalizedLockedPayload) {
        parsed = normalizedLockedPayload;
      }

      const validation = await validateLockedSchemaShape(parsed);
      if (!validation.ok) {
        logger.warn('AI: locked schema validation drift, continuing with normalized payload', {
          conversationId,
          errors: validation.errors,
        });
      }
    }

    const rawSignals: Record<string, unknown> = hasLockedShape
      ? {
          revenueMonthly: parsed.revenueMonthly,
          revenueAnnual: parsed.revenueAnnual,
          revenueConfidence: parsed.revenueConfidence,
          ask: typeof parsed.amountRequested === 'number' ? AIService.formatMoneyCompact(parsed.amountRequested) : null,
          amountRequested: parsed.amountRequested,
          useOfFunds: parsed.useOfFunds,
          product: parsed.product,
          urgency: parsed.urgency,
          objections: Array.isArray(parsed.objections) ? parsed.objections.join(', ') : parsed.objections,
          staleState: parsed.staleState,
          hadMeaningfulEngagement: parsed.hadMeaningfulEngagement,
          suggestedReply: parsed.suggestedReply,
          suggestedFollowupTime: parsed.suggestedFollowupTime,
          suggestedFollowupReason: parsed.suggestedFollowupReason,
          suggestedReengageMessage: parsed.suggestedReengageMessage,
          repBehavior: parsed.repBehavior,
          coachingNote: parsed.coachingNote,
          reasoning: parsed.reasoning,
        }
      : (((parsed && typeof parsed === 'object' && parsed.signals) || {}) as Record<string, unknown>);
    let classification: string = ['HOT', 'WARM', 'NURTURE', 'DEAD', 'WRONG_NUMBER'].includes(parsed.classification)
      ? parsed.classification
      : 'NURTURE';

    // Детерминированный override: явные buy-signals в последнем входящем → HOT.
    // Защита от случаев, когда LLM недооценивает "контактный" ответ (email, телефон,
    // короткое "yes / send it"). Email-share — самый сильный сигнал интента.
    const lastInboundBody = (lastInbound?.body || '').trim();
    const previousOutboundText = extractPreviousOutboundText(
      messagesAsc.map((message) => ({
        direction: message.direction,
        body: message.body,
      })),
    );

    AIService.applyDeterministicMoneySignalFallback({
      latestInboundText: lastInboundBody,
      previousOutboundText,
      signals: rawSignals,
    });

    if (lastInboundBody) {
      const resolved = resolveDeterministicClassification({
        classification,
        latestInboundText: lastInboundBody,
        previousOutboundText,
        knownEmail: conv.lead?.email || null,
        emailReceived: !!conv.emailReceived,
      });
      if (resolved.classification !== classification) {
        logger.info('AI: classification upgraded to HOT by deterministic override', {
          conversationId,
          original: classification,
          triggers: resolved.triggers,
        });
        classification = resolved.classification;
      }
    }

    // Локальный пересчёт scoring (стабильнее чем доверять LLM)
    const deterministicScore = this.computeLeadScore({
      classification,
      revenueMonthly: typeof rawSignals.revenueMonthly === 'number' ? rawSignals.revenueMonthly : null,
      askLabel: typeof rawSignals.ask === 'string' ? rawSignals.ask : null,
      urgency: typeof rawSignals.urgency === 'string' ? rawSignals.urgency : null,
      lastInboundAt: lastInbound?.createdAt || null,
    });
    const leadScore = hasLockedShape && typeof parsed.leadScore === 'number' ? parsed.leadScore : deterministicScore;

    const parsedSuggestions = hasLockedShape
      ? [
          {
            type: 'BEST',
            text: typeof parsed.suggestedReply === 'string' ? sanitizeAiSuggestionText(parsed.suggestedReply) : '',
            cta: '→ SEND',
          },
          ...(typeof parsed.suggestedReengageMessage === 'string' && parsed.suggestedReengageMessage.trim()
            ? [
                {
                  type: 'ALT',
                  text: sanitizeAiSuggestionText(parsed.suggestedReengageMessage.trim()),
                  cta: '→ RE-ENGAGE',
                },
              ]
            : []),
        ].filter((item) => item.text.trim().length > 0)
      : Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter((s: any) => s && typeof s.text === 'string')
            .slice(0, 2)
            .map((s: any) => ({
              type: s.type === 'BEST' ? 'BEST' : 'ALT',
              text: sanitizeAiSuggestionText(String(s.text)),
              cta: String(s.cta || ''),
            }))
        : [];

    const now = Date.now();
    const lastInboundAtTs = lastInbound?.createdAt ? new Date(lastInbound.createdAt).getTime() : null;
    const silenceDays = lastInboundAtTs ? (now - lastInboundAtTs) / 86_400_000 : 0;
    const staleState =
      silenceDays >= 7 ? 'ghosted' : silenceDays >= 3 ? 'stale' : (rawSignals.staleState as string) || 'active';

    const suggestedReply =
      typeof rawSignals.suggestedReply === 'string' && rawSignals.suggestedReply.trim()
        ? sanitizeAiSuggestionText(rawSignals.suggestedReply.trim())
        : parsedSuggestions[0]?.text || null;

    const followupPlan = buildSuggestedFollowup({
      classification,
      conversationState: parsed.conversationState,
      signals: rawSignals,
      latestInboundText: lastInboundBody,
      now: lastInbound?.createdAt || new Date(now),
    });

    const suggestedFollowupTime = followupPlan.time ? followupPlan.time.toISOString() : null;
    const suggestedFollowupReason = followupPlan.reason;

    const suggestedReengageMessage =
      typeof rawSignals.suggestedReengageMessage === 'string' && rawSignals.suggestedReengageMessage.trim()
        ? sanitizeAiSuggestionText(rawSignals.suggestedReengageMessage.trim())
        : staleState === 'stale' || staleState === 'ghosted'
          ? 'Quick check-in: should I send your Funding Link or circle back next week?'
          : null;

    const signals: Record<string, unknown> = {
      ...rawSignals,
      helocFitFlag:
        typeof rawSignals.helocFitFlag === 'boolean'
          ? rawSignals.helocFitFlag
          : String(rawSignals.product || '').toUpperCase() === 'HELOC'
            ? true
            : null,
      staleState,
      suggestedReply,
      suggestedFollowupTime,
      suggestedFollowupReason,
      suggestedFollowupStatus: followupPlan.status,
      suggestedReengageMessage,
      repBehavior:
        typeof rawSignals.repBehavior === 'string' && rawSignals.repBehavior.trim()
          ? rawSignals.repBehavior.trim()
          : 'standard',
    };

    const messageTextContext = messagesAsc.map((message) => ({
      direction: message.direction,
      body: message.body,
    }));
    const derivedCreditProfile =
      typeof rawSignals.creditProfile === 'string' && rawSignals.creditProfile.trim()
        ? rawSignals.creditProfile.trim()
        : extractConversationCreditProfile(messageTextContext);
    const derivedPropertyOwnership =
      typeof rawSignals.propertyOwnership === 'string' && rawSignals.propertyOwnership.trim()
        ? rawSignals.propertyOwnership.trim()
        : extractConversationPropertyOwnership(messageTextContext);

    if (derivedCreditProfile) {
      signals.creditProfile = derivedCreditProfile;
    }
    if (derivedPropertyOwnership) {
      signals.propertyOwnership = derivedPropertyOwnership;
    }

    let suggestions = resolveAiSuggestions({
      suggestions: parsedSuggestions,
      classification,
      signals,
      messages: messageTextContext,
      notes: conv.notes.map((note) => note.body),
      knownEmail: conv.lead?.email || null,
      emailReceived: !!conv.emailReceived,
    });

    if (suggestions[0]?.text) {
      signals.suggestedReply = suggestions[0].text;
    }
    if (suggestions[1]?.text) {
      signals.suggestedReengageMessage = suggestions[1].text;
    }

    const finalPreviousOutboundText = extractPreviousOutboundText(messageTextContext);
    const finalSuggestedReplyText = String(signals.suggestedReply || '');
    const finalLatestInboundLower = lastInboundBody.toLowerCase();
    const finalRecentInboundContextText = extractRecentInboundContextText(messageTextContext);
    const finalRecentInboundLower = finalRecentInboundContextText.toLowerCase();
    const hasAmountDisclosureContext =
      extractAmountDisclosureFromContext(lastInboundBody, finalPreviousOutboundText) != null;
    const hasSendTermsIntentContext = hasSendTermsIntent(finalLatestInboundLower);
    const hasKnownEmailForSendTerms = !!(
      extractConversationEmail(messageTextContext) ||
      extractEmailAddress(conv.lead?.email || '') ||
      conv.emailReceived
    );
    const shouldForceCurrentTopicReply =
      (hasAmountDisclosureContext && suggestionLooksStaleForAmountDisclosure(finalSuggestedReplyText)) ||
      (hasPaymentTermsContext(finalLatestInboundLower) &&
        suggestionLooksStaleForPaymentTerms(finalSuggestedReplyText)) ||
      (hasSendTermsIntentContext &&
        suggestionLooksStaleForSendTermsIntent(finalSuggestedReplyText, hasKnownEmailForSendTerms)) ||
      (hasPhoneCallLogisticsContext(
        finalLatestInboundLower,
        finalPreviousOutboundText.toLowerCase(),
        finalRecentInboundLower,
      ) &&
        suggestionLooksStaleForPhoneCallLogistics(finalSuggestedReplyText)) ||
      (hasCreditScoreContext(finalLatestInboundLower, finalPreviousOutboundText.toLowerCase()) &&
        suggestionLooksStaleForCreditScore(finalSuggestedReplyText));

    if (shouldForceCurrentTopicReply) {
      const forcedReplyText = sanitizeAiSuggestionText(
        buildDeterministicFallbackSuggestionText({
          classification,
          latestInboundText: lastInboundBody,
          recentInboundContextText: finalRecentInboundContextText,
          previousOutboundText: finalPreviousOutboundText,
          sharedEmail: extractConversationEmail(messageTextContext),
          noteBodies: conv.notes.map((note) => note.body),
          knownEmail: conv.lead?.email || null,
          emailReceived: !!conv.emailReceived,
          productContext: extractConversationProductContext(messageTextContext),
        }),
      );

      if (forcedReplyText) {
        signals.suggestedReply = forcedReplyText;
        const remainingSuggestions = suggestions.filter(
          (suggestion) => suggestion.text.toLowerCase() !== forcedReplyText.toLowerCase(),
        );
        suggestions = [
          {
            type: suggestions[0]?.type || 'BEST',
            text: forcedReplyText,
            cta: suggestions[0]?.cta || '→ SEND',
          },
          ...remainingSuggestions.slice(1),
        ].slice(0, 2);
      }
    }

    logger.info('AI: classifyInbound complete', {
      conversationId,
      provider: cfg.provider,
      model: cfg.model,
      promptVersion,
      classification,
      leadScore,
      isCA,
    });

    return {
      classification,
      conversationState:
        parsed.conversationState === 'HOT_INBOUND' || parsed.conversationState === 'SENSITIVE'
          ? parsed.conversationState
          : null,
      isCaliforniaNumber: isCA,
      leadScore,
      promptVersion,
      signals,
      suggestions,
    };
  }

  // ────────────────────────────────────────────────────────────────
  //  Legacy helpers (через провайдер-агностичный callLLM)
  // ────────────────────────────────────────────────────────────────

  /**
   * Generate a draft reply for a conversation.
   * Returns the draft text or null if AI is not configured.
   */
  static async generateDraftReply(
    conversationHistory: { direction: string; body: string }[],
    leadInfo: { firstName?: string; lastName?: string; status?: string },
  ): Promise<string | null> {
    const cfg = await this.getConfig();
    if (!cfg) return null;

    const systemPrompt = `You are an SMS assistant for a business lending company called SCL Capital.
You draft professional, concise SMS replies. Keep messages under 160 characters when possible.
Be friendly but professional. Never make promises about approval or specific terms.
The lead's name is ${leadInfo.firstName || 'Unknown'} ${leadInfo.lastName || ''}.
Lead status: ${leadInfo.status || 'Unknown'}.`;

    const messages = [
      ...conversationHistory.map((m) => ({
        role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.body,
      })),
      { role: 'user' as const, content: 'Draft a reply to the last message.' },
    ];

    const draft = await this.callLLM(cfg, systemPrompt, messages, {
      maxTokens: 200,
      temperature: 0.7,
    });
    if (draft) {
      logger.info('AI: Draft reply generated', { provider: cfg.provider, length: draft.length });
    }
    return draft;
  }

  /**
   * Classify an inbound message intent.
   * Returns one of: interested, not_interested, question, follow_up, complaint, other
   */
  static async classifyMessage(body: string): Promise<string | null> {
    const cfg = await this.getConfig();
    if (!cfg) return null;

    const systemPrompt = `Classify this SMS reply into one of these categories: interested, not_interested, question, follow_up, complaint, other. Reply with ONLY the category name, nothing else.`;

    const out = await this.callLLM(cfg, systemPrompt, [{ role: 'user', content: body }], {
      maxTokens: 20,
      temperature: 0,
    });
    const category = out?.toLowerCase().trim() || null;
    if (category) logger.info('AI: Message classified', { category, provider: cfg.provider });
    return category;
  }

  /**
   * Score a lead based on conversation history and profile data.
   * Returns a numeric score from 0-100.
   */
  static async scoreLead(
    leadInfo: { firstName?: string; status?: string; source?: string; createdAt?: Date },
    messageCount: number,
    repliedCount: number,
  ): Promise<number | null> {
    const cfg = await this.getConfig();
    if (!cfg) return null;

    const prompt = `Score this business lending lead from 0-100 based on likelihood to convert.
Lead: ${leadInfo.firstName || 'Unknown'}, Status: ${leadInfo.status}, Source: ${leadInfo.source || 'unknown'}
Created: ${leadInfo.createdAt ? new Date(leadInfo.createdAt).toISOString().split('T')[0] : 'unknown'}
Messages sent: ${messageCount}, Replies received: ${repliedCount}
Reply with ONLY a number 0-100.`;

    const out = await this.callLLM(cfg, 'You are a lending lead scoring engine.', [{ role: 'user', content: prompt }], {
      maxTokens: 10,
      temperature: 0,
    });
    const score = out ? parseInt(out, 10) : NaN;
    return isNaN(score) ? null : Math.max(0, Math.min(100, score));
  }
}
