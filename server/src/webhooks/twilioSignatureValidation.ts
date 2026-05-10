import { validateRequest } from 'twilio';

type TwilioRequestValidator = (
  authToken: string,
  signature: string,
  url: string,
  body: Record<string, any>,
) => boolean;

export function shouldSkipTwilioSignatureValidation(env: string, authToken?: string): boolean {
  return env === 'development' && !authToken;
}

export function getTwilioSignatureHeader(rawSignature: unknown): string | null {
  if (typeof rawSignature !== 'string') return null;
  const normalized = rawSignature.trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildTwilioValidationUrl(webhookBaseUrl: string, originalUrl: string): string {
  return `${webhookBaseUrl}${originalUrl}`;
}

export function isTwilioSignatureValid(
  authToken: string,
  signature: string,
  url: string,
  body: Record<string, any>,
  validator: TwilioRequestValidator = validateRequest,
): boolean {
  return validator(authToken, signature, url, body);
}
