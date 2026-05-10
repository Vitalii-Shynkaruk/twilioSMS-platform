export function isFeatureFlagEnabled(rawValue: string | undefined, defaultValue: boolean = false): boolean {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}
