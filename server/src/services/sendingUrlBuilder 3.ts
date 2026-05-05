export function buildTwilioStatusCallbackUrl(webhookBaseUrl: string): string {
  const trimmedBase = webhookBaseUrl.endsWith('/') ? webhookBaseUrl.slice(0, -1) : webhookBaseUrl;
  return `${trimmedBase}/api/webhooks/twilio/status`;
}
