import type { DeviceRecord } from '@shared/contracts'

type MasterDeviceLabelSource = Pick<DeviceRecord, 'deviceAlias' | 'hostname'>

export function formatDeviceLabelForMaster(device?: MasterDeviceLabelSource | null) {
  if (!device) return 'Urządzenie'

  const deviceName = device.deviceAlias?.trim() || device.hostname?.trim() || ''

  if (deviceName) return deviceName
  return 'Urządzenie'
}
