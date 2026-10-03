import './env'
import Store from 'electron-store'
import type { BackupSnapshot, ConsentRecord, ThemeMode, UpdateChannel } from '@shared/contracts'

export interface LocalSchema {
  theme: ThemeMode
  consent?: ConsentRecord | null
  autoLaunch: boolean
  notificationsEnabled: boolean
  updateChannel: UpdateChannel
  registeredDeviceId?: string | null
  backupManifest: Record<string, BackupSnapshot & { fileStates: Record<string, number> }>
}

export const localStore = new Store<LocalSchema>({
  defaults: {
    theme: 'dark',
    autoLaunch: true,
    notificationsEnabled: true,
    updateChannel: 'stable',
    registeredDeviceId: null,
    backupManifest: {}
  }
})
