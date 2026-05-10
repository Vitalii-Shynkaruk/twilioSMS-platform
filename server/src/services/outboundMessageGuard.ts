export interface OutboundMessageGuardResult {
  allowed: boolean;
  reason?: string;
}

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
