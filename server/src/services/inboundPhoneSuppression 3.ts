function digitsOnly(raw?: string | null): string {
  return String(raw || '').replace(/\D/g, '');
}

export function parseRepTestPhoneAllowlist(raw?: string | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const normalized = new Set<string>();
  for (const part of parts) {
    const digits = digitsOnly(part);
    if (!digits) continue;
    normalized.add(digits);
    if (digits.length === 11 && digits.startsWith('1')) {
      normalized.add(digits.slice(1));
    }
    if (digits.length === 10) {
      normalized.add(`1${digits}`);
    }
  }

  return Array.from(normalized);
}

export function isRepOrTestPhoneNumber(phone: string, suppressedNumbers: string[]): boolean {
  const candidate = digitsOnly(phone);
  if (!candidate) return false;

  const set = new Set(suppressedNumbers.map((num) => digitsOnly(num)).filter(Boolean));

  if (set.has(candidate)) return true;
  if (candidate.length === 11 && candidate.startsWith('1') && set.has(candidate.slice(1))) return true;
  if (candidate.length === 10 && set.has(`1${candidate}`)) return true;
  return false;
}
