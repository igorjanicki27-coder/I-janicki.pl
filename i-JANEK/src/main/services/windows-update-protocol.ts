export interface WindowsAgentUpdateStatus {
  state?: string
  version?: string
  requestId?: string
  message?: string
  updatedAt?: string
  restartProtocol?: number
  restartPrepared?: boolean
}

export function canExitForWindowsUpdate(status: WindowsAgentUpdateStatus, requestId: string | null, version: string | null) {
  return Boolean(requestId && version && status.requestId === requestId && status.version === version &&
    status.state === 'ready' && status.restartProtocol === 2 && status.restartPrepared === true)
}

export function getWindowsRestartRequestId(argv: string[]) {
  const values = argv.filter(value => value.startsWith('--update-request='))
  if (values.length !== 1) return null
  const value = values[0].slice('--update-request='.length)
  return /^\d+-\d+$/u.test(value) ? value : null
}
