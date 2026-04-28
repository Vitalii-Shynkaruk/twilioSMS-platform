import { describe, expect, it } from 'vitest';
import {
  extractConversationEmail,
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
    expect(suggestions[0].text).toMatch(/what amount are you looking for/i);
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
});
