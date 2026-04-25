export function shouldSuppressRetargetForRecentInbound(
  lastRepliedAt: Date | string | null | undefined,
  now: Date = new Date(),
  days: number = 7,
): boolean {
  if (!lastRepliedAt) return false;

  const repliedAt = lastRepliedAt instanceof Date ? lastRepliedAt : new Date(lastRepliedAt);
  if (Number.isNaN(repliedAt.getTime())) return false;

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return repliedAt >= cutoff;
}
