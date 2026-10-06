import type { DeviceRecord } from '@shared/contracts'

export const DEVICE_ONLINE_TIMEOUT_MS = 5 * 60 * 1000

export function isDeviceOnline(device: DeviceRecord, now: number) {
  return !device.offline && device.lastSeenAt > 0 && now - device.lastSeenAt < DEVICE_ONLINE_TIMEOUT_MS
}
