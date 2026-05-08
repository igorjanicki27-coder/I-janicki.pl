import os from 'node:os'
import { app } from 'electron'
import nodeMachineId from 'node-machine-id'
import type { SystemContext } from '@shared/contracts'
import { localStore } from '../store'

const { machineIdSync } = nodeMachineId

export function getSystemContext(): SystemContext {
  const hostname = os.hostname()
  const machineId = machineIdSync(true)
  const registeredDeviceId = localStore.get('registeredDeviceId')?.trim()

  return {
    deviceId: registeredDeviceId || `${hostname}-${machineId}`,
    machineId,
    hostname,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged
  }
}
