export function isWithinQuietHoursWindow(currentHour: number, quietHoursStart: number, quietHoursEnd: number): boolean {
  // Handle overnight quiet hours (e.g., 20:00 - 09:00)
  if (quietHoursStart > quietHoursEnd) {
    return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
  }
  return currentHour >= quietHoursStart && currentHour < quietHoursEnd;
}
