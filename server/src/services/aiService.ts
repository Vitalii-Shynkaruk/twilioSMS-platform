import Anthropic from '@anthropic-ai/sdk';
import prisma from '../config/database';
import logger from '../config/logger';

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
  private static getSystemPrompt(isCA: boolean): string {
    const caBlock = isCA
      ? `\n\nCA COMPLIANCE MODE: California consumer detected. Do NOT propose discussing APR, interest rates, factor rates, or specific cost-of-capital numbers in suggestions. Redirect any rate question to disclosure docs or licensed advisor only.`
      : '';

    return `You are an AI assistant helping sales reps at SCL Capital, a private lending brokerage.

METHODOLOGY: Gap Selling (Keenan). Every suggestion must reference a gap — the cost of the problem if unfilled.
TONE: Direct, confident, Patrick Bet-David energy. Never soft, never overly formal, never apologetic.
TERMINOLOGY: Never say "application" — always say "Funding Link."
PRODUCTS: MCA, LOC (Line of Credit), SBA, Equipment financing, CRE, Bridge, HELOC, Invoice Factoring. Match the product to what the lead actually describes.
REVENUE NORMALIZATION: annual ÷ 12 = monthly. Range → midpoint. Always store both monthly and annual as integers (no $ or commas).
BEST SUGGESTION LOGIC: HOT + urgency = aggressive close. WARM + evaluating = consultative. Always exactly 2 suggestions: one BEST, one ALT. Never 3.

CLASSIFICATION RULES (apply strictly to the LATEST inbound message):
- HOT — lead shares contact info (email address, alternate phone), explicitly says yes / interested / ready / send it / let's do it, asks for terms/Funding Link/docs/rate/amount, requests a call back, gives revenue numbers, names urgency (today / this week / ASAP / now / 30 days). ANY ONE of these = HOT. Sharing an email is the #1 buy-signal — always HOT.
- WARM — engaged but exploring: "how does it work", "tell me more", asks general questions without committing, gives partial info.
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
    "objections": "rate sensitive" | "has other offers" | <other short label> | null
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
    signals: Record<string, unknown>;
    suggestions: { type: string; text: string; cta: string }[];
  } | null> {
    const cfg = await this.getConfig();
    if (!cfg) return null;

    // Подгружаем контекст: лид + последние ~20 сообщений + sticky number area code
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
        stickyNumber: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!conv) {
      logger.warn('AI: classifyInbound — conversation not found', { conversationId });
      return null;
    }

    const messagesAsc = [...conv.messages].reverse();
    const lastInbound = messagesAsc.filter((m) => m.direction === 'INBOUND').pop();

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

    const systemPrompt = this.getSystemPrompt(isCA);

    const userBlock = [
      `Lead: ${conv.lead?.firstName || ''} ${conv.lead?.lastName || ''}`.trim() || 'Unknown',
      conv.lead?.company ? `Business: ${conv.lead.company}` : null,
      conv.lead?.phone ? `Phone: ${conv.lead.phone} (area ${areaCode || 'n/a'})` : null,
      '',
      'Conversation history (oldest → newest):',
      ...messagesAsc.map((m) => `[${m.direction}] ${m.body}`),
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
      // На всякий случай вырежем markdown-обёртку если LLM нарушил инструкцию
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      logger.error('AI: classifyInbound JSON parse failed', {
        conversationId,
        snippet: raw.slice(0, 200),
      });
      return null;
    }

    const signals = parsed.signals || {};
    let classification: string = ['HOT', 'WARM', 'NURTURE', 'DEAD', 'WRONG_NUMBER'].includes(parsed.classification)
      ? parsed.classification
      : 'NURTURE';

    // Детерминированный override: явные buy-signals в последнем входящем → HOT.
    // Защита от случаев, когда LLM недооценивает "контактный" ответ (email, телефон,
    // короткое "yes / send it"). Email-share — самый сильный сигнал интента.
    const lastInboundBody = (lastInbound?.body || '').trim();
    if (lastInboundBody && classification !== 'DEAD' && classification !== 'WRONG_NUMBER') {
      const lower = lastInboundBody.toLowerCase();
      const hasEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(lastInboundBody);
      // "yes" / "yeah" / "yep" / "sure" / "ok" / "send it" / "sounds good" / "i'm in" / "lets do it"
      const strongYes =
        /^(yes|yeah|yep|yup|sure|ok(ay)?|sounds good|i('?m| am)? in|let'?s (do it|go)|send (it|the)?|i'?m interested|interested|please send|send me|go ahead)\b/.test(
          lower,
        );
      const asksForTerms = /\b(rate|terms|amount|how much|funding link|application|details|info|paperwork|docs?)\b/.test(
        lower,
      );
      const givesUrgency = /\b(today|asap|right now|this week|tomorrow|by (monday|tuesday|wednesday|thursday|friday)|need (it )?(now|soon))\b/.test(
        lower,
      );
      const sharesAltPhone = /(?:^|\D)(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?:\D|$)/.test(
        lastInboundBody,
      );

      if ((hasEmail || strongYes || asksForTerms || givesUrgency || sharesAltPhone) && classification !== 'HOT') {
        logger.info('AI: classification upgraded to HOT by deterministic override', {
          conversationId,
          original: classification,
          triggers: { hasEmail, strongYes, asksForTerms, givesUrgency, sharesAltPhone },
        });
        classification = 'HOT';
      }
    }

    // Локальный пересчёт scoring (стабильнее чем доверять LLM)
    const leadScore = this.computeLeadScore({
      classification,
      revenueMonthly: typeof signals.revenueMonthly === 'number' ? signals.revenueMonthly : null,
      askLabel: typeof signals.ask === 'string' ? signals.ask : null,
      urgency: typeof signals.urgency === 'string' ? signals.urgency : null,
      lastInboundAt: lastInbound?.createdAt || null,
    });

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s: any) => s && typeof s.text === 'string')
          .slice(0, 2)
          .map((s: any) => ({
            type: s.type === 'BEST' ? 'BEST' : 'ALT',
            text: String(s.text),
            cta: String(s.cta || ''),
          }))
      : [];

    logger.info('AI: classifyInbound complete', {
      conversationId,
      provider: cfg.provider,
      model: cfg.model,
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
