import type { CompanyChatMessage } from '@shared/contracts'

export type ConversationTimelineEntry =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'message'; id: string; message: CompanyChatMessage }

function formatTimelineDate(timestamp: number) {
  const date = new Date(timestamp)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}r.`
}

export function buildConversationTimeline(messages: CompanyChatMessage[]): ConversationTimelineEntry[] {
  const timeline: ConversationTimelineEntry[] = []
  let lastDayLabel = ''

  for (const message of messages) {
    const dayLabel = formatTimelineDate(message.createdAt)
    if (dayLabel !== lastDayLabel) {
      timeline.push({
        kind: 'day',
        id: `day-${dayLabel}`,
        label: dayLabel
      })
      lastDayLabel = dayLabel
    }

    timeline.push({
      kind: 'message',
      id: message.id,
      message
    })
  }

  return timeline
}
