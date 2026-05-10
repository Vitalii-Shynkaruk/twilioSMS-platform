export function isWithinQuietHoursWindow(currentHour: number, quietHoursStart: number, quietHoursEnd: number): boolean {
  if (quietHoursStart > quietHoursEnd) {
    return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
  }
  return currentHour >= quietHoursStart && currentHour < quietHoursEnd;
}

function getTimeZoneLabel(timezone: string): string {
  if (timezone === 'America/New_York') return 'ET';
  if (timezone === 'America/Chicago') return 'CT';
  if (timezone === 'America/Denver') return 'MT';
  if (timezone === 'America/Los_Angeles') return 'PT';
  return timezone;
}

export function formatQuietHoursEnd(quietHoursEnd: number, timezone: string): string {
  const normalizedHour = ((quietHoursEnd % 24) + 24) % 24;
  const hour12 = normalizedHour % 12 || 12;
  const meridiem = normalizedHour >= 12 ? 'PM' : 'AM';
  const timezoneLabel = getTimeZoneLabel(timezone);

  return `${hour12}:00 ${meridiem}${timezoneLabel ? ` ${timezoneLabel}` : ''}`;
}

export function buildQuietHoursReason(quietHoursEnd: number, timezone: string): string {
  return `Quiet hours until ${formatQuietHoursEnd(quietHoursEnd, timezone)}`;
}
