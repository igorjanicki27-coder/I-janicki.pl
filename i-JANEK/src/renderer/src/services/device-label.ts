import type { DeviceRecord } from '@shared/contracts'

type MasterDeviceLabelSource = Pick<DeviceRecord, 'companyName' | 'deviceAlias' | 'hostname'>

export function formatDeviceLabelForMaster(device?: MasterDeviceLabelSource | null) {
  if (!device) return 'Urzadzenie'

  const companyName = device.companyName?.trim() ?? ''
  const deviceName = device.deviceAlias?.trim() || device.hostname?.trim() || ''

  if (companyName && deviceName) return `${companyName}_${deviceName}`
  if (deviceName) return deviceName
  if (companyName) return companyName
  return 'Urzadzenie'
}
