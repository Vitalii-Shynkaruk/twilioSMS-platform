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
}

export function resolveDeterministicClassification(input: DeterministicClassificationInput): {
  classification: string;
  triggers: Record<string, boolean>;
} {
  const originalClassification = input.classification;
  if (originalClassification === 'DEAD' || originalClassification === 'WRONG_NUMBER') {
    return { classification: originalClassification, triggers: {} };
  }

  const latestInboundText = String(input.latestInboundText || '').trim();
  const lower = latestInboundText.toLowerCase();
  if (!lower) return { classification: originalClassification, triggers: {} };

  const previousOutboundText = String(input.previousOutboundText || '').toLowerCase();
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(latestInboundText);
  const strongYes =
    /^(yes|yeah|yep|yup|sure|ok(ay)?|sounds good|i('?m| am)? in|let'?s (do it|go)|send (it|the)?|i'?m interested|interested|please send|send me|go ahead)\b/.test(
      lower,
    );
  const asksRealBuyingQuestion =
    /(what are your rates|what('?s| is) the rate|what are the terms|what('?s| is) the term|how much can i get|how much would i qualify|how much would we qualify|how soon can you fund|when can i have it|how does this work|how would this work|what do you need|what do i need|what docs do you need|what paperwork do you need|what are the requirements|what is heloc|what is loc)/.test(
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
  const givesUrgency =
    /\b(today|asap|right now|this week|tomorrow|by (monday|tuesday|wednesday|thursday|friday)|need (it )?(now|soon))\b/.test(
      lower,
    );
  const sharesAltPhone = /(?:^|\D)(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?:\D|$)/.test(latestInboundText);
  const affirmativeWithContext =
    strongYes &&
    (asksRealBuyingQuestion ||
      mentionsRevenue ||
      mentionsSpecificAmount ||
      statesUseOfFunds ||
      providesQualificationData);
  const contactInfoWithContext =
    hasEmail &&
    (asksRealBuyingQuestion ||
      mentionsRevenue ||
      mentionsSpecificAmount ||
      statesUseOfFunds ||
      providesQualificationData);

  const triggers = {
    hasEmail,
    strongYes,
    asksRealBuyingQuestion,
    mentionsRevenue,
    mentionsSpecificAmount,
    statesUseOfFunds,
    providesQualificationData,
    contextualClarifyingQuestion,
    givesUrgency,
    sharesAltPhone,
    affirmativeWithContext,
    contactInfoWithContext,
  };

  const hasSubstantiveHotSignal =
    asksRealBuyingQuestion ||
    mentionsRevenue ||
    mentionsSpecificAmount ||
    statesUseOfFunds ||
    providesQualificationData ||
    contextualClarifyingQuestion ||
    givesUrgency ||
    affirmativeWithContext ||
    contactInfoWithContext;

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

function extractPreviousOutboundText(messages: SuggestionResolutionMessage[]): string {
  let latestInboundIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (String(messages[index].direction || '').toUpperCase() === 'INBOUND') {
      latestInboundIndex = index;
      break;
    }
  }

  if (latestInboundIndex > 0) {
    for (let index = latestInboundIndex - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (String(message.direction || '').toUpperCase() !== 'OUTBOUND') continue;
      const body = String(message.body || '').trim();
      if (body) return body;
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
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

function buildDeterministicFallbackSuggestionText(input: {
  classification?: string | null;
  latestInboundText?: string;
  previousOutboundText?: string;
  sharedEmail?: string | null;
}): string {
  const classification = String(input.classification || '').toUpperCase();
  const latestInboundText = String(input.latestInboundText || '').trim();
  const latestInboundLower = latestInboundText.toLowerCase();
  const previousOutboundLower = String(input.previousOutboundText || '').toLowerCase();
  const sharedEmail = extractEmailAddress(latestInboundText) || String(input.sharedEmail || '').trim() || null;

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

  if (/what('?s| is) (that|this|it)|how does it work|what do you mean|can you explain/i.test(latestInboundLower)) {
    return 'It is a longer-term funding option meant to relieve short-term cash-flow pressure, not pile on the wrong payment. What are you trying to solve right now, and about how much would actually fix it?';
  }

  if (/predatory|another mca|stacked mca|daily pay|weekly pay/.test(latestInboundLower)) {
    return 'Fair concern. The goal is not to stack another daily-payback MCA. It is to replace short-term pressure with a structure the business can actually carry. What balance or cash-flow problem are you trying to solve, and about how much would fix it?';
  }

  if (/rate|rates|term|terms|payment|cost/.test(latestInboundLower)) {
    return 'Fair question. Rate depends on credit and collateral, but the bigger issue is what problem the capital needs to solve so we size the right option. Are you trying to clear expensive debt, cover working capital, or fund growth?';
  }

  if (/statement|bank statement/i.test(latestInboundLower) || /statement|bank statement/i.test(previousOutboundLower)) {
    return 'Send the statements when you have them and I will review them right away. I want to see where the cash-flow squeeze is coming from so we match the right structure instead of layering on the wrong payment.';
  }

  if (sharedEmail) {
    return 'Perfect, I have your email. I will send the terms there now. While you review them, what problem are you trying to solve in the business, and about how much capital would actually fix it?';
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
  previousOutboundText?: string;
  sharedEmail?: string | null;
}): ResolvedAISuggestion[] {
  const latestInboundLower = String(input.latestInboundText || '').toLowerCase();
  const sharedEmail = String(input.sharedEmail || '').trim();
  const needsContextualRepair =
    !!sharedEmail ||
    /predatory|another mca|stacked mca|daily pay|weekly pay|rate|rates|term|terms|payment|cost|hard pull|credit pull|wrong number|my personal cell|did not give you this number|remove (me|this number|it) from (your )?(list|system)|what('?s| is) (that|this|it)|how does this work|what('?s| is)(?: a)? (heloc|loc|line of credit|home equity line of credit)|explain (?:a )?(heloc|loc|line of credit)|tell me about (?:a )?(heloc|loc|line of credit)/.test(
      latestInboundLower,
    );
  if (!needsContextualRepair) return input.suggestions;

  const repairedBestText = sanitizeAiSuggestionText(
    buildDeterministicFallbackSuggestionText({
      classification: input.classification,
      latestInboundText: input.latestInboundText,
      previousOutboundText: input.previousOutboundText,
      sharedEmail,
    }),
  );
  if (!repairedBestText) return input.suggestions;

  let changed = false;
  const repaired = input.suggestions.map((suggestion) => {
    const shouldRepairSuggestion =
      suggestionRequestsEmail(suggestion.text) ||
      (needsContextualRepair && suggestionLooksGenericFallback(suggestion.text));
    if (!shouldRepairSuggestion) return suggestion;
    changed = true;
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
}): ResolvedAISuggestion[] {
  const chronologicalMessages = Array.isArray(input.messages) ? input.messages : [];
  const latestInboundText = extractLatestInboundText(chronologicalMessages);
  const previousOutboundText = extractPreviousOutboundText(chronologicalMessages);
  const sharedEmail = extractConversationEmail(chronologicalMessages);

  const directSuggestions = repairSuggestionsForInboundContext({
    suggestions: normalizeAiSuggestions(input.suggestions),
    classification: input.classification,
    latestInboundText,
    previousOutboundText,
    sharedEmail,
  });
  if (directSuggestions.length > 0) return directSuggestions;

  const preservedSuggestions = repairSuggestionsForInboundContext({
    suggestions: normalizeAiSuggestions(input.fallbackSuggestions),
    classification: input.classification,
    latestInboundText,
    previousOutboundText,
    sharedEmail,
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
    previousOutboundText,
    sharedEmail,
  });
  if (signalSuggestions.length > 0) return signalSuggestions;

  const bestText = sanitizeAiSuggestionText(
    buildDeterministicFallbackSuggestionText({
      classification: input.classification,
      latestInboundText,
      previousOutboundText,
      sharedEmail,
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

  private static async getClassifierPromptVersion(): Promise<string> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'classifierPromptVersion' },
      select: { value: true },
    });
    return resolveClassifierPromptVersion(typeof setting?.value === 'string' ? setting.value : null);
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

      // OpenAI fallback
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
        const err = await response.text();
        logger.error('AI: OpenAI API error', { status: response.status, error: err });
        return null;
      }
      const data: any = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      logger.error('AI: LLM call failed', {
        provider: cfg.provider,
        model: cfg.model,
        error: (err as Error).message,
      });
      return null;
    }
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
TWILIO-SAFE PHRASING: Never ask "Do you own property?", "Do you own any property?", or "Do you own property with equity?" in a suggested SMS. For HELOC, explain the option and ask for funding amount or preferred next step instead.
REVENUE NORMALIZATION: annual ÷ 12 = monthly. Range → midpoint. Always store both monthly and annual as integers (no $ or commas).
BEST SUGGESTION LOGIC: HOT + urgency = aggressive close. WARM + evaluating = consultative. Always exactly 2 suggestions: one BEST, one ALT. Never 3.

CLASSIFICATION RULES (apply strictly to the LATEST inbound message):
- HOT — lead shares contact info (email address, alternate phone), explicitly says yes / interested / ready / send it / let's do it, asks for terms/Funding Link/docs/rate/amount, requests a call back, gives revenue numbers, names urgency (today / this week / ASAP / now / 30 days). ANY ONE of these = HOT. Sharing an email is the #1 buy-signal — always HOT.
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
      conv.lead?.phone ? `Phone: ${conv.lead.phone} (area ${areaCode || 'n/a'})` : null,
      `Owner state: leadStatus=${conv.leadStatus || 'none'}, emailReceived=${conv.emailReceived ? 'yes' : 'no'}, hotLead=${conv.hotLead ? 'yes' : 'no'}, followupTime=${conv.followupTime ? conv.followupTime.toISOString() : conv.nextFollowupAt ? conv.nextFollowupAt.toISOString() : 'none'}, followupStatus=${conv.followupStatus || conv.followupState || 'none'}`,
      dealContext ? `Pipeline context: ${dealContext}` : null,
      '',
      'Conversation history (oldest → newest):',
      ...messagesAsc.map((m) => `[${m.direction}] ${m.body}`),
      ...(notesContext.length > 0 ? ['', 'Owner notes (oldest → newest):', ...notesContext] : []),
      '',
      'Classify the lead based on the entire conversation. Generate exactly two reply suggestions.',
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
          ask: typeof parsed.amountRequested === 'number' ? `$${parsed.amountRequested}` : null,
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
    if (lastInboundBody) {
      const previousOutbound = [...messagesAsc].reverse().find((message) => message.direction === 'OUTBOUND');
      const resolved = resolveDeterministicClassification({
        classification,
        latestInboundText: lastInboundBody,
        previousOutboundText: previousOutbound?.body || null,
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
      now: new Date(now),
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
          : String(rawSignals.product || '').toUpperCase() === 'HELOC',
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

    const suggestions = resolveAiSuggestions({
      suggestions: parsedSuggestions,
      classification,
      signals,
      messages: messagesAsc.map((message) => ({
        direction: message.direction,
        body: message.body,
      })),
    });

    if (!hasSuggestionText(signals.suggestedReply) && suggestions[0]?.text) {
      signals.suggestedReply = suggestions[0].text;
    }
    if (!hasSuggestionText(signals.suggestedReengageMessage) && suggestions[1]?.text) {
      signals.suggestedReengageMessage = suggestions[1].text;
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
