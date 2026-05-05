export function phoneDigits(raw?: string | null): string {
  return String(raw || '').replace(/\D/g, '');
}

export function phoneLookupVariants(raw?: string | null): string[] {
  const digits = phoneDigits(raw);
  if (!digits) return [];

  const variants = new Set<string>();
  variants.add(digits);
  variants.add(`+${digits}`);

  if (digits.length === 10) {
    variants.add(`1${digits}`);
    variants.add(`+1${digits}`);
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1);
    variants.add(local);
    variants.add(`+1${local}`);
  }

  return Array.from(variants);
}

export function splitContactName(fullName?: string | null): { firstName: string; lastName: string } {
  const normalized = String(fullName || '').trim();
  if (!normalized) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = normalized.split(/\s+/);
  return { firstName: firstName || '', lastName: rest.join(' ').trim() };
}
