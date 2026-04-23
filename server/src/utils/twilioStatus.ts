const BLOCKED_ERROR_CODES = new Set(['21610', '30007', '30034']);

export function normalizeTwilioErrorCode(code: unknown): string | null {
  if (code === null || code === undefined) return null;
  const normalized = String(code).trim();
  return normalized.length > 0 ? normalized : null;
}

export function isBlockedTwilioError(code: unknown): boolean {
  const normalized = normalizeTwilioErrorCode(code);
  if (!normalized) return false;
  return BLOCKED_ERROR_CODES.has(normalized);
}
