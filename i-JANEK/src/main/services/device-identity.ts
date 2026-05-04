import os from 'node:os'
import { app } from 'electron'
import { machineIdSync } from 'node-machine-id'
import type { SystemContext } from '@shared/contracts'

export function getSystemContext(): SystemContext {
  const hostname = os.hostname()
  const machineId = machineIdSync(true)

  return {
    deviceId: `${hostname}-${machineId}`,
    machineId,
    hostname,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged
  }
}
