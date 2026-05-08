import { describe, expect, it } from 'vitest'
import { InboxController } from '../src/controllers/inboxController'
import { computeInboxAiPriorityRank } from '../src/utils/inboxAiPriority'

describe('AI Priority sort', () => {
  it('должна ранжировать due_now выше HOT, WARM и остальных классов', () => {
    expect(computeInboxAiPriorityRank({ followupStatus: 'due_now', aiClassification: 'WARM' })).toBe(1)
    expect(computeInboxAiPriorityRank({ followupStatus: 'cleared', aiClassification: 'HOT' })).toBe(2)
    expect(computeInboxAiPriorityRank({ followupStatus: 'completed', aiClassification: 'WARM' })).toBe(3)
    expect(computeInboxAiPriorityRank({ followupStatus: 'scheduled', aiClassification: 'NURTURE' })).toBe(4)
    expect(computeInboxAiPriorityRank({ aiClassification: 'WRONG_NUMBER' })).toBe(5)
    expect(computeInboxAiPriorityRank({ aiClassification: null, followupStatus: null })).toBe(9)
  })

  it('должна поддерживать SENSITIVE tier без изменения порядка для NURTURE', () => {
    expect(computeInboxAiPriorityRank({ aiClassification: 'SENSITIVE' })).toBe(4)
    expect(computeInboxAiPriorityRank({ aiClassification: 'NURTURE' })).toBe(4)
  })

  it('должна сортировать ai_priority по rank и затем по свежести', () => {
    const helper = InboxController as unknown as {
      buildOrderBy: (sort: 'ai_priority') => Array<Record<string, 'asc' | 'desc'>>
    }

    expect(helper.buildOrderBy('ai_priority')).toEqual([
      { aiPriorityRank: 'asc' },
      { lastMessageAt: 'desc' },
      { updatedAt: 'desc' },
    ])
  })
})