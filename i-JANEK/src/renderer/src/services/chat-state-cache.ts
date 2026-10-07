import type { CompanyChatParticipant, CompanyChatParticipantState } from '@shared/contracts'

const STORAGE_KEY = 'i-janek-pending-chat-state-v1'

export interface PendingChatParticipantState {
  ownerUid: string
  participant: CompanyChatParticipant
  email: string
  lastDeliveredAt: number
  lastReadAt: number
  updatedAt: number
}

type PendingChatStateRecord = Record<string, PendingChatParticipantState>

function cacheKey(ownerUid: string, participant: CompanyChatParticipant) {
  return `${participant}:${ownerUid}`
}

function isPendingChatParticipantState(value: unknown): value is PendingChatParticipantState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PendingChatParticipantState>
  return (
    typeof candidate.ownerUid === 'string'
    && (candidate.participant === 'master' || candidate.participant === 'slave')
    && typeof candidate.email === 'string'
    && typeof candidate.lastDeliveredAt === 'number'
    && typeof candidate.lastReadAt === 'number'
    && typeof candidate.updatedAt === 'number'
  )
}

function readRecord(): PendingChatStateRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => isPendingChatParticipantState(value))
    )
  } catch {
    return {}
  }
}

function writeRecord(record: PendingChatStateRecord) {
  try {
    if (Object.keys(record).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Brak pamięci lokalnej nie powinien zatrzymywać komunikatora.
  }
}

export function readPendingChatParticipantState(
  ownerUid: string,
  participant: CompanyChatParticipant,
  email: string
) {
  const pending = readRecord()[cacheKey(ownerUid, participant)]
  return pending?.email.toLocaleLowerCase() === email.toLocaleLowerCase() ? pending : null
}

export function persistPendingChatParticipantState(
  ownerUid: string,
  participant: CompanyChatParticipant,
  state: CompanyChatParticipantState
) {
  const record = readRecord()
  const key = cacheKey(ownerUid, participant)
  const current = record[key]
  const pending: PendingChatParticipantState = {
    ownerUid,
    participant,
    email: state.email,
    lastDeliveredAt: Math.max(current?.lastDeliveredAt ?? 0, state.lastDeliveredAt),
    lastReadAt: Math.max(current?.lastReadAt ?? 0, state.lastReadAt),
    updatedAt: Math.max(current?.updatedAt ?? 0, state.updatedAt)
  }
  record[key] = pending
  writeRecord(record)
  return pending
}

export function acknowledgePendingChatParticipantState(
  ownerUid: string,
  participant: CompanyChatParticipant,
  email: string,
  confirmedState: Pick<CompanyChatParticipantState, 'lastDeliveredAt' | 'lastReadAt'>
) {
  const record = readRecord()
  const key = cacheKey(ownerUid, participant)
  const pending = record[key]
  if (!pending || pending.email.toLocaleLowerCase() !== email.toLocaleLowerCase()) return
  if (
    confirmedState.lastDeliveredAt < pending.lastDeliveredAt
    || confirmedState.lastReadAt < pending.lastReadAt
  ) return
  delete record[key]
  writeRecord(record)
}
