import './env'
import Store from 'electron-store'
import type { ConsentRecord, ThemeMode, UpdateChannel } from '@shared/contracts'

export interface LocalSchema {
  theme: ThemeMode
  consent?: ConsentRecord | null
  autoLaunch: boolean
  notificationsEnabled: boolean
  updateChannel: UpdateChannel
  registeredDeviceId?: string | null
}

export const localStore = new Store<LocalSchema>({
  defaults: {
    theme: 'dark',
    autoLaunch: true,
    notificationsEnabled: true,
    updateChannel: 'stable',
    registeredDeviceId: null
  }
})
