interface InboxAiPriorityInput {
  aiClassification?: unknown
  followupStatus?: unknown
}

function normalizeAiClassification(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function normalizeFollowupStatus(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function computeInboxAiPriorityRank(input: InboxAiPriorityInput): number {
  if (normalizeFollowupStatus(input.followupStatus) === 'due_now') return 1

  switch (normalizeAiClassification(input.aiClassification)) {
    case 'HOT':
      return 2
    case 'WARM':
      return 3
    case 'SENSITIVE':
    case 'NURTURE':
      return 4
    case 'DEAD':
    case 'WRONG_NUMBER':
      return 5
    default:
      return 9
  }
}

export function withInboxAiPriorityRank<T extends Record<string, unknown>>(
  current: InboxAiPriorityInput,
  data: T,
): T & { aiPriorityRank: number } {
  const nextAiClassification = Object.prototype.hasOwnProperty.call(data, 'aiClassification')
    ? data.aiClassification
    : current.aiClassification
  const nextFollowupStatus = Object.prototype.hasOwnProperty.call(data, 'followupStatus')
    ? data.followupStatus
    : current.followupStatus

  return {
    ...data,
    aiPriorityRank: computeInboxAiPriorityRank({
      aiClassification: nextAiClassification,
      followupStatus: nextFollowupStatus,
    }),
  }
}