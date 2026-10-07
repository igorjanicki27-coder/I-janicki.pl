import type { DeviceTelemetry, InventoryReport, UsageRollupDelta } from '@shared/contracts'

const STORAGE_KEY = 'i-janek-offline-operations-v1'
const MAX_OPERATIONS = 200

export type OfflineOperation =
  | {
      id: string
      kind: 'telemetry'
      deviceId: string
      createdAt: number
      attempts: number
      payload: DeviceTelemetry
    }
  | {
      id: string
      kind: 'inventory'
      deviceId: string
      createdAt: number
      attempts: number
      payload: InventoryReport
    }
  | {
      id: string
      kind: 'usage_rollup'
      deviceId: string
      createdAt: number
      attempts: number
      payload: UsageRollupDelta
    }

function isOperation(value: unknown): value is OfflineOperation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<OfflineOperation>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.deviceId === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.attempts === 'number' &&
    ['telemetry', 'inventory', 'usage_rollup'].includes(String(candidate.kind))
  )
}

export function readOfflineQueue(): OfflineOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const operations = parsed.filter(isOperation).sort((a, b) => a.createdAt - b.createdAt)
    if (operations.length !== parsed.length) writeOfflineQueue(operations)
    return operations
  } catch {
    return []
  }
}

function writeOfflineQueue(operations: OfflineOperation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(operations.slice(-MAX_OPERATIONS)))
}

export function countUserFacingOfflineOperations(operations = readOfflineQueue()) {
  return operations.filter((entry) => entry.kind !== 'usage_rollup').length
}

export function enqueueOfflineOperation(
  operation: Omit<OfflineOperation, 'id' | 'createdAt' | 'attempts'>
) {
  const operations = readOfflineQueue()
  const next: OfflineOperation = {
    ...operation,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0
  } as OfflineOperation

  // Telemetria i inwentaryzacja są migawkami — zachowujemy wyłącznie najnowszą na urządzenie.
  if (next.kind === 'usage_rollup') {
    const existing = operations.find(
      (entry): entry is Extract<OfflineOperation, { kind: 'usage_rollup' }> =>
        entry.kind === 'usage_rollup' && entry.deviceId === next.deviceId && entry.payload.dayKey === next.payload.dayKey
    )
    if (existing) {
      const merged: OfflineOperation = {
        ...existing,
        payload: {
          dayKey: existing.payload.dayKey,
          observedSeconds: existing.payload.observedSeconds + next.payload.observedSeconds,
          cpuObservedSeconds: existing.payload.cpuObservedSeconds + next.payload.cpuObservedSeconds,
          cpuOver80Seconds: existing.payload.cpuOver80Seconds + next.payload.cpuOver80Seconds,
          gpuObservedSeconds: existing.payload.gpuObservedSeconds + next.payload.gpuObservedSeconds,
          gpuOver80Seconds: existing.payload.gpuOver80Seconds + next.payload.gpuOver80Seconds,
          ramObservedSeconds: existing.payload.ramObservedSeconds + next.payload.ramObservedSeconds,
          ramOver80Seconds: existing.payload.ramOver80Seconds + next.payload.ramOver80Seconds,
          diskObservedSeconds: existing.payload.diskObservedSeconds + next.payload.diskObservedSeconds,
          diskOver80Seconds: existing.payload.diskOver80Seconds + next.payload.diskOver80Seconds,
          anyOver80Seconds: existing.payload.anyOver80Seconds + next.payload.anyOver80Seconds,
          restartCount: existing.payload.restartCount + next.payload.restartCount,
          sampleCount: existing.payload.sampleCount + next.payload.sampleCount
        }
      }
      const updated = operations.map((entry) => (entry.id === existing.id ? merged : entry))
      writeOfflineQueue(updated)
      return countUserFacingOfflineOperations(updated)
    }
  }

  const shouldDedupeSnapshot = next.kind === 'telemetry' || next.kind === 'inventory'
  const withoutStaleSnapshots = shouldDedupeSnapshot
    ? operations.filter((entry) => !(entry.kind === next.kind && entry.deviceId === next.deviceId))
    : operations
  const updated = [...withoutStaleSnapshots, next].slice(-MAX_OPERATIONS)
  writeOfflineQueue(updated)
  return countUserFacingOfflineOperations(updated)
}

export function markOfflineOperationAttempt(id: string) {
  const updated = readOfflineQueue().map((entry) =>
    entry.id === id ? { ...entry, attempts: entry.attempts + 1 } : entry
  )
  writeOfflineQueue(updated)
  return countUserFacingOfflineOperations(updated)
}

export function removeOfflineOperation(id: string) {
  const updated = readOfflineQueue().filter((entry) => entry.id !== id)
  writeOfflineQueue(updated)
  return countUserFacingOfflineOperations(updated)
}
