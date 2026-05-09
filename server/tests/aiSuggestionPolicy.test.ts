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

  it('должна повышать email reply до HOT, если rep запросил email в прошлом outbound', () => {
    const result = resolveDeterministicClassification({
      classification: 'WARM',
      latestInboundText: 'jay@seamoc.com',
      previousOutboundText: 'Best email to send details?',
    });

    expect(result.classification).toBe('HOT');
    expect(result.triggers.hasEmail).toBe(true);
    expect(result.triggers.contactInfoWithContext).toBe(true);
  });

  it('должна повышать короткое "yes" до HOT, если перед этим был продуктовый outreach', () => {
    const result = resolveDeterministicClassification({
      classification: 'WARM',
      latestInboundText: 'Yes',
      previousOutboundText: "I'm waiving all fees this week. Do you want updated terms?",
    });

    expect(result.classification).toBe('HOT');
    expect(result.triggers.strongYes).toBe(true);
    expect(result.triggers.strongYesWithProductContext).toBe(true);
  });

  it.each(['Yes.', 'YES!!!', 'yep'])(
    'должна повышать короткое подтверждение "%s" до HOT, если перед этим был продуктовый outreach',
    (reply) => {
      const result = resolveDeterministicClassification({
        classification: 'WARM',
        latestInboundText: reply,
        previousOutboundText: "I'm waiving all fees this week. Do you want updated terms?",
      });

      expect(result.classification).toBe('HOT');
      expect(result.triggers.strongYes).toBe(true);
      expect(result.triggers.strongYesWithProductContext).toBe(true);
    },
  );

  it('не должна повышать изолированное "yes" до HOT без продуктового контекста и без дополнительных сигналов', () => {
    const result = resolveDeterministicClassification({
      classification: 'WARM',
      latestInboundText: 'yes',
      previousOutboundText: 'Checking in.',
    });

    expect(result.classification).toBe('WARM');
    expect(result.triggers.strongYes).toBe(true);
    expect(result.triggers.strongYesWithProductContext).toBe(false);
  });

  it('должна переопределять ошибочный DEAD в HOT, если inbound это email на прямой email request', () => {
    const result = resolveDeterministicClassification({
      classification: 'DEAD',
      latestInboundText: 'kissmyass@gmail.com',
      previousOutboundText: 'Could a flexible 10yr agreement be what your business needs? Best email to send terms?',
    });

    expect(result.classification).toBe('HOT');
    expect(result.triggers.hasEmail).toBe(true);
    expect(result.triggers.contactInfoWithContext).toBe(true);
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

  it('должна распознавать email с пробелами вокруг @ и точки', () => {
    const messages = [
      { direction: 'OUTBOUND', body: 'best email?' },
      { direction: 'INBOUND', body: 'pelucavenice @ gmail . com' },
    ];

    expect(extractConversationEmail(messages)).toBe('pelucavenice@gmail.com');
  });

  it('должна выбирать самый свежий inbound email из истории треда', () => {
    const messages = [
      { direction: 'OUTBOUND', body: 'Best email to send terms?' },
      { direction: 'INBOUND', body: 'old-owner@example.com' },
      { direction: 'OUTBOUND', body: 'Could you send the best email for this file?' },
      { direction: 'INBOUND', body: 'Use new-owner@example.com instead' },
    ];

    expect(extractConversationEmail(messages)).toBe('new-owner@example.com');
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

  it('должна повышать выбор срока до HOT после term-based outreach', () => {
    const result = resolveDeterministicClassification({
      classification: 'WARM',
      latestInboundText: '10 to 15 years',
      previousOutboundText:
        "Hey, it's Marcos from SecureCreditLines. Would longer term credit options help the business? Perhaps 10-25yrs? Best email to send details?",
    });

    expect(result.classification).toBe('HOT');
  });

  it('должна чинить suggestion для вопроса про fees вместо generic fallback', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Good Morning this is Jonathan with SecureCreditLines. Can the business benefit from 10/30yr credit options?',
        },
        {
          direction: 'INBOUND',
          body: 'What are the fees?',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/fees depend|cleanest quote|how much you need/i);
    expect(suggestions[0].text).not.toMatch(/thanks for the update/i);
  });

  it('должна чинить stale funding-link suggestion, если lead спрашивает про early payoff penalty', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'I sent a breakdown for $100k and docs needed to proceed. Can you confirm receipt?',
        },
        {
          direction: 'INBOUND',
          body: 'Is there an early payoff penalty?',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/no early payoff penalty|pay down early without a fee|payoff terms/i);
    expect(suggestions[0].text).not.toMatch(/funding link|what problem are you trying to solve/i);
  });

  it('должна чинить stale funding-link suggestion, если lead прислал "call now" и номер отдельным inbound', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Could a flexible 10yr agreement be what your business needs? Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'Can we do a call now?',
        },
        {
          direction: 'INBOUND',
          body: 'Mike 7046047009',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/call now|call right away|on that number/i);
    expect(suggestions[0].text).not.toMatch(/funding link|what problem are you trying to solve/i);
  });

  it('должна при явном intent "send terms" отдавать funding-link suggestion, а не rate/payment branch', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Fair question. Rate depends on credit and collateral...',
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
          body: 'Could a flexible 10yr agreement be what your business needs? Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'Please send terms to jay@seamoc.com',
        },
      ],
      knownEmail: 'jay@seamoc.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/sending (?:the )?funding link|i have your email/i);
    expect(suggestions[0].text).not.toMatch(/rate depends|payment pressure|fund growth/i);
  });

  it('должна при "send terms" без email просить email, а не уходить в rate/payment branch', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Could a flexible 10yr agreement be what your business needs?',
        },
        {
          direction: 'INBOUND',
          body: 'please send terms',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/best email|send terms right away/i);
    expect(suggestions[0].text).not.toMatch(/rate depends|payment pressure|fund growth/i);
  });

  it('должна чинить stale email/funding suggestion, если текущий inbound спрашивает про payments/rate/years', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Great, I have your email. I am sending the Funding Link now. Once you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Could a flexible 10/30yr agreement be what your business needs? Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'yes depends on monthly payments and % interest rate and how many years. i like very low monthly payments',
        },
      ],
      knownEmail: 'drmark@ptd.net',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/rate depends|payment|term|debt|working capital|fund growth/i);
    expect(suggestions[0].text).not.toMatch(/funding link|i have your email|what problem are you trying to solve/i);
  });

  it('должна чинить stale suggestion, если lead уже дал сумму после прямого вопроса про amount', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Yes! How much are you looking to receive for the business?',
        },
        {
          direction: 'INBOUND',
          body: '75k',
        },
      ],
      knownEmail: 'owner@example.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/\$75k/i);
    expect(suggestions[0].text).toMatch(/working capital|equipment|paying down debt/i);
    expect(suggestions[0].text).not.toMatch(
      /about how much capital would actually fix it|what problem are you trying/i,
    );
  });

  it('должна чинить stale funding-link suggestion, если lead уже дал monthly revenue', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
          cta: '→ SEND',
        },
      ],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        revenueMonthly: 80000,
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Thanks Michael! Just sent the 10/30yr terms to mccallducati@gmail.com. Quick question - what is your monthly revenue and what would you use the funds for?',
        },
        {
          direction: 'INBOUND',
          body: '70 to 80 k Mr month',
        },
      ],
      knownEmail: 'mccallducati@gmail.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/\$80k\/mo|monthly revenue/i);
    expect(suggestions[0].text).toMatch(/what would you use|how much capital/i);
    expect(suggestions[0].text).not.toMatch(/funding link|i have your email|while you review/i);
  });

  it('должна в amount-context просить email, если email ещё не известен, но не повторять вопрос про сумму', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Got it. How much are you looking to receive for the business?',
        },
        {
          direction: 'INBOUND',
          body: '$100k',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/\$100k/i);
    expect(suggestions[0].text).toMatch(/best email to send options/i);
    expect(suggestions[0].text).not.toMatch(/about how much capital would actually fix it|how much capital/i);
  });

  it('должна чинить stale email/funding suggestion, если текущий inbound про credit score objection', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Could a flexible 10/30yr agreement be what your business needs? Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'not at my credit score',
        },
      ],
      knownEmail: 'foster.musicmasters@gmail.com',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/credit|score|600|hard pull|qualify/i);
    expect(suggestions[0].text).not.toMatch(/funding link|i have your email|what problem are you trying to solve/i);
  });

  it('должна чинить stale funding-link suggestion, если lead уточняет кто такой Jonathan после intro outreach', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
          cta: '→ SEND',
        },
      ],
      classification: 'WRONG_NUMBER',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Jonathan with SecureCreditLines here. If the business can benefit from longer term option 10/30 yrs - reply with best email to send terms.',
        },
        {
          direction: 'INBOUND',
          body: 'Who is Jonathan',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/jonathan with securecreditlines here|i help business owners/i);
    expect(suggestions[0].text).toMatch(/best email|send it over/i);
    expect(suggestions[0].text).not.toMatch(/i have your email|sending the funding link there now/i);
  });

  it('должна чинить stale email/funding suggestion, если lead уточняет credit score over 600', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Could a flexible 10/30yr agreement be what your business needs? Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'not at my credit score',
        },
        {
          direction: 'OUTBOUND',
          body: 'You would be surprised! Is it under 500?',
        },
        {
          direction: 'INBOUND',
          body: 'no over 600',
        },
      ],
      knownEmail: 'foster.musicmasters@gmail.com',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/over 600|starter business credit line|qualify|minimum/i);
    expect(suggestions[0].text).not.toMatch(/funding link|i have your email|what problem are you trying to solve/i);
  });

  it('должна использовать notes для callback-aware fallback вместо generic reply', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Marcial, do you want to see if a HELOC is feasible? Need the Address / DOB / Email. Interested?',
        },
        {
          direction: 'INBOUND',
          body: 'I tried to call you back but only got a recording',
        },
      ],
      notes: ['Had $150k Kapitus in 2024'],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/kapitus|payment|working capital/i);
    expect(suggestions[0].text).not.toMatch(/thanks for the update/i);
  });

  it('должна чинить stale funding-link suggestion, если текущий inbound про phone call logistics', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'You got 2m for a quick call?',
        },
        {
          direction: 'OUTBOUND',
          body: "I don't need the call, it's just quicker. I just have a few things I wanted to clarify with you.",
        },
        {
          direction: 'INBOUND',
          body: 'You will have to give me a heads up as well. My phone declines any number not saved',
        },
        {
          direction: 'OUTBOUND',
          body: 'Hello Jacob, do you have 2m for me today?',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/heads-up|save this number|2 minute call|blocked/i);
    expect(suggestions[0].text).not.toMatch(/funding link|what problem are you trying to solve/i);
  });

  it('должна чинить stale funding-link suggestion, если lead подтверждает точное время звонка', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Maryra, if you have been considering a HELOC, I can get one done in 5-7 days. Interested?',
        },
        {
          direction: 'OUTBOUND',
          body: 'Hey Maryra, do you have 2m today for a quick call?',
        },
        {
          direction: 'INBOUND',
          body: 'Yes, call about 3:30pm central time',
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/call you at 3:30pm ct today/i);
    expect(suggestions[0].text).toMatch(/heloc/i);
    expect(suggestions[0].text).not.toMatch(/funding link|what problem are you trying to solve/i);
  });

  it('должна чинить stale funding-link suggestion, если lead просит вернуться через 2 hours', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
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
          body: 'Ok. I just sent you an email with the docs needed to price out options. Can you confirm receipt? Alex@securecreditlines.com',
        },
        {
          direction: 'INBOUND',
          body: "I need 2 hours, I'm a little bit busy at another place",
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/follow up in 2 hours/i);
    expect(suggestions[0].text).toMatch(/review the docs/i);
    expect(suggestions[0].text).not.toMatch(/funding link|what problem are you trying to solve/i);
  });

  it('должна чинить future check-in suggestion, если lead просит вернуться через 2 hours', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: "Hey Lillie, checking in-were you able to review the docs I sent? Let me know if you have questions or if you're ready to move forward on the $20k for equipment.",
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
          body: 'Ok. I just sent you an email with the docs needed to price out options. Can you confirm receipt? Alex@securecreditlines.com',
        },
        {
          direction: 'INBOUND',
          body: "I need 2 hours, I'm a little bit busy at another place",
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/follow up in 2 hours/i);
    expect(suggestions[0].text).toMatch(/review the docs/i);
    expect(suggestions[0].text).not.toMatch(/checking in|ready to move forward/i);
  });

  it('должна использовать email on file и positive confirmation вместо повторного запроса email', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [],
      classification: 'HOT',
      signals: {
        staleState: 'active',
        suggestedReply: null,
        suggestedReengageMessage: null,
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Is this the best email to send terms to jaicksdds@aol.com?',
        },
        {
          direction: 'INBOUND',
          body: 'Yes',
        },
      ],
      knownEmail: 'jaicksdds@aol.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/sending (?:the )?funding link|sending (?:the )?terms/i);
    expect(suggestions[0].text).not.toMatch(/best email/i);
  });

  it('должна чинить hostile-looking email share и не предлагать remove from list', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Understood, removing you from our list. Have a good one.',
          cta: '→ SEND',
        },
      ],
      classification: 'NURTURE',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Could a flexible 10yr agreement be what your business needs? Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'Kissmyass@gmail.com',
        },
      ],
      knownEmail: 'kissmyass@gmail.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/i have your email|sending (?:the )?funding link|sending (?:the )?terms/i);
    expect(suggestions[0].text).not.toMatch(/removing you from our list/i);
  });

  it('должна чинить remove-list suggestion даже если после inbound email уже был follow-up outbound', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Understood, removing you from our list. Best of luck with the business.',
          cta: '→ SEND',
        },
      ],
      classification: 'DEAD',
      signals: {
        staleState: 'active',
      },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Alex with SecureCreditLines again. Could a flexible 10yr agreement be what your business needs? Best email to send terms? Reply STOP to opt out',
        },
        {
          direction: 'INBOUND',
          body: 'Kissmyass@gmail.com',
        },
        {
          direction: 'OUTBOUND',
          body: 'Got it! How much are you looking to receive for the business?',
        },
      ],
      knownEmail: 'kissmyass@gmail.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/i have your email|sending (?:the )?funding link|sending (?:the )?terms/i);
    expect(suggestions[0].text).not.toMatch(/removing you from our list|best of luck/i);
  });

  it('должна использовать manual email received flag для repair даже если email не в последнем inbound', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Absolutely. What is the best email to send the terms to? Once I have it, what problem are you trying to solve in the business?',
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
          body: 'Best email to send terms?',
        },
        {
          direction: 'INBOUND',
          body: 'Yes',
        },
      ],
      knownEmail: 'client@example.com',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/sending (?:the )?funding link|sending (?:the )?terms/i);
    expect(suggestions[0].text).not.toMatch(/best email/i);
  });

  it('не должна подставлять email клиента как адрес rep-а в AI suggestion', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'I need 4 months biz bank statements, your DOB, SSN, and home address. You can reply here or email those to me at brian@awarenessgroup.llc. Once I have that, we can move forward with the unsecured line.',
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
          body: 'Can you respond to my email with the last background info needed? No hard pulls.',
        },
        {
          direction: 'INBOUND',
          body: 'What do you need?',
        },
      ],
      knownEmail: 'brian@awarenessgroup.llc',
      emailReceived: true,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toContain('4 months biz bank statements');
    expect(suggestions[0].text).not.toContain('brian@awarenessgroup.llc');
    expect(suggestions[0].text).toMatch(/reply here|send that over by email/i);
    expect(suggestions[0].text).not.toMatch(/to me at/i);
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

  it('должна чинить stale funding-link suggestion, если lead спрашивает про общие программы', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
          cta: '→ SEND',
        },
      ],
      classification: 'HOT',
      signals: { staleState: 'active' },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Jonathan with SecureCreditLines here. If the business can benefit from longer term options 10/30 yrs - reply with best email to send terms. Reply STOP to opt out',
        },
        { direction: 'INBOUND', body: "what's your general programs" },
        { direction: 'INBOUND', body: 'what are they based on' },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).toMatch(/program|credit line|revolving|based on/i);
    expect(suggestions[0].text).not.toMatch(/i have your email|sending the funding link|i am sending/i);
  });

  it('должна чинить stale funding-link suggestion, если lead спрашивает что предлагаете', () => {
    const suggestions = resolveAiSuggestions({
      suggestions: [
        {
          type: 'BEST',
          text: 'Perfect, I have your email. I am sending the Funding Link there now. While you review it, what problem are you trying to solve in the business, and about how much capital would actually fix it?',
          cta: '→ SEND',
        },
      ],
      classification: 'HOT',
      signals: { staleState: 'active' },
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Jonathan with SecureCreditLines here. We offer longer term business credit line options. Best email to send terms?',
        },
        { direction: 'INBOUND', body: 'what are they based on' },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].text).not.toMatch(/i have your email|sending the funding link|i am sending/i);
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
