import type { PostUpdateNotice } from '../../shared/ipc'

export interface UpdateNoticeState {
  lastVersion?: string
  pendingVersion?: string
  acknowledgedVersion?: string
}

export function advanceUpdateNoticeState(
  version: string,
  state: UpdateNoticeState,
  updatedRestart: boolean,
  existingInstallation: boolean
): UpdateNoticeState {
  const changed = state.lastVersion ? state.lastVersion !== version : existingInstallation
  const pending = state.acknowledgedVersion !== version
    && (changed || updatedRestart || state.pendingVersion === version)
  return {
    lastVersion: version,
    ...(state.acknowledgedVersion ? { acknowledgedVersion: state.acknowledgedVersion } : {}),
    ...(pending ? { pendingVersion: version } : {})
  }
}

export function readPostUpdateNotice(version: string, metadata: unknown): PostUpdateNotice {
  const candidate = metadata as { version?: unknown; notes?: unknown } | null
  return {
    version,
    notes: candidate?.version === version && typeof candidate.notes === 'string' && candidate.notes.trim()
      ? candidate.notes.trim()
      : 'Ta aktualizacja nie zawiera dodatkowego opisu zmian.'
  }
}
