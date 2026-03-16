import prisma from '../config/database';
import logger from '../config/logger';

/**
 * AIService - OpenAI integration for SMS draft replies and classification.
 * Reads API key and model from SystemSetting DB table.
 */
export class AIService {
  private static async getConfig(): Promise<{ apiKey: string; model: string } | null> {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['openaiApiKey', 'openaiModel'] } },
    });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    if (!map.openaiApiKey) {
      return null;
    }

    return {
      apiKey: String(map.openaiApiKey),
      model: String(map.openaiModel || 'gpt-4.1-mini'),
    };
  }

  /**
   * Generate a draft reply for a conversation.
   * Returns the draft text or null if AI is not configured.
   */
  static async generateDraftReply(
    conversationHistory: { direction: string; body: string }[],
    leadInfo: { firstName?: string; lastName?: string; status?: string },
  ): Promise<string | null> {
    const cfg = await this.getConfig();
    if (!cfg) {
      logger.warn('AI: OpenAI not configured (missing API key)');
      return null;
    }

    const systemPrompt = `You are an SMS assistant for a business lending company called Secure Credit Lines. 
You draft professional, concise SMS replies. Keep messages under 160 characters when possible. 
Be friendly but professional. Never make promises about approval or specific terms.
The lead's name is ${leadInfo.firstName || 'Unknown'} ${leadInfo.lastName || ''}.
Lead status: ${leadInfo.status || 'Unknown'}.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.map((m) => ({
        role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.body,
      })),
      { role: 'user' as const, content: 'Draft a reply to the last message.' },
    ];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        logger.error('AI: OpenAI API error', { status: response.status, error: err });
        return null;
      }

      const data: any = await response.json();
      const draft = data.choices?.[0]?.message?.content?.trim();
      logger.info('AI: Draft reply generated', { model: cfg.model, length: draft?.length });
      return draft || null;
    } catch (err) {
      logger.error('AI: Failed to generate draft reply', { error: (err as Error).message });
      return null;
    }
  }

  /**
   * Classify an inbound message intent.
   * Returns one of: interested, not_interested, question, follow_up, complaint, other
   */
  static async classifyMessage(body: string): Promise<string | null> {
    const cfg = await this.getConfig();
    if (!cfg) return null;

    const messages = [
      {
        role: 'system' as const,
        content: `Classify this SMS reply into one of these categories: interested, not_interested, question, follow_up, complaint, other. Reply with ONLY the category name, nothing else.`,
      },
      { role: 'user' as const, content: body },
    ];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: 20,
          temperature: 0,
        }),
      });

      if (!response.ok) return null;

      const data: any = await response.json();
      const category = data.choices?.[0]?.message?.content?.trim().toLowerCase();
      logger.info('AI: Message classified', { category, model: cfg.model });
      return category || null;
    } catch (err) {
      logger.error('AI: Classification failed', { error: (err as Error).message });
      return null;
    }
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

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 10,
          temperature: 0,
        }),
      });

      if (!response.ok) return null;

      const data: any = await response.json();
      const scoreStr = data.choices?.[0]?.message?.content?.trim();
      const score = parseInt(scoreStr, 10);
      return isNaN(score) ? null : Math.max(0, Math.min(100, score));
    } catch (err) {
      logger.error('AI: Lead scoring failed', { error: (err as Error).message });
      return null;
    }
  }
}
