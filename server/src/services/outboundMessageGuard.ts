export interface OutboundMessageGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Hard guard for outbound SMS body before enqueue/send.
 * Prevents known production incidents:
 * 1) unresolved template placeholders like {{company}}
 * 2) accidental QA "test" messages sent to real leads
 */
export function validateOutboundMessageBody(rawBody: string): OutboundMessageGuardResult {
  const body = (rawBody || "").trim();

  if (!body) {
    return { allowed: false, reason: "Message body is empty" };
  }

  if (/\{\{[^{}]+\}\}/.test(body)) {
    return { allowed: false, reason: "Unresolved template token in message body" };
  }

  if (/^test\W*$/i.test(body)) {
    return { allowed: false, reason: "Blocked QA/test message in production flow" };
  }

  return { allowed: true };
}
