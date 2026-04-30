import { describe, expect, it } from 'vitest';
import {
  extractConversationEmail,
  extractJsonObjectFromLlmResponse,
  normalizeLockedClassifierPayload,
  resolveAiSuggestions,
  resolveDeterministicClassification,
  sanitizeAiSuggestionText,
} from '../src/services/aiService';

describe('AI suggestion policy', () => {
  it('должна повышать "What is that?" до HOT после продуктового outreach', () => {
    const result = resolveDeterministicClassification({
      classification: 'WARM',
      latestInboundText: 'What is that?',
      previousOutboundText: 'HELOC = Home Equity Line of Credit. I can get one done in 5-7 days. Interested?',
    });

    expect(result.classification).toBe('HOT');
    expect(result.triggers.contextualClarifyingQuestion).toBe(true);
  });

  it('не должна менять DEAD или WRONG_NUMBER классификацию', () => {
    const result = resolveDeterministicClassification({
      classification: 'WRONG_NUMBER',
      latestInboundText: 'Who is this?',
      previousOutboundText: 'I can send the Funding Link.',
    });

    expect(result.classification).toBe('WRONG_NUMBER');
  });

  it('не должна повышать bare email до HOT по locked v4 handoff', () => {
    const result = resolveDeterministicClassification({
      classification: 'WARM',
      latestInboundText: 'jay@seamoc.com',
      previousOutboundText: 'Best email to send details?',
    });

    expect(result.classification).toBe('WARM');
    expect(result.triggers.hasEmail).toBe(true);
    expect(result.triggers.contactInfoWithContext).toBe(false);
  });

  it('должна убирать Twilio-risky вопрос про владение property из suggested SMS', () => {
    const sanitized = sanitizeAiSuggestionText('HELOC = Home Equity Line of Credit. Do you own property with equity?');

    expect(sanitized).not.toMatch(/do you own .*property/i);
    expect(sanitized).toContain('HELOC = Home Equity Line of Credit.');
    expect(sanitized).toContain('What amount are you looking for?');
  });

  it('должна строить fallback suggestion, если классификация есть, а AI suggestions пустые', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages: [
        { direction: 'OUTBOUND', body: 'Got it, if you have the statements on your phone you can forward them.' },
        { direction: 'INBOUND', body: 'I will work on that when will you do a hard pull of credit?' },
        { direction: 'OUTBOUND', body: 'No hard credit pull!' },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/no hard pull/i);
  });

  it('должна возвращать generic fallback для WARM conversation без готовых AI reply', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'WARM',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages: [],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/main bottleneck|move the needle/i);
  });

  it('должна строить objection-aware fallback вместо generic sales ответа', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: null,
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: "Hey, it's Marcos from SecureCreditLines. Would longer term credit options help the business? Perhaps 10-25yrs? Best email to send details?",
        },
        { direction: 'INBOUND', body: "As long as it's not another predatory MCA" },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/daily-payback mca|short-term pressure|cash-flow problem/i);
    expect(suggestions[0].text).not.toMatch(/thanks for the update/i);
  });

  it('должна распознавать входящий email и не спрашивать email повторно', () => {
    const messages = [
      { direction: 'OUTBOUND', body: "Hey, it's Marcos from SecureCreditLines. Best email to send details?" },
      { direction: 'INBOUND', body: 'jay@seamoc.com' },
    ];

    expect(extractConversationEmail(messages)).toBe('jay@seamoc.com');

    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/i have your email/i);
    expect(suggestions[0].text).not.toMatch(/best email/i);
  });

  it('должна распознавать короткий inbound email reply, если вместо @ пришёл знак вопроса', () => {
    const messages = [
      { direction: 'OUTBOUND', body: 'best email?' },
      { direction: 'INBOUND', body: 'Billprichard07?gmail.com' },
    ];

    expect(extractConversationEmail(messages)).toBe('Billprichard07@gmail.com');

    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/i have your email|sending (?:the )?(?:funding link|terms)/i);
    expect(suggestions[0].text).not.toMatch(/best email/i);
  });

  it('должна чинить сохраненную AI suggestion, если email уже есть в истории треда', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Absolutely. What is the best email to send the terms to? Once I have it, I will send the next steps.',
          cta: '→ SEND',
        },
      ],
      classification: 'HOT',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: "Hey, it's Marcos from SecureCreditLines. Would longer term credit options help the business? Best email to send details?",
        },
        { direction: 'INBOUND', body: 'Jay@seamoc.com' },
        { direction: 'INBOUND', body: 'Received ' },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/i have your email/i);
    expect(suggestions[0].text).not.toMatch(/what is the best email/i);
  });

  it('должна чинить сохраненную generic suggestion, если inbound содержит objection по MCA', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Thanks for the update. What amount are you looking for, and what would you use the capital for?',
          cta: '→ SEND',
        },
      ],
      classification: null,
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: "Hey, it's Marcos from SecureCreditLines. Would longer term credit options help the business? Perhaps 10-25yrs? Best email to send details?",
        },
        { direction: 'INBOUND', body: "As long as it's not another predatory MCA" },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/daily-payback mca|short-term pressure|cash-flow problem/i);
    expect(suggestions[0].text).not.toMatch(/thanks for the update/i);
  });

  it('должна объяснять HELOC и чинить stale email-style suggestion после продуктового вопроса', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Absolutely. What is the best email to send the terms to? Once I have it, I can send the next steps.',
          cta: '→ SEND',
        },
      ],
      classification: 'HOT',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Andrea, if you have been considering a HELOC, I can get one done in 5-7 days. Interested?',
        },
        {
          direction: 'INBOUND',
          body: 'What is a HELOC?',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/home equity line of credit/i);
    expect(suggestions[0].text).not.toMatch(/best email/i);
  });

  it('должна извлекать JSON из LLM ответа даже если после fenced block есть хвост с reply options', () => {
    const raw = `\`\`\`json
{
  "classification": "HOT",
  "leadScore": 72,
  "suggestedReply": "Got it, your monthly revenue is $30k.",
  "suggestedReengageMessage": null
}
\`\`\`

**Reply Option 1:**
"Got it, your monthly revenue is $30k."`;

    expect(extractJsonObjectFromLlmResponse(raw)).toBe(`{
  "classification": "HOT",
  "leadScore": 72,
  "suggestedReply": "Got it, your monthly revenue is $30k.",
  "suggestedReengageMessage": null
}`);
  });

  it('должна нормализовать near-valid locked payload вместо null на schema drift', () => {
    const normalized = normalizeLockedClassifierPayload({
      classification: 'HOT',
      leadScore: 81,
      revenueMonthly: 30000,
      revenueAnnual: null,
      revenueConfidence: 'high',
      amountRequested: null,
      useOfFunds: null,
      inferredProduct: 'Line of Credit',
      objections: ['low fico'],
      suggestedReply: 'Got it, your monthly revenue is $30k.',
      suggestedFollowupTime: null,
      suggestedFollowupReason: null,
      staleState: null,
      hadMeaningfulEngagement: true,
      suggestedReengageMessage: null,
      repBehavior: 'concerning',
      coachingNote: '',
      reasoning: 'Lead gave revenue but has credit issues.',
    });

    expect(normalized).toMatchObject({
      classification: 'HOT',
      product: 'LOC',
      urgency: 'medium',
      revenueMonthly: 30000,
      suggestedReply: 'Got it, your monthly revenue is $30k.',
    });
    expect(normalized).not.toHaveProperty('inferredProduct');
  });
});
