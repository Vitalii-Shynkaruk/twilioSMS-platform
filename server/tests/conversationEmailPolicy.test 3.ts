import { describe, expect, it } from 'vitest';
import { resolveConversationEmailRecipient } from '../src/services/conversationEmailPolicy';

describe('Conversation email policy', () => {
  it('должна предпочитать texted email над lead-list email', () => {
    const result = resolveConversationEmailRecipient({
      textedEmail: 'Shawnthai@gmail.com',
      leadEmail: 'pinkpolishnaillounge@gmail.com',
    });

    expect(result.email).toBe('Shawnthai@gmail.com');
    expect(result.source).toBe('TEXTED');
    expect(result.leadEmail).toBe('pinkpolishnaillounge@gmail.com');
  });

  it('должна использовать lead-list email, если texted email отсутствует', () => {
    const result = resolveConversationEmailRecipient({
      textedEmail: null,
      leadEmail: 'lead@example.com',
    });

    expect(result.email).toBe('lead@example.com');
    expect(result.source).toBe('LEAD');
  });

  it('должна использовать contact email как последний fallback', () => {
    const result = resolveConversationEmailRecipient({
      textedEmail: '',
      leadEmail: ' ',
      contactEmail: ' deal-client@example.com ',
    });

    expect(result.email).toBe('deal-client@example.com');
    expect(result.source).toBe('CONTACT');
  });
});
