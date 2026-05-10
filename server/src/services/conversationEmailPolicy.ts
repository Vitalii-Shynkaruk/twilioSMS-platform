export type ConversationEmailRecipientSource = 'TEXTED' | 'LEAD' | 'CONTACT' | 'NONE';

export interface ConversationEmailRecipientInput {
  textedEmail?: string | null;
  leadEmail?: string | null;
  contactEmail?: string | null;
}

export interface ConversationEmailRecipientResult {
  email: string;
  source: ConversationEmailRecipientSource;
  textedEmail: string | null;
  leadEmail: string | null;
  contactEmail: string | null;
}

function normalizeEmailCandidate(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveConversationEmailRecipient(
  input: ConversationEmailRecipientInput,
): ConversationEmailRecipientResult {
  const textedEmail = normalizeEmailCandidate(input.textedEmail);
  const leadEmail = normalizeEmailCandidate(input.leadEmail);
  const contactEmail = normalizeEmailCandidate(input.contactEmail);

  if (textedEmail) {
    return {
      email: textedEmail,
      source: 'TEXTED',
      textedEmail,
      leadEmail: leadEmail || null,
      contactEmail: contactEmail || null,
    };
  }

  if (leadEmail) {
    return {
      email: leadEmail,
      source: 'LEAD',
      textedEmail: null,
      leadEmail,
      contactEmail: contactEmail || null,
    };
  }

  if (contactEmail) {
    return {
      email: contactEmail,
      source: 'CONTACT',
      textedEmail: null,
      leadEmail: null,
      contactEmail,
    };
  }

  return {
    email: '',
    source: 'NONE',
    textedEmail: null,
    leadEmail: null,
    contactEmail: null,
  };
}
