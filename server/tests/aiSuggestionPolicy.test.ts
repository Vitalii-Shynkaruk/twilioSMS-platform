import { describe, expect, it } from 'vitest';
import { resolveDeterministicClassification, sanitizeAiSuggestionText } from '../src/services/aiService';

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
});
